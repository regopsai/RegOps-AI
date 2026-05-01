import { prisma } from "../client";

export async function listBusinessesForOrganization(
  organizationId: string,
  search?: string
) {
  const where: Record<string, unknown> = {
    organizationId,
    deletedAt: null,
  };

  if (search) {
    const term = search.trim();
    where.OR = [
      { legalName: { contains: term, mode: "insensitive" } },
      { tradingName: { contains: term, mode: "insensitive" } },
      { registrationNumber: { contains: term, mode: "insensitive" } },
    ];
  }

  return prisma.businessProfile.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
}

export async function getBusinessForOrganization(
  organizationId: string,
  businessId: string
) {
  return prisma.businessProfile.findFirst({
    where: {
      id: businessId,
      organizationId,
      deletedAt: null,
    },
    include: {
      complianceCases: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        include: {
          assignedTo: { select: { id: true, name: true, email: true } },
        },
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
      riskSignals: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });
}
