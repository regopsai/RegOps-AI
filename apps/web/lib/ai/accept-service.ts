import { prisma, createAuditEvent } from "@regops-ai/database";
import { hasPermission, type Permission, type OrganizationRole } from "@/lib/auth/rbac";

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

export interface AcceptRiskMemoInput {
  riskMemoId: string;
  createCaseNoteFromMemo?: boolean;
}

export async function acceptRiskMemoService(
  ctx: ActorContext,
  input: AcceptRiskMemoInput
) {
  assertPermission(ctx, "cases:update");

  const riskMemo = await prisma.riskMemo.findFirst({
    where: { id: input.riskMemoId, organizationId: ctx.organizationId },
    include: { complianceCase: true },
  });

  if (!riskMemo) {
    throw new Error("Risk memo not found");
  }

  if (!riskMemo.complianceCase) {
    throw new Error("Risk memo is not linked to a case");
  }

  if (riskMemo.complianceCase.organizationId !== ctx.organizationId) {
    throw new Error("Case does not belong to organization");
  }

  if (riskMemo.acceptedAt) {
    throw new Error("Risk memo has already been accepted");
  }

  const updatedMemo = await prisma.riskMemo.update({
    where: { id: input.riskMemoId },
    data: {
      acceptedByUserId: ctx.userId,
      acceptedAt: new Date(),
    },
  });

  let caseNoteId: string | undefined;

  if (input.createCaseNoteFromMemo) {
    const noteBody = [
      `## AI Risk Memo Accepted`,
      "",
      `**Executive Summary:** ${riskMemo.executiveSummary}`,
      "",
      `**Recommended Action:** ${riskMemo.recommendedAction}`,
      "",
      `**Limitations:** ${riskMemo.limitations}`,
    ].join("\n");

    const note = await prisma.caseNote.create({
      data: {
        organizationId: ctx.organizationId,
        complianceCaseId: riskMemo.complianceCaseId,
        authorUserId: ctx.userId,
        body: noteBody,
        visibility: "INTERNAL",
      },
    });
    caseNoteId = note.id;
  }

  await createAuditEvent({
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: "RISK_MEMO_ACCEPTED",
    entityType: "RiskMemo",
    entityId: riskMemo.id,
    metadataJson: JSON.stringify({
      complianceCaseId: riskMemo.complianceCaseId,
      acceptedByUserId: ctx.userId,
      createdCaseNoteId: caseNoteId,
    }),
  });

  return { riskMemo: updatedMemo, caseNoteId };
}
