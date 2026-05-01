"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
import {
  requireOrganizationContext,
  requirePermission,
} from "@/lib/auth/server";
import type { CaseStatus, RiskLevel } from "@regops-ai/database";

const VALID_STATUSES_FOR_UPDATE: CaseStatus[] = [
  "OPEN",
  "IN_REVIEW",
  "ESCALATED",
  "CLOSED",
];

const caseStatusSchema = z.enum(["OPEN", "IN_REVIEW", "ESCALATED", "CLOSED"]);

export async function listCases(filters?: {
  status?: CaseStatus;
  riskLevel?: RiskLevel;
  assignedToUserId?: string;
  subjectType?: "individual" | "business" | "all";
  search?: string;
}) {
  const context = await requirePermission("cases:read");
  return listCasesForOrganization({
    organizationId: context.organization.id,
    ...filters,
  });
}

export async function getCase(caseId: string) {
  const context = await requirePermission("cases:read");
  return getCaseWorkspaceForOrganization(
    context.organization.id,
    caseId
  );
}

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

export async function createCase(formData: FormData) {
  const context = await requirePermission("cases:create");

  const raw = Object.fromEntries(formData.entries());
  const parsed = createCaseSchema.safeParse(raw);

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const data = parsed.data;

  if (data.assignedToUserId) {
    const member = await prisma.organizationMember.findFirst({
      where: {
        organizationId: context.organization.id,
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
        organizationId: context.organization.id,
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
        organizationId: context.organization.id,
        deletedAt: null,
      },
    });
    if (!profile) {
      throw new Error("Business not found");
    }
  }

  const newCase = await createCaseForOrganization({
    organizationId: context.organization.id,
    customerProfileId: data.customerProfileId,
    businessProfileId: data.businessProfileId,
    title: data.title,
    description: data.description,
    riskLevel: data.riskLevel,
    assignedToUserId: data.assignedToUserId,
    openedByUserId: context.user.id,
  });

  await createAuditEvent({
    organizationId: context.organization.id,
    actorUserId: context.user.id,
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

  revalidatePath("/cases");
  redirect(`/cases/${newCase.id}`);
}

const updateCaseSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL", "UNKNOWN"]).optional(),
});

export async function updateCase(caseId: string, formData: FormData) {
  const context = await requirePermission("cases:update");

  const raw = Object.fromEntries(formData.entries());
  const parsed = updateCaseSchema.safeParse(raw);

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const existing = await getCaseWorkspaceForOrganization(
    context.organization.id,
    caseId
  );
  if (!existing) {
    return { error: "Case not found" };
  }

  const data = parsed.data;
  const updateData: Record<string, unknown> = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.riskLevel !== undefined) updateData.riskLevel = data.riskLevel;

  if (Object.keys(updateData).length === 0) {
    return { error: "No changes provided" };
  }

  await updateCaseForOrganization({
    organizationId: context.organization.id,
    caseId,
    ...updateData,
  });

  await createAuditEvent({
    organizationId: context.organization.id,
    actorUserId: context.user.id,
    action: "CASE_UPDATED",
    entityType: "ComplianceCase",
    entityId: caseId,
    metadataJson: JSON.stringify(updateData),
  });

  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/cases");
  return { success: true };
}

export async function assignCase(caseId: string, userId: string | null) {
  const context = await requirePermission("cases:assign");

  const existing = await getCaseWorkspaceForOrganization(
    context.organization.id,
    caseId
  );
  if (!existing) {
    return { error: "Case not found" };
  }

  if (userId) {
    const member = await prisma.organizationMember.findFirst({
      where: {
        organizationId: context.organization.id,
        userId,
        status: "ACTIVE",
      },
    });
    if (!member) {
      return { error: "User is not an active member" };
    }
  }

  await assignCaseForOrganization(
    context.organization.id,
    caseId,
    userId
  );

  await createAuditEvent({
    organizationId: context.organization.id,
    actorUserId: context.user.id,
    action: "CASE_ASSIGNED",
    entityType: "ComplianceCase",
    entityId: caseId,
    metadataJson: JSON.stringify({ assignedToUserId: userId }),
  });

  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/cases");
  return { success: true };
}

export async function changeCaseStatus(caseId: string, status: CaseStatus) {
  const context = await requirePermission("cases:update");

  if (!VALID_STATUSES_FOR_UPDATE.includes(status)) {
    return { error: "Invalid status for this operation" };
  }

  const existing = await getCaseWorkspaceForOrganization(
    context.organization.id,
    caseId
  );
  if (!existing) {
    return { error: "Case not found" };
  }

  await updateCaseStatusForOrganization(
    context.organization.id,
    caseId,
    status
  );

  await createAuditEvent({
    organizationId: context.organization.id,
    actorUserId: context.user.id,
    action: "CASE_STATUS_UPDATED",
    entityType: "ComplianceCase",
    entityId: caseId,
    metadataJson: JSON.stringify({ status }),
  });

  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/cases");
  return { success: true };
}

const createNoteSchema = z.object({
  body: z.string().min(1, "Note body is required").max(10000),
  visibility: z.enum(["INTERNAL", "AUDITOR_VISIBLE"]).optional(),
});

export async function addCaseNote(caseId: string, formData: FormData) {
  const context = await requirePermission("cases:update");

  const raw = Object.fromEntries(formData.entries());
  const parsed = createNoteSchema.safeParse(raw);

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const existing = await getCaseWorkspaceForOrganization(
    context.organization.id,
    caseId
  );
  if (!existing) {
    return { error: "Case not found" };
  }

  const note = await createCaseNoteForOrganization({
    organizationId: context.organization.id,
    complianceCaseId: caseId,
    authorUserId: context.user.id,
    body: parsed.data.body,
    visibility: parsed.data.visibility,
  });

  await createAuditEvent({
    organizationId: context.organization.id,
    actorUserId: context.user.id,
    action: "CASE_NOTE_CREATED",
    entityType: "CaseNote",
    entityId: note.id,
    metadataJson: JSON.stringify({
      complianceCaseId: caseId,
      visibility: parsed.data.visibility ?? "INTERNAL",
    }),
  });

  revalidatePath(`/cases/${caseId}`);
  return { success: true };
}

export async function listCustomers(search?: string) {
  const context = await requirePermission("cases:read");
  return listCustomersForOrganization(context.organization.id, search);
}

export async function getCustomer(customerId: string) {
  const context = await requirePermission("cases:read");
  return getCustomerForOrganization(context.organization.id, customerId);
}

export async function listBusinesses(search?: string) {
  const context = await requirePermission("cases:read");
  return listBusinessesForOrganization(context.organization.id, search);
}

export async function getBusiness(businessId: string) {
  const context = await requirePermission("cases:read");
  return getBusinessForOrganization(context.organization.id, businessId);
}

export async function getCaseAuditEvents(caseId: string) {
  const context = await requirePermission("cases:read");
  return prisma.auditEvent.findMany({
    where: {
      organizationId: context.organization.id,
      entityId: caseId,
      entityType: { in: ["ComplianceCase", "CaseNote"] },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}
