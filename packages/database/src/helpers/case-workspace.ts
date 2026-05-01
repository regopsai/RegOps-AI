import { prisma } from "../client";
import type { CaseStatus, RiskLevel } from "@prisma/client";

export interface ListCasesInput {
  organizationId: string;
  status?: CaseStatus;
  riskLevel?: RiskLevel;
  assignedToUserId?: string;
  subjectType?: "individual" | "business" | "all";
  search?: string;
}

export async function listCasesForOrganization(input: ListCasesInput) {
  const where: Record<string, unknown> = {
    organizationId: input.organizationId,
    deletedAt: null,
  };

  if (input.status) {
    where.status = input.status;
  }
  if (input.riskLevel) {
    where.riskLevel = input.riskLevel;
  }
  if (input.assignedToUserId) {
    where.assignedToUserId = input.assignedToUserId;
  }
  if (input.subjectType === "individual") {
    where.customerProfileId = { not: null };
    where.businessProfileId = null;
  } else if (input.subjectType === "business") {
    where.customerProfileId = null;
    where.businessProfileId = { not: null };
  }

  if (input.search) {
    const term = input.search.trim();
    where.OR = [
      { title: { contains: term, mode: "insensitive" } },
      {
        customerProfile: {
          firstName: { contains: term, mode: "insensitive" },
        },
      },
      {
        customerProfile: {
          lastName: { contains: term, mode: "insensitive" },
        },
      },
      {
        businessProfile: {
          legalName: { contains: term, mode: "insensitive" },
        },
      },
    ];
  }

  return prisma.complianceCase.findMany({
    where,
    include: {
      customerProfile: true,
      businessProfile: true,
      assignedTo: { select: { id: true, name: true, email: true } },
      openedBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getCaseWorkspaceForOrganization(
  organizationId: string,
  caseId: string
) {
  return prisma.complianceCase.findFirst({
    where: {
      id: caseId,
      organizationId,
      deletedAt: null,
    },
    include: {
      customerProfile: true,
      businessProfile: true,
      assignedTo: { select: { id: true, name: true, email: true } },
      openedBy: { select: { id: true, name: true, email: true } },
      notes: {
        where: { deletedAt: null },
        include: {
          author: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      riskSignals: {
        orderBy: { createdAt: "desc" },
      },
      transactions: {
        orderBy: { occurredAt: "desc" },
        take: 10,
      },
      documents: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });
}

export interface CreateCaseInput {
  organizationId: string;
  customerProfileId?: string;
  businessProfileId?: string;
  title: string;
  description?: string;
  riskLevel: RiskLevel;
  assignedToUserId?: string;
  openedByUserId: string;
}

export async function createCaseForOrganization(input: CreateCaseInput) {
  return prisma.complianceCase.create({
    data: {
      organizationId: input.organizationId,
      customerProfileId: input.customerProfileId,
      businessProfileId: input.businessProfileId,
      title: input.title,
      description: input.description,
      riskLevel: input.riskLevel,
      assignedToUserId: input.assignedToUserId,
      openedByUserId: input.openedByUserId,
      status: "OPEN",
      openedAt: new Date(),
    },
  });
}

export interface UpdateCaseInput {
  organizationId: string;
  caseId: string;
  title?: string;
  description?: string;
  riskLevel?: RiskLevel;
}

export async function updateCaseForOrganization(input: UpdateCaseInput) {
  return prisma.complianceCase.updateMany({
    where: {
      id: input.caseId,
      organizationId: input.organizationId,
      deletedAt: null,
    },
    data: {
      title: input.title,
      description: input.description,
      riskLevel: input.riskLevel,
    },
  });
}

export async function assignCaseForOrganization(
  organizationId: string,
  caseId: string,
  assignedToUserId: string | null
) {
  return prisma.complianceCase.updateMany({
    where: {
      id: caseId,
      organizationId,
      deletedAt: null,
    },
    data: {
      assignedToUserId,
    },
  });
}

export async function updateCaseStatusForOrganization(
  organizationId: string,
  caseId: string,
  status: CaseStatus
) {
  return prisma.complianceCase.updateMany({
    where: {
      id: caseId,
      organizationId,
      deletedAt: null,
    },
    data: {
      status,
      closedAt: status === "CLOSED" ? new Date() : null,
    },
  });
}

export interface CreateCaseNoteInput {
  organizationId: string;
  complianceCaseId: string;
  authorUserId: string;
  body: string;
  visibility?: "INTERNAL" | "AUDITOR_VISIBLE";
}

export async function createCaseNoteForOrganization(input: CreateCaseNoteInput) {
  return prisma.caseNote.create({
    data: {
      organizationId: input.organizationId,
      complianceCaseId: input.complianceCaseId,
      authorUserId: input.authorUserId,
      body: input.body,
      visibility: input.visibility ?? "INTERNAL",
    },
  });
}
