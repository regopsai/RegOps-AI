"use server";

import { prisma, createAuditEvent } from "@regops-ai/database";
import { hasPermission, type Permission, type OrganizationRole } from "@/lib/auth/rbac";
import { validateWalletAddress, normalizeWalletAddress } from "./address-validation";
import { maskWalletAddress } from "./masking";
import { z } from "zod";

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

const createWalletSchema = z.object({
  network: z.enum(["SOLANA", "ETHEREUM", "BASE", "TRON"]),
  address: z.string().min(1),
  label: z.string().optional(),
  customerProfileId: z.string().optional(),
  businessProfileId: z.string().optional(),
  complianceCaseId: z.string().optional(),
});

export interface CreateWalletInput {
  network: string;
  address: string;
  label?: string;
  customerProfileId?: string;
  businessProfileId?: string;
  complianceCaseId?: string;
}

export async function createWalletAddressService(ctx: ActorContext, input: CreateWalletInput) {
  assertPermission(ctx, "onchain:write");

  const parsed = createWalletSchema.parse(input);

  if (!parsed.customerProfileId && !parsed.businessProfileId && !parsed.complianceCaseId) {
    throw new Error("At least one link is required: customer, business, or case.");
  }

  const normalizedAddress = validateWalletAddress(parsed.network, parsed.address);

  // Verify linkages belong to same org
  if (parsed.customerProfileId) {
    const profile = await prisma.customerProfile.findFirst({
      where: { id: parsed.customerProfileId, organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!profile) throw new Error("Linked customer profile not found in organization.");
  }

  if (parsed.businessProfileId) {
    const profile = await prisma.businessProfile.findFirst({
      where: { id: parsed.businessProfileId, organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!profile) throw new Error("Linked business profile not found in organization.");
  }

  if (parsed.complianceCaseId) {
    const caseRecord = await prisma.complianceCase.findFirst({
      where: { id: parsed.complianceCaseId, organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true, customerProfileId: true, businessProfileId: true },
    });
    if (!caseRecord) throw new Error("Linked case not found in organization.");

    // If case has a subject, and user provided a subject, verify consistency
    if (caseRecord.customerProfileId && parsed.customerProfileId && caseRecord.customerProfileId !== parsed.customerProfileId) {
      throw new Error("Linked customer does not match the case subject.");
    }
    if (caseRecord.businessProfileId && parsed.businessProfileId && caseRecord.businessProfileId !== parsed.businessProfileId) {
      throw new Error("Linked business does not match the case subject.");
    }
    if (caseRecord.customerProfileId && parsed.businessProfileId) {
      throw new Error("Linked business does not match the case subject.");
    }
    if (caseRecord.businessProfileId && parsed.customerProfileId) {
      throw new Error("Linked customer does not match the case subject.");
    }
  }

  const wallet = await prisma.walletAddress.create({
    data: {
      organizationId: ctx.organizationId,
      network: parsed.network,
      address: normalizedAddress,
      label: parsed.label,
      customerProfileId: parsed.customerProfileId ?? null,
      businessProfileId: parsed.businessProfileId ?? null,
      complianceCaseId: parsed.complianceCaseId ?? null,
      createdByUserId: ctx.userId,
      status: "ACTIVE",
    },
  });

  await createAuditEvent({
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: "WALLET_ADDRESS_CREATED",
    entityType: "WalletAddress",
    entityId: wallet.id,
    metadataJson: JSON.stringify({
      network: wallet.network,
      addressMasked: maskWalletAddress(wallet.address),
      label: wallet.label,
      customerProfileId: wallet.customerProfileId,
      businessProfileId: wallet.businessProfileId,
      complianceCaseId: wallet.complianceCaseId,
    }),
  });

  return wallet;
}

export async function archiveWalletAddressService(ctx: ActorContext, walletAddressId: string) {
  assertPermission(ctx, "onchain:write");

  const wallet = await prisma.walletAddress.findFirst({
    where: { id: walletAddressId, organizationId: ctx.organizationId, deletedAt: null },
  });

  if (!wallet) {
    throw new Error("Wallet address not found.");
  }

  await prisma.walletAddress.update({
    where: { id: walletAddressId },
    data: { status: "ARCHIVED", updatedAt: new Date() },
  });

  await createAuditEvent({
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: "WALLET_ADDRESS_ARCHIVED",
    entityType: "WalletAddress",
    entityId: walletAddressId,
    metadataJson: JSON.stringify({
      network: wallet.network,
      addressMasked: maskWalletAddress(wallet.address),
    }),
  });
}

export async function listWalletAddressesService(ctx: ActorContext, filters?: {
  network?: string;
  status?: "ACTIVE" | "ARCHIVED";
  customerProfileId?: string;
  businessProfileId?: string;
  complianceCaseId?: string;
}) {
  assertPermission(ctx, "onchain:read");

  const where: Record<string, unknown> = {
    organizationId: ctx.organizationId,
    deletedAt: null,
  };

  if (filters?.network) where.network = filters.network;
  if (filters?.status) where.status = filters.status;
  if (filters?.customerProfileId) where.customerProfileId = filters.customerProfileId;
  if (filters?.businessProfileId) where.businessProfileId = filters.businessProfileId;
  if (filters?.complianceCaseId) where.complianceCaseId = filters.complianceCaseId;

  return prisma.walletAddress.findMany({
    where,
    include: {
      customerProfile: { select: { id: true, firstName: true, lastName: true } },
      businessProfile: { select: { id: true, legalName: true } },
      complianceCase: { select: { id: true, title: true } },
      screeningRuns: { orderBy: { screenedAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getWalletAddressService(ctx: ActorContext, walletAddressId: string) {
  assertPermission(ctx, "onchain:read");

  return prisma.walletAddress.findFirst({
    where: { id: walletAddressId, organizationId: ctx.organizationId, deletedAt: null },
    include: {
      customerProfile: { select: { id: true, firstName: true, lastName: true } },
      businessProfile: { select: { id: true, legalName: true } },
      complianceCase: { select: { id: true, title: true } },
      screeningRuns: { orderBy: { screenedAt: "desc" } },
      onChainTransactions: { orderBy: { blockTime: "desc" }, take: 50 },
      riskSignals: { orderBy: { createdAt: "desc" } },
    },
  });
}
