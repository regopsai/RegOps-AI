import { prisma } from "../client";

export async function listCustomersForOrganization(
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
      { firstName: { contains: term, mode: "insensitive" } },
      { lastName: { contains: term, mode: "insensitive" } },
      { email: { contains: term, mode: "insensitive" } },
    ];
  }

  return prisma.customerProfile.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
}

export async function getCustomerForOrganization(
  organizationId: string,
  customerId: string
) {
  return prisma.customerProfile.findFirst({
    where: {
      id: customerId,
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
