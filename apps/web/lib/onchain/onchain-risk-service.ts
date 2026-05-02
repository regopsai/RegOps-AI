"use server";

import { prisma, createAuditEvent } from "@regops-ai/database";
import { hasPermission, type Permission, type OrganizationRole } from "@/lib/auth/rbac";
import { maskWalletAddress } from "./masking";
import {
  evaluateWalletHighRiskScore,
  evaluateWalletHighRiskCategory,
  evaluateHighValueStablecoinTransfer,
  evaluateRapidStablecoinSweep,
  evaluateHighRiskCounterparty,
  evaluateCrossChainRiskPattern,
  type OnChainRiskSignalCandidate,
} from "./onchain-risk-rules";

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

async function createOnChainRiskSignals(
  organizationId: string,
  candidates: OnChainRiskSignalCandidate[]
): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    try {
      await prisma.riskSignal.create({
        data: {
          organizationId,
          complianceCaseId: candidate.complianceCaseId ?? null,
          customerProfileId: candidate.customerProfileId ?? null,
          businessProfileId: candidate.businessProfileId ?? null,
          walletAddressId: candidate.walletAddressId ?? null,
          onChainTransactionId: candidate.onChainTransactionId ?? null,
          ruleId: candidate.ruleId,
          title: candidate.title,
          description: candidate.description,
          severity: candidate.severity,
          evidenceJson: candidate.evidenceJson,
          evidenceHash: candidate.evidenceHash,
        },
      });
      created++;
    } catch (e) {
      const err = e as { code?: string };
      if (err.code === "P2002") {
        skipped++;
      } else {
        throw e;
      }
    }
  }

  return { created, skipped };
}

export async function runOnChainRiskChecksForWalletService(ctx: ActorContext, walletAddressId: string) {
  assertPermission(ctx, "onchain:screen");

  const wallet = await prisma.walletAddress.findFirst({
    where: { id: walletAddressId, organizationId: ctx.organizationId, deletedAt: null },
    include: {
      screeningRuns: { orderBy: { screenedAt: "desc" }, take: 1 },
      onChainTransactions: true,
    },
  });

  if (!wallet) {
    throw new Error("Wallet address not found.");
  }

  const candidates: OnChainRiskSignalCandidate[] = [];

  // Screening-based rules
  if (wallet.screeningRuns.length > 0) {
    const screening = wallet.screeningRuns[0];
    const screeningData = {
      walletAddressId: wallet.id,
      network: wallet.network,
      address: wallet.address,
      riskScore: screening.riskScore,
      riskLevel: screening.riskLevel,
      categories: screening.categoriesJson ? JSON.parse(screening.categoriesJson) as string[] : [],
      labels: screening.labelsJson ? JSON.parse(screening.labelsJson) as string[] : [],
      provider: screening.provider,
    };

    const highScore = evaluateWalletHighRiskScore(screeningData);
    if (highScore) candidates.push(highScore);

    const highCategory = evaluateWalletHighRiskCategory(screeningData);
    if (highCategory) candidates.push(highCategory);
  }

  // Transaction-based rules
  for (const tx of wallet.onChainTransactions) {
    const highValue = evaluateHighValueStablecoinTransfer({
      id: tx.id,
      walletAddressId: tx.walletAddressId,
      complianceCaseId: tx.complianceCaseId,
      network: tx.network,
      txHash: tx.txHash,
      direction: tx.direction,
      assetSymbol: tx.assetSymbol,
      amount: tx.amount,
      usdValue: tx.usdValue,
      counterpartyAddress: tx.counterpartyAddress,
      counterpartyLabel: tx.counterpartyLabel,
      counterpartyRiskLevel: tx.counterpartyRiskLevel,
      counterpartyCategory: tx.counterpartyCategory,
      blockTime: tx.blockTime,
    });
    if (highValue) candidates.push(highValue);

    const highCounterparty = evaluateHighRiskCounterparty({
      id: tx.id,
      walletAddressId: tx.walletAddressId,
      complianceCaseId: tx.complianceCaseId,
      network: tx.network,
      txHash: tx.txHash,
      direction: tx.direction,
      assetSymbol: tx.assetSymbol,
      amount: tx.amount,
      usdValue: tx.usdValue,
      counterpartyAddress: tx.counterpartyAddress,
      counterpartyLabel: tx.counterpartyLabel,
      counterpartyRiskLevel: tx.counterpartyRiskLevel,
      counterpartyCategory: tx.counterpartyCategory,
      blockTime: tx.blockTime,
    });
    if (highCounterparty) candidates.push(highCounterparty);
  }

  const rapidSweep = evaluateRapidStablecoinSweep(
    wallet.onChainTransactions.map((tx) => ({
      id: tx.id,
      walletAddressId: tx.walletAddressId,
      complianceCaseId: tx.complianceCaseId,
      network: tx.network,
      txHash: tx.txHash,
      direction: tx.direction,
      assetSymbol: tx.assetSymbol,
      amount: tx.amount,
      usdValue: tx.usdValue,
      counterpartyAddress: tx.counterpartyAddress,
      counterpartyLabel: tx.counterpartyLabel,
      counterpartyRiskLevel: tx.counterpartyRiskLevel,
      counterpartyCategory: tx.counterpartyCategory,
      blockTime: tx.blockTime,
    }))
  );
  if (rapidSweep) candidates.push(rapidSweep);

  const result = await createOnChainRiskSignals(ctx.organizationId, candidates);

  if (result.created > 0 || result.skipped > 0) {
    await createAuditEvent({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "ONCHAIN_RISK_SIGNALS_GENERATED",
      entityType: "WalletAddress",
      entityId: walletAddressId,
      metadataJson: JSON.stringify({
        walletAddressId,
        network: wallet.network,
        addressMasked: maskWalletAddress(wallet.address),
        createdCount: result.created,
        skippedCount: result.skipped,
      }),
    });
  }

  return result;
}

