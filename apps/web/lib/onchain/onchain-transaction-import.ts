"use server";

import { prisma, createAuditEvent } from "@regops-ai/database";
import { hasPermission, type Permission, type OrganizationRole } from "@/lib/auth/rbac";
import { validateWalletAddress } from "./address-validation";
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

const transactionRowSchema = z.object({
  network: z.enum(["SOLANA", "ETHEREUM", "BASE", "TRON"]),
  walletAddress: z.string().min(1),
  txHash: z.string().min(1),
  direction: z.enum(["INBOUND", "OUTBOUND", "SELF_TRANSFER", "UNKNOWN"]),
  assetSymbol: z.string().min(1),
  assetMintOrContract: z.string().optional(),
  amount: z.coerce.number().positive(),
  usdValue: z.coerce.number().positive().optional().or(z.literal("")),
  counterpartyAddress: z.string().optional(),
  counterpartyLabel: z.string().optional(),
  counterpartyRiskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL", "UNKNOWN"]).optional().or(z.literal("")),
  counterpartyCategory: z.string().optional(),
  blockTime: z.coerce.date(),
  complianceCaseId: z.string().optional(),
});

export interface OnChainTransactionRow {
  network: string;
  walletAddress: string;
  txHash: string;
  direction: string;
  assetSymbol: string;
  assetMintOrContract?: string;
  amount: number;
  usdValue?: number | "";
  counterpartyAddress?: string;
  counterpartyLabel?: string;
  counterpartyRiskLevel?: string | "";
  counterpartyCategory?: string;
  blockTime: Date | string;
  complianceCaseId?: string;
}

export interface OnChainTransactionImportResult {
  imported: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export async function importOnChainTransactionsCsvService(
  ctx: ActorContext,
  rows: OnChainTransactionRow[]
): Promise<OnChainTransactionImportResult> {
  assertPermission(ctx, "onchain:import");

  const result: OnChainTransactionImportResult = { imported: 0, skipped: 0, failed: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const parsed = transactionRowSchema.parse(row);
      const normalizedAddress = validateWalletAddress(parsed.network, parsed.walletAddress);

      const wallet = await prisma.walletAddress.findFirst({
        where: {
          organizationId: ctx.organizationId,
          network: parsed.network,
          address: normalizedAddress,
          deletedAt: null,
        },
      });

      if (!wallet) {
        result.failed++;
        result.errors.push(`Row ${i + 1}: Wallet not found for ${parsed.network} ${maskWalletAddress(normalizedAddress)}`);
        continue;
      }

      // Verify case belongs to org if provided
      if (parsed.complianceCaseId) {
        const caseExists = await prisma.complianceCase.findFirst({
          where: { id: parsed.complianceCaseId, organizationId: ctx.organizationId, deletedAt: null },
          select: { id: true },
        });
        if (!caseExists) {
          result.failed++;
          result.errors.push(`Row ${i + 1}: Case not found in organization.`);
          continue;
        }
      }

      const usdValue = parsed.usdValue === "" || parsed.usdValue === undefined ? null : parsed.usdValue;
      const counterpartyRiskLevel = parsed.counterpartyRiskLevel === "" || parsed.counterpartyRiskLevel === undefined ? null : parsed.counterpartyRiskLevel;

      try {
        await prisma.onChainTransaction.create({
          data: {
            organizationId: ctx.organizationId,
            walletAddressId: wallet.id,
            complianceCaseId: parsed.complianceCaseId ?? null,
            network: parsed.network,
            txHash: parsed.txHash,
            direction: parsed.direction,
            assetSymbol: parsed.assetSymbol,
            assetMintOrContract: parsed.assetMintOrContract ?? null,
            amount: parsed.amount,
            usdValue,
            counterpartyAddress: parsed.counterpartyAddress ?? null,
            counterpartyLabel: parsed.counterpartyLabel ?? null,
            counterpartyRiskLevel: counterpartyRiskLevel as any,
            counterpartyCategory: parsed.counterpartyCategory ?? null,
            blockTime: parsed.blockTime,
          },
        });
        result.imported++;
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === "P2002") {
          result.skipped++;
        } else {
          throw err;
        }
      }
    } catch (err) {
      result.failed++;
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`Row ${i + 1}: ${message}`);
    }
  }

  if (result.imported > 0 || result.skipped > 0) {
    await createAuditEvent({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "ONCHAIN_TRANSACTIONS_IMPORTED",
      entityType: "OnChainTransaction",
      entityId: "batch",
      metadataJson: JSON.stringify({
        imported: result.imported,
        skipped: result.skipped,
        failed: result.failed,
      }),
    });
  }

  return result;
}
