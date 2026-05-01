import { z } from "zod";
import {
  prisma,
  listCasesForOrganization,
  getCaseWorkspaceForOrganization,
  createCaseForOrganization,
  updateCaseForOrganization,
  assignCaseForOrganization,
  updateCaseStatusForOrganization,
  createCaseNoteForOrganization,
  createAuditEvent,
  listCustomersForOrganization,
  getCustomerForOrganization,
  listBusinessesForOrganization,
  getBusinessForOrganization,
} from "@regops-ai/database";
import { hasPermission, type Permission, type OrganizationRole } from "@/lib/auth/rbac";
import type { CaseStatus, RiskLevel } from "@regops-ai/database";

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

const VALID_STATUSES_FOR_UPDATE: CaseStatus[] = [
  "OPEN",
  "IN_REVIEW",
  "ESCALATED",
  "CLOSED",
];

// ─── Schemas ───

const createCaseSchema = z
  .object({
    customerProfileId: z.string().optional(),
    businessProfileId: z.string().optional(),
    title: z.string().min(1, "Title is required").max(200),
    description: z.string().max(5000).optional(),
    riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL", "UNKNOWN"]),
    assignedToUserId: z.string().optional(),
  })
  .refine(
    (data) => {
      const hasCustomer = !!data.customerProfileId;
      const hasBusiness = !!data.businessProfileId;
      return (hasCustomer && !hasBusiness) || (!hasCustomer && hasBusiness);
    },
    {
      message: "Select exactly one subject: individual customer or business",
      path: ["customerProfileId"],
    }
  );

const updateCaseSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL", "UNKNOWN"]).optional(),
});

const createNoteSchema = z.object({
  body: z.string().min(1, "Note body is required").max(10000),
  visibility: z.enum(["INTERNAL", "AUDITOR_VISIBLE"]).optional(),
});

// ─── Read operations ───

export async function listCasesService(
  ctx: ActorContext,
  filters?: {
    status?: CaseStatus;
    riskLevel?: RiskLevel;
    assignedToUserId?: string;
    subjectType?: "individual" | "business" | "all";
    search?: string;
  }
) {
  assertPermission(ctx, "cases:read");
  return listCasesForOrganization({
    organizationId: ctx.organizationId,
    ...filters,
  });
}

export async function getCaseService(ctx: ActorContext, caseId: string) {
  assertPermission(ctx, "cases:read");
  return getCaseWorkspaceForOrganization(ctx.organizationId, caseId);
}

export async function listCustomersService(ctx: ActorContext, search?: string) {
  assertPermission(ctx, "cases:read");
  return listCustomersForOrganization(ctx.organizationId, search);
}

export async function getCustomerService(ctx: ActorContext, customerId: string) {
  assertPermission(ctx, "cases:read");
  return getCustomerForOrganization(ctx.organizationId, customerId);
}

export async function listBusinessesService(ctx: ActorContext, search?: string) {
  assertPermission(ctx, "cases:read");
  return listBusinessesForOrganization(ctx.organizationId, search);
}

export async function getBusinessService(ctx: ActorContext, businessId: string) {
  assertPermission(ctx, "cases:read");
  return getBusinessForOrganization(ctx.organizationId, businessId);
}