export async function runOnChainRiskChecksForCaseService(ctx: ActorContext, caseId: string) {
  assertPermission(ctx, "onchain:screen");

  const caseRecord = await prisma.complianceCase.findFirst({
    where: { id: caseId, organizationId: ctx.organizationId, deletedAt: null },
    include: {
      walletAddresses: {
        where: { deletedAt: null },
        include: {
          screeningRuns: { orderBy: { screenedAt: "desc" }, take: 1 },
          onChainTransactions: true,
        },
      },
      onChainTransactions: true,
    },
  });

  if (!caseRecord) {
    throw new Error("Case not found.");
  }

  const candidates: OnChainRiskSignalCandidate[] = [];

  // Check each wallet
  for (const wallet of caseRecord.walletAddresses) {
    if (wallet.screeningRuns.length > 0) {
      const screening = wallet.screeningRuns[0];
      const screeningData = {
        walletAddressId: wallet.id,
        network: wallet.network,
        address: wallet.address,
        riskScore: screening.riskScore,
        riskLevel: screening.riskLevel,
        categories: screening.categoriesJson ? JSON.parse(screening.categoriesJson) as string[] : [],
        labels: screening.labelsJson ? JSON.parse(screening.labelsJson) as string[] : [],
        provider: screening.provider,
      };

      const highScore = evaluateWalletHighRiskScore(screeningData);
      if (highScore) {
        highScore.complianceCaseId = caseId;
        highScore.customerProfileId = wallet.customerProfileId ?? undefined;
        highScore.businessProfileId = wallet.businessProfileId ?? undefined;
        candidates.push(highScore);
      }

      const highCategory = evaluateWalletHighRiskCategory(screeningData);
      if (highCategory) {
        highCategory.complianceCaseId = caseId;
        highCategory.customerProfileId = wallet.customerProfileId ?? undefined;
        highCategory.businessProfileId = wallet.businessProfileId ?? undefined;
        candidates.push(highCategory);
      }
    }

    for (const tx of wallet.onChainTransactions) {
      const highValue = evaluateHighValueStablecoinTransfer({
        id: tx.id,
        walletAddressId: tx.walletAddressId,
        complianceCaseId: tx.complianceCaseId,
        network: tx.network,
        txHash: tx.txHash,
        direction: tx.direction,
        assetSymbol: tx.assetSymbol,
        amount: tx.amount,
        usdValue: tx.usdValue,
        counterpartyAddress: tx.counterpartyAddress,
        counterpartyLabel: tx.counterpartyLabel,
        counterpartyRiskLevel: tx.counterpartyRiskLevel,
        counterpartyCategory: tx.counterpartyCategory,
        blockTime: tx.blockTime,
      });
      if (highValue) {
        highValue.complianceCaseId = caseId;
        highValue.customerProfileId = wallet.customerProfileId ?? undefined;
        highValue.businessProfileId = wallet.businessProfileId ?? undefined;
        candidates.push(highValue);
      }

      const highCounterparty = evaluateHighRiskCounterparty({
        id: tx.id,
        walletAddressId: tx.walletAddressId,
        complianceCaseId: tx.complianceCaseId,
        network: tx.network,
        txHash: tx.txHash,
        direction: tx.direction,
        assetSymbol: tx.assetSymbol,
        amount: tx.amount,
        usdValue: tx.usdValue,
        counterpartyAddress: tx.counterpartyAddress,
        counterpartyLabel: tx.counterpartyLabel,
        counterpartyRiskLevel: tx.counterpartyRiskLevel,
        counterpartyCategory: tx.counterpartyCategory,
        blockTime: tx.blockTime,
      });
      if (highCounterparty) {
        highCounterparty.complianceCaseId = caseId;
        highCounterparty.customerProfileId = wallet.customerProfileId ?? undefined;
        highCounterparty.businessProfileId = wallet.businessProfileId ?? undefined;
        candidates.push(highCounterparty);
      }
    }

    const rapidSweep = evaluateRapidStablecoinSweep(
      wallet.onChainTransactions.map((tx) => ({
        id: tx.id,
        walletAddressId: tx.walletAddressId,
        complianceCaseId: tx.complianceCaseId,
        network: tx.network,
        txHash: tx.txHash,
        direction: tx.direction,
        assetSymbol: tx.assetSymbol,
        amount: tx.amount,
        usdValue: tx.usdValue,
        counterpartyAddress: tx.counterpartyAddress,
        counterpartyLabel: tx.counterpartyLabel,
        counterpartyRiskLevel: tx.counterpartyRiskLevel,
        counterpartyCategory: tx.counterpartyCategory,
        blockTime: tx.blockTime,
      }))
    );
    if (rapidSweep) {
      rapidSweep.complianceCaseId = caseId;
      rapidSweep.customerProfileId = wallet.customerProfileId ?? undefined;
      rapidSweep.businessProfileId = wallet.businessProfileId ?? undefined;
      candidates.push(rapidSweep);
    }
  }

  // Cross-chain using case-level transactions
  const allCaseTxs = caseRecord.onChainTransactions.map((tx) => ({
    id: tx.id,
    walletAddressId: tx.walletAddressId,
    complianceCaseId: tx.complianceCaseId,
    network: tx.network,
    txHash: tx.txHash,
    direction: tx.direction,
    assetSymbol: tx.assetSymbol,
    amount: tx.amount,
    usdValue: tx.usdValue,
    counterpartyAddress: tx.counterpartyAddress,
    counterpartyLabel: tx.counterpartyLabel,
    counterpartyRiskLevel: tx.counterpartyRiskLevel,
    counterpartyCategory: tx.counterpartyCategory,
    blockTime: tx.blockTime,
  }));

  const crossChain = evaluateCrossChainRiskPattern(allCaseTxs, caseId);
  if (crossChain) {
    crossChain.complianceCaseId = caseId;
    candidates.push(crossChain);
  }

  const result = await createOnChainRiskSignals(ctx.organizationId, candidates);

  if (result.created > 0 || result.skipped > 0) {
    await createAuditEvent({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "ONCHAIN_RISK_SIGNALS_GENERATED",
      entityType: "ComplianceCase",
      entityId: caseId,
      metadataJson: JSON.stringify({
        complianceCaseId: caseId,
        createdCount: result.created,
        skippedCount: result.skipped,
      }),
    });
  }

  return result;
}
