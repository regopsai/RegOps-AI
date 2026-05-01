import { prisma } from "@regops-ai/database";
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

export interface ListTransactionsFilters {
  direction?: "INBOUND" | "OUTBOUND";
  currency?: string;
  counterpartyCountry?: string;
  customerProfileId?: string;
  businessProfileId?: string;
  complianceCaseId?: string;
  minAmount?: number;
  maxAmount?: number;
  fromDate?: Date;
  toDate?: Date;
  search?: string;
}

export async function listTransactionsService(
  ctx: ActorContext,
  filters?: ListTransactionsFilters
) {
  assertPermission(ctx, "transactions:read");

  const where: Record<string, unknown> = {
    organizationId: ctx.organizationId,
  };

  if (filters?.direction) {
    where.direction = filters.direction;
  }
  if (filters?.currency) {
    where.currency = { equals: filters.currency.toUpperCase(), mode: "insensitive" };
  }
  if (filters?.counterpartyCountry) {
    where.counterpartyCountry = { equals: filters.counterpartyCountry.toUpperCase(), mode: "insensitive" };
  }
  if (filters?.customerProfileId) {
    where.customerProfileId = filters.customerProfileId;
  }
  if (filters?.businessProfileId) {
    where.businessProfileId = filters.businessProfileId;
  }
  if (filters?.complianceCaseId) {
    where.complianceCaseId = filters.complianceCaseId;
  }
  if (filters?.minAmount !== undefined || filters?.maxAmount !== undefined) {
    where.amount = {};
    if (filters.minAmount !== undefined) {
      (where.amount as Record<string, unknown>).gte = filters.minAmount;
    }
    if (filters.maxAmount !== undefined) {
      (where.amount as Record<string, unknown>).lte = filters.maxAmount;
    }
  }
  if (filters?.fromDate || filters?.toDate) {
    where.occurredAt = {};
    if (filters.fromDate) {
      (where.occurredAt as Record<string, unknown>).gte = filters.fromDate;
    }
    if (filters.toDate) {
      (where.occurredAt as Record<string, unknown>).lte = filters.toDate;
    }
  }
  if (filters?.search) {
    const term = filters.search.trim();
    where.OR = [
      { externalReference: { contains: term, mode: "insensitive" } },
      { counterpartyName: { contains: term, mode: "insensitive" } },
      { counterpartyAccount: { contains: term, mode: "insensitive" } },
      { description: { contains: term, mode: "insensitive" } },
    ];
  }

  return prisma.transaction.findMany({
    where,
    include: {
      customerProfile: { select: { id: true, firstName: true, lastName: true } },
      businessProfile: { select: { id: true, legalName: true } },
      complianceCase: { select: { id: true, title: true } },
    },
    orderBy: { occurredAt: "desc" },
    take: 200,
  });
}

export async function getTransactionService(ctx: ActorContext, transactionId: string) {
  assertPermission(ctx, "transactions:read");

  return prisma.transaction.findFirst({
    where: {
      id: transactionId,
      organizationId: ctx.organizationId,
    },
    include: {
      customerProfile: { select: { id: true, firstName: true, lastName: true, email: true } },
      businessProfile: { select: { id: true, legalName: true } },
      complianceCase: { select: { id: true, title: true } },
      riskSignals: {
        orderBy: { createdAt: "desc" },
      },
      transactionImportBatch: {
        select: { id: true, fileName: true, createdAt: true },
      },
    },
  });
}
