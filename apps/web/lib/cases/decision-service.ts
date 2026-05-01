import { z } from "zod";
import {
  prisma,
  getCaseWorkspaceForOrganization,
  createApprovalDecision,
  updateCaseStatusForOrganization,
  createAuditEvent,
} from "@regops-ai/database";
import { hasPermission, type Permission, type OrganizationRole } from "@/lib/auth/rbac";
import type { ApprovalDecisionType, CaseStatus } from "@regops-ai/database";

export interface ActorContext {
  userId: string;
  organizationId: string;
  role: OrganizationRole;
}

function assertPermission(ctx: ActorContext, permission: Permission): void {
  if (!hasPermission(ctx.role, permission)) {
    throw new Error(`Forbidden: missing permission ${permission}`);
  }
}

const TERMINAL_STATUSES: CaseStatus[] = ["APPROVED", "REJECTED", "CLOSED"];

const makeFinalDecisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT", "ESCALATE", "REQUEST_MORE_INFORMATION", "CLOSE_NO_ACTION"]),
  reason: z.string().min(1, "Reason is required").max(10000, "Reason must be 10,000 characters or less"),
});

function decisionToStatus(decision: ApprovalDecisionType): CaseStatus {
  switch (decision) {
    case "APPROVE":
      return "APPROVED";
    case "REJECT":
      return "REJECTED";
    case "ESCALATE":
      return "ESCALATED";
    case "REQUEST_MORE_INFORMATION":
      return "IN_REVIEW";
    case "CLOSE_NO_ACTION":
      return "CLOSED";
    default:
      throw new Error(`Unknown decision type: ${decision}`);
  }
}

interface EvidenceSnapshot {
  case: {
    id: string;
    title: string;
    status: string;
    riskLevel: string;
    createdAt: string;
    updatedAt: string;
    assignedToUserId: string | null;
  };
  subject: {
    type: "individual" | "business";
    id: string;
    name: string;
    riskLevel: string;
    status: string;
  } | null;
  documents: {
    id: string;
    documentType: string;
    filename: string;
    createdAt: string;
  }[];
  transactions: {
    count: number;
    latest: {
      id: string;
      externalReference: string | null;
      direction: string;
      amount: string;
      currency: string;
      counterpartyName: string | null;
      occurredAt: string;
    }[];
  };
  riskSignals: {
    id: string;
    ruleId: string;
    title: string;
    severity: string;
    createdAt: string;
  }[];
  riskMemos: {
    latestId: string | null;
    count: number;
    latestAcceptedAt: string | null;
  };
  notes: {
    count: number;
    noteIds: string[];
  };
  decisionMetadata: {
    reviewerUserId: string;
    decision: string;
    reasonLength: number;
    timestamp: string;
  };
}

function buildEvidenceSnapshot(
  caseData: Awaited<ReturnType<typeof getCaseWorkspaceForOrganization>> & { riskMemos?: { id: string; acceptedAt: Date | null }[] },
  decision: ApprovalDecisionType,
  reason: string,
  reviewerUserId: string
): EvidenceSnapshot {
  if (!caseData) {
    throw new Error("Case data required for evidence snapshot");
  }

  const subject = caseData.customerProfile
    ? {
        type: "individual" as const,
        id: caseData.customerProfile.id,
        name: `${caseData.customerProfile.firstName} ${caseData.customerProfile.lastName}`,
        riskLevel: caseData.customerProfile.riskLevel,
        status: caseData.customerProfile.status,
      }
    : caseData.businessProfile
      ? {
          type: "business" as const,
          id: caseData.businessProfile.id,
          name: caseData.businessProfile.legalName,
          riskLevel: caseData.businessProfile.riskLevel,
          status: caseData.businessProfile.status,
        }
      : null;

  return {
    case: {
      id: caseData.id,
      title: caseData.title,
      status: caseData.status,
      riskLevel: caseData.riskLevel,
      createdAt: caseData.createdAt.toISOString(),
      updatedAt: caseData.updatedAt.toISOString(),
      assignedToUserId: caseData.assignedToUserId,
    },
    subject,
    documents: (caseData.documents ?? []).map((d) => ({
      id: d.id,
      documentType: d.type,
      filename: d.originalFileName,
      createdAt: d.createdAt.toISOString(),
    })),
    transactions: {
      count: caseData.transactions?.length ?? 0,
      latest: (caseData.transactions ?? []).map((t) => ({
        id: t.id,
        externalReference: t.externalReference,
        direction: t.direction,
        amount: t.amount.toString(),
        currency: t.currency,
        counterpartyName: t.counterpartyName,
        occurredAt: t.occurredAt.toISOString(),
      })),
    },
    riskSignals: (caseData.riskSignals ?? []).map((rs) => ({
      id: rs.id,
      ruleId: rs.ruleId,
      title: rs.title,
      severity: rs.severity,
      createdAt: rs.createdAt.toISOString(),
    })),
    riskMemos: {
      latestId: caseData.riskMemos?.[0]?.id ?? null,
      count: caseData.riskMemos?.length ?? 0,
      latestAcceptedAt: caseData.riskMemos?.[0]?.acceptedAt?.toISOString() ?? null,
    },
    notes: {
      count: caseData.notes?.length ?? 0,
      noteIds: (caseData.notes ?? []).map((n) => n.id),
    },
    decisionMetadata: {
      reviewerUserId,
      decision,
      reasonLength: reason.length,
      timestamp: new Date().toISOString(),
    },
  };
}