export async function getCaseAuditEventsService(ctx: ActorContext, caseId: string) {
  assertPermission(ctx, "cases:read");
  return prisma.auditEvent.findMany({
    where: {
      organizationId: ctx.organizationId,
      entityId: caseId,
      entityType: { in: ["ComplianceCase", "CaseNote"] },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

// ─── Mutations ───

export async function createCaseService(ctx: ActorContext, formData: FormData) {
  assertPermission(ctx, "cases:create");

  const raw = Object.fromEntries(formData.entries());
  const parsed = createCaseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const data = parsed.data;

  if (data.assignedToUserId) {
    const member = await prisma.organizationMember.findFirst({
      where: {
        organizationId: ctx.organizationId,
        userId: data.assignedToUserId,
        status: "ACTIVE",
      },
    });
    if (!member) {
      throw new Error("Assigned user is not an active member");
    }
  }

  if (data.customerProfileId) {
    const profile = await prisma.customerProfile.findFirst({
      where: {
        id: data.customerProfileId,
        organizationId: ctx.organizationId,
        deletedAt: null,
      },
    });
    if (!profile) {
      throw new Error("Customer not found");
    }
  }

  if (data.businessProfileId) {
    const profile = await prisma.businessProfile.findFirst({
      where: {
        id: data.businessProfileId,
        organizationId: ctx.organizationId,
        deletedAt: null,
      },
    });
    if (!profile) {
      throw new Error("Business not found");
    }
  }

  const newCase = await createCaseForOrganization({
    organizationId: ctx.organizationId,
    customerProfileId: data.customerProfileId,
    businessProfileId: data.businessProfileId,
    title: data.title,
    description: data.description,
    riskLevel: data.riskLevel,
    assignedToUserId: data.assignedToUserId,
    openedByUserId: ctx.userId,
  });

  await createAuditEvent({
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: "CASE_CREATED",
    entityType: "ComplianceCase",
    entityId: newCase.id,
    metadataJson: JSON.stringify({
      title: data.title,
      riskLevel: data.riskLevel,
      subjectType: data.customerProfileId ? "individual" : "business",
      subjectId: data.customerProfileId ?? data.businessProfileId,
    }),
  });

  return newCase;
}

export async function updateCaseService(
  ctx: ActorContext,
  caseId: string,
  formData: FormData
) {
  assertPermission(ctx, "cases:update");

  const raw = Object.fromEntries(formData.entries());
  const parsed = updateCaseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const existing = await getCaseWorkspaceForOrganization(
    ctx.organizationId,
    caseId
  );
  if (!existing) {
    throw new Error("Case not found");
  }

  const data = parsed.data;
  const updateData: Record<string, unknown> = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.riskLevel !== undefined) updateData.riskLevel = data.riskLevel;

  if (Object.keys(updateData).length === 0) {
    throw new Error("No changes provided");
  }

  await updateCaseForOrganization({
    organizationId: ctx.organizationId,
    caseId,
    ...updateData,
  });

  await createAuditEvent({
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: "CASE_UPDATED",
    entityType: "ComplianceCase",
    entityId: caseId,
    metadataJson: JSON.stringify(updateData),
  });
}

export async function assignCaseService(
  ctx: ActorContext,
  caseId: string,
  userId: string | null
) {
  assertPermission(ctx, "cases:assign");

  const existing = await getCaseWorkspaceForOrganization(
    ctx.organizationId,
    caseId
  );
  if (!existing) {
    throw new Error("Case not found");
  }

  if (userId) {
    const member = await prisma.organizationMember.findFirst({
      where: {
        organizationId: ctx.organizationId,
        userId,
        status: "ACTIVE",
      },
    });
    if (!member) {
      throw new Error("User is not an active member");
    }
  }

  await assignCaseForOrganization(ctx.organizationId, caseId, userId);

  await createAuditEvent({
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: "CASE_ASSIGNED",
    entityType: "ComplianceCase",
    entityId: caseId,
    metadataJson: JSON.stringify({ assignedToUserId: userId }),
  });
}

export async function changeCaseStatusService(
  ctx: ActorContext,
  caseId: string,
  status: CaseStatus
) {
  assertPermission(ctx, "cases:update");

  if (!VALID_STATUSES_FOR_UPDATE.includes(status)) {
    throw new Error("Invalid status for this operation");
  }

  const existing = await getCaseWorkspaceForOrganization(
    ctx.organizationId,
    caseId
  );
  if (!existing) {
    throw new Error("Case not found");
  }

  await updateCaseStatusForOrganization(ctx.organizationId, caseId, status);

  await createAuditEvent({
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: "CASE_STATUS_UPDATED",
    entityType: "ComplianceCase",
    entityId: caseId,
    metadataJson: JSON.stringify({ status }),
  });
}

export async function addCaseNoteService(
  ctx: ActorContext,
  caseId: string,
  formData: FormData
) {
  assertPermission(ctx, "cases:update");

  const raw = Object.fromEntries(formData.entries());
  const parsed = createNoteSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const existing = await getCaseWorkspaceForOrganization(
    ctx.organizationId,
    caseId
  );
  if (!existing) {
    throw new Error("Case not found");
  }

  const note = await createCaseNoteForOrganization({
    organizationId: ctx.organizationId,
    complianceCaseId: caseId,
    authorUserId: ctx.userId,
    body: parsed.data.body,
    visibility: parsed.data.visibility,
  });

  await createAuditEvent({
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: "CASE_NOTE_CREATED",
    entityType: "CaseNote",
    entityId: note.id,
    metadataJson: JSON.stringify({
      complianceCaseId: caseId,
      visibility: parsed.data.visibility ?? "INTERNAL",
    }),
  });
}
