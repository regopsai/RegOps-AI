"use server";

import { prisma, createAuditEvent, type RiskLevel } from "@regops-ai/database";
import { hasPermission, type Permission, type OrganizationRole } from "@/lib/auth/rbac";
import { validateWalletAddress, normalizeWalletAddress } from "./address-validation";
import { maskWalletAddress } from "./masking";
import { createOnChainProvider } from "./providers/provider-factory";
import { OnChainConfigurationError } from "./providers/errors";
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

const screeningCsvRowSchema = z.object({
  network: z.enum(["SOLANA", "ETHEREUM", "BASE", "TRON"]),
  address: z.string().min(1),
  provider: z.string().min(1),
  riskScore: z.coerce.number().min(0).max(100).optional().or(z.literal("")),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL", "UNKNOWN"]),
  categories: z.string().optional(),
  labels: z.string().optional(),
  summary: z.string().optional(),
  providerRunId: z.string().optional(),
});

export interface ScreeningImportRow {
  network: string;
  address: string;
  provider: string;
  riskScore?: number;
  riskLevel: string;
  categories?: string;
  labels?: string;
  summary?: string;
  providerRunId?: string;
}

export interface ScreeningImportResult {
  imported: number;
  skipped: number;
  failed: number;
  errors: string[];
}

function parseCategories(input: string | undefined): string[] {
  if (!input) return [];
  return input.split(",").map((s) => s.trim()).filter(Boolean);
}

export async function importWalletScreeningCsvService(
  ctx: ActorContext,
  rows: ScreeningImportRow[]
): Promise<ScreeningImportResult> {
  assertPermission(ctx, "onchain:import");

  const result: ScreeningImportResult = { imported: 0, skipped: 0, failed: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const parsed = screeningCsvRowSchema.parse(row);
      const normalizedAddress = validateWalletAddress(parsed.network, parsed.address);

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

      const riskScore = parsed.riskScore === "" || parsed.riskScore === undefined ? null : parsed.riskScore;

      await prisma.walletScreeningRun.create({
        data: {
          organizationId: ctx.organizationId,
          walletAddressId: wallet.id,
          provider: parsed.provider,
          providerRunId: parsed.providerRunId ?? null,
          status: "COMPLETED",
          riskScore,
          riskLevel: parsed.riskLevel as RiskLevel,
          categoriesJson: JSON.stringify(parseCategories(parsed.categories)),
          labelsJson: JSON.stringify(parseCategories(parsed.labels)),
          summary: parsed.summary ?? null,
          screenedAt: new Date(),
          createdByUserId: ctx.userId,
        },
      });

      await createAuditEvent({
        organizationId: ctx.organizationId,
        actorUserId: ctx.userId,
        action: "WALLET_SCREENING_RUN_CREATED",
        entityType: "WalletScreeningRun",
        entityId: wallet.id,
        metadataJson: JSON.stringify({
          walletAddressId: wallet.id,
          network: wallet.network,
          addressMasked: maskWalletAddress(wallet.address),
          provider: parsed.provider,
          riskLevel: parsed.riskLevel,
          riskScore,
        }),
      });

      result.imported++;
    } catch (err) {
      result.failed++;
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`Row ${i + 1}: ${message}`);
    }
  }

  return result;
}

export async function runWalletScreeningService(ctx: ActorContext, walletAddressId: string) {
  assertPermission(ctx, "onchain:screen");

  const wallet = await prisma.walletAddress.findFirst({
    where: { id: walletAddressId, organizationId: ctx.organizationId, deletedAt: null },
  });

  if (!wallet) {
    throw new Error("Wallet address not found.");
  }

  const provider = createOnChainProvider();

  try {
    const result = await provider.screenWalletAddress({
      network: wallet.network,
      address: wallet.address,
    });

    const run = await prisma.walletScreeningRun.create({
      data: {
        organizationId: ctx.organizationId,
        walletAddressId: wallet.id,
        provider: result.provider,
        providerRunId: result.providerRunId ?? null,
        status: "COMPLETED",
        riskScore: result.riskScore,
        riskLevel: result.riskLevel,
        categoriesJson: JSON.stringify(result.categories),
        labelsJson: JSON.stringify(result.labels),
        summary: result.summary,
        screenedAt: new Date(),
        createdByUserId: ctx.userId,
      },
    });

    await createAuditEvent({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "WALLET_SCREENING_RUN_CREATED",
      entityType: "WalletScreeningRun",
      entityId: run.id,
      metadataJson: JSON.stringify({
        walletAddressId: wallet.id,
        network: wallet.network,
        addressMasked: maskWalletAddress(wallet.address),
        provider: result.provider,
        riskLevel: result.riskLevel,
        riskScore: result.riskScore,
      }),
    });

    return run;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    await createAuditEvent({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "WALLET_SCREENING_RUN_FAILED",
      entityType: "WalletAddress",
      entityId: wallet.id,
      metadataJson: JSON.stringify({
        walletAddressId: wallet.id,
        network: wallet.network,
        addressMasked: maskWalletAddress(wallet.address),
        provider: provider.name,
        error: errorMessage,
      }),
    });

    throw err;
  }
}