export interface MakeFinalDecisionInput {
  caseId: string;
  decision: ApprovalDecisionType;
  reason: string;
}

export async function makeFinalDecisionService(
  ctx: ActorContext,
  input: MakeFinalDecisionInput
) {
  assertPermission(ctx, "cases:final_decision");

  const parsed = makeFinalDecisionSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const { decision, reason } = parsed.data;

  const caseData = await getCaseWorkspaceForOrganization(ctx.organizationId, input.caseId);
  if (!caseData) {
    throw new Error("Case not found");
  }

  if (TERMINAL_STATUSES.includes(caseData.status)) {
    throw new Error(`Cannot make final decision: case is already ${caseData.status}`);
  }

  const riskMemos = await prisma.riskMemo.findMany({
    where: { organizationId: ctx.organizationId, complianceCaseId: input.caseId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const caseDataWithMemos = { ...caseData, riskMemos };

  const newStatus = decisionToStatus(decision);
  const evidenceSnapshot = buildEvidenceSnapshot(caseDataWithMemos, decision, reason, ctx.userId);
  const evidenceSnapshotJson = JSON.stringify(evidenceSnapshot);

  const result = await prisma.$transaction(async (tx) => {
    const approvalDecision = await tx.approvalDecision.create({
      data: {
        organizationId: ctx.organizationId,
        complianceCaseId: input.caseId,
        decision,
        reason,
        evidenceSnapshotJson,
        reviewerUserId: ctx.userId,
      },
    });

    await tx.complianceCase.updateMany({
      where: {
        id: input.caseId,
        organizationId: ctx.organizationId,
        deletedAt: null,
      },
      data: {
        status: newStatus,
        closedAt: newStatus === "CLOSED" || newStatus === "APPROVED" || newStatus === "REJECTED" ? new Date() : null,
      },
    });

    await tx.auditEvent.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: ctx.userId,
        action: "CASE_FINAL_DECISION",
        entityType: "ComplianceCase",
        entityId: input.caseId,
        metadataJson: JSON.stringify({
          decision,
          newStatus,
          approvalDecisionId: approvalDecision.id,
          reasonLength: reason.length,
        }),
      },
    });

    return approvalDecision;
  });

  return result;
}

export async function listApprovalDecisionsService(ctx: ActorContext, caseId: string) {
  assertPermission(ctx, "cases:read");

  const caseExists = await prisma.complianceCase.findFirst({
    where: { id: caseId, organizationId: ctx.organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!caseExists) {
    throw new Error("Case not found");
  }

  return prisma.approvalDecision.findMany({
    where: { organizationId: ctx.organizationId, complianceCaseId: caseId },
    orderBy: { createdAt: "desc" },
    include: { reviewer: { select: { id: true, name: true, email: true } } },
  });
}
