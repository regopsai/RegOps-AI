import { prisma } from "../client";
import type { CaseStatus, RiskLevel } from "@prisma/client";

export async function listComplianceCasesForOrganization(
  organizationId: string,
  options?: {
    status?: CaseStatus;
    riskLevel?: RiskLevel;
    assignedToUserId?: string;
  }
) {
  return prisma.complianceCase.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: options?.status,
      riskLevel: options?.riskLevel,
      assignedToUserId: options?.assignedToUserId,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getComplianceCaseForOrganization(
  organizationId: string,
  caseId: string
) {
  return prisma.complianceCase.findFirst({
    where: {
      id: caseId,
      organizationId,
      deletedAt: null,
    },
  });
}
