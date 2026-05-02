import { createHash } from "crypto";
import type { RiskLevel } from "@regops-ai/database";

export interface OnChainRiskSignalCandidate {
  ruleId: string;
  title: string;
  description: string;
  severity: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  evidenceJson: string;
  evidenceHash: string;
  complianceCaseId?: string;
  customerProfileId?: string;
  businessProfileId?: string;
  walletAddressId?: string;
  onChainTransactionId?: string;
}

interface WalletScreening {
  walletAddressId: string;
  network: string;
  address: string;
  riskScore: number | null;
  riskLevel: RiskLevel;
  categories: string[];
  labels: string[];
  provider: string;
}

interface OnChainTx {
  id: string;
  walletAddressId: string | null;
  complianceCaseId: string | null;
  network: string;
  txHash: string;
  direction: string;
  assetSymbol: string;
  amount: { toString(): string };
  usdValue: { toString(): string } | null;
  counterpartyAddress: string | null;
  counterpartyLabel: string | null;
  counterpartyRiskLevel: RiskLevel | null;
  counterpartyCategory: string | null;
  blockTime: Date;
}

function canonicalStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(canonicalStringify).join(",")}]`;
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map((k) => `"${k}":${canonicalStringify((obj as Record<string, unknown>)[k])}`);
  return `{${pairs.join(",")}}`;
}

function hashEvidence(data: unknown): string {
  return createHash("sha256").update(canonicalStringify(data)).digest("hex");
}

const STABLECOINS = new Set(["USDC", "USDT", "PYUSD", "EURC"]);
const HIGH_RISK_CATEGORIES = new Set(["mixer", "sanctioned", "scam", "darknet", "terrorist_financing", "ransomware"]);

function isStablecoin(symbol: string): boolean {
  return STABLECOINS.has(symbol.toUpperCase());
}

function toDecimalString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toFixed(8);
  if (value && typeof value === "object" && "toString" in value) {
    return value.toString();
  }
  return String(value);
}

// Rule 1: WALLET_HIGH_RISK_SCORE
export function evaluateWalletHighRiskScore(screening: WalletScreening): OnChainRiskSignalCandidate | null {
  const isHigh = screening.riskLevel === "HIGH" || screening.riskLevel === "CRITICAL";
  const isScoreHigh = screening.riskScore !== null && screening.riskScore >= 80;

  if (!isHigh && !isScoreHigh) return null;

  const severity = screening.riskLevel === "CRITICAL" ? "CRITICAL" : "HIGH";

  const evidence = {
    walletAddressId: screening.walletAddressId,
    addressMasked: `${screening.address.slice(0, 4)}...${screening.address.slice(-4)}`,
    provider: screening.provider,
    riskScore: screening.riskScore,
    riskLevel: screening.riskLevel,
    categories: screening.categories,
    labels: screening.labels,
  };

  return {
    ruleId: "WALLET_HIGH_RISK_SCORE",
    title: "Wallet high risk score",
    description: `Wallet screening from ${screening.provider} indicates ${screening.riskLevel} risk (score: ${screening.riskScore ?? "N/A"}).`,
    severity,
    evidenceJson: JSON.stringify(evidence),
    evidenceHash: hashEvidence(evidence),
    walletAddressId: screening.walletAddressId,
  };
}

// Rule 2: WALLET_HIGH_RISK_CATEGORY
export function evaluateWalletHighRiskCategory(screening: WalletScreening): OnChainRiskSignalCandidate | null {
  const allTags = [...screening.categories, ...screening.labels].map((t) => t.toLowerCase());
  const matches = allTags.filter((t) => HIGH_RISK_CATEGORIES.has(t));

  if (matches.length === 0) return null;

  const criticalTags = ["sanctioned", "terrorist_financing", "ransomware"];
  const isCritical = matches.some((m) => criticalTags.includes(m));
  const severity = isCritical ? "CRITICAL" : "HIGH";

  const evidence = {
    walletAddressId: screening.walletAddressId,
    provider: screening.provider,
    matchingCategoriesLabels: matches,
    allCategories: screening.categories,
    allLabels: screening.labels,
  };

  return {
    ruleId: "WALLET_HIGH_RISK_CATEGORY",
    title: "Wallet high-risk category indicator",
    description: `Provider-indicated high-risk categories/labels: ${matches.join(", ")}.`,
    severity,
    evidenceJson: JSON.stringify(evidence),
    evidenceHash: hashEvidence(evidence),
    walletAddressId: screening.walletAddressId,
  };
}

// Rule 3: HIGH_VALUE_STABLECOIN_TRANSFER
export function evaluateHighValueStablecoinTransfer(tx: OnChainTx): OnChainRiskSignalCandidate | null {
  if (!isStablecoin(tx.assetSymbol)) return null;

  const usdVal = tx.usdValue ? parseFloat(toDecimalString(tx.usdValue)) : null;
  const amountVal = parseFloat(toDecimalString(tx.amount));
  const threshold = 10000;

  if ((usdVal !== null && usdVal < threshold) && amountVal < threshold) return null;

  const evidence = {
    onChainTransactionId: tx.id,
    network: tx.network,
    txHash: tx.txHash,
    assetSymbol: tx.assetSymbol,
    amount: toDecimalString(tx.amount),
    usdValue: usdVal,
    threshold,
  };

  return {
    ruleId: "HIGH_VALUE_STABLECOIN_TRANSFER",
    title: "High-value stablecoin transfer",
    description: `On-chain transaction ${tx.txHash} involves ${toDecimalString(tx.amount)} ${tx.assetSymbol} (>= ${threshold}).`,
    severity: "HIGH",
    evidenceJson: JSON.stringify(evidence),
    evidenceHash: hashEvidence(evidence),
    onChainTransactionId: tx.id,
    walletAddressId: tx.walletAddressId ?? undefined,
    complianceCaseId: tx.complianceCaseId ?? undefined,
  };
}

// Rule 4: RAPID_STABLECOIN_SWEEP
export function evaluateRapidStablecoinSweep(txs: OnChainTx[]): OnChainRiskSignalCandidate | null {
  const windowMinutes = 30;
  const tolerance = 0.1; // 10%
  const thresholdHigh = 10000;

  const stablecoinTxs = txs.filter((t) => isStablecoin(t.assetSymbol));
  const inbounds = stablecoinTxs.filter((t) => t.direction === "INBOUND");
  const outbounds = stablecoinTxs.filter((t) => t.direction === "OUTBOUND");

  for (const inbound of inbounds) {
    for (const outbound of outbounds) {
      const timeDeltaMin = Math.abs(outbound.blockTime.getTime() - inbound.blockTime.getTime()) / (1000 * 60);
      if (timeDeltaMin > windowMinutes) continue;
      if (inbound.walletAddressId !== outbound.walletAddressId) continue;

      const inAmt = parseFloat(toDecimalString(inbound.amount));
      const outAmt = parseFloat(toDecimalString(outbound.amount));
      if (inAmt === 0) continue;

      const amountDelta = Math.abs(outAmt - inAmt) / inAmt;
      if (amountDelta > tolerance) continue;

      const avgAmt = (inAmt + outAmt) / 2;
      const severity = avgAmt >= thresholdHigh ? "HIGH" : "MEDIUM";

      const evidence = {
        inboundTxId: inbound.id,
        inboundTxHash: inbound.txHash,
        outboundTxId: outbound.id,
        outboundTxHash: outbound.txHash,
        walletAddressId: inbound.walletAddressId,
        timeDeltaMinutes: Math.round(timeDeltaMin),
        amountDelta,
        assetSymbol: inbound.assetSymbol,
        inboundAmount: toDecimalString(inbound.amount),
        outboundAmount: toDecimalString(outbound.amount),
      };

      return {
        ruleId: "RAPID_STABLECOIN_SWEEP",
        title: "Rapid stablecoin sweep",
        description: `Inbound and outbound ${inbound.assetSymbol} within ${Math.round(timeDeltaMin)} minutes from same wallet.`,
        severity,
        evidenceJson: JSON.stringify(evidence),
        evidenceHash: hashEvidence(evidence),
        walletAddressId: inbound.walletAddressId ?? undefined,
        complianceCaseId: inbound.complianceCaseId ?? undefined,
      };
    }
  }

  return null;
}

// Rule 5: HIGH_RISK_COUNTERPARTY
export function evaluateHighRiskCounterparty(tx: OnChainTx): OnChainRiskSignalCandidate | null {
  if (!tx.counterpartyAddress) return null;

  const isHighRiskLevel = tx.counterpartyRiskLevel === "HIGH" || tx.counterpartyRiskLevel === "CRITICAL";
  const isHighRiskCategory = tx.counterpartyCategory ? HIGH_RISK_CATEGORIES.has(tx.counterpartyCategory.toLowerCase()) : false;

  if (!isHighRiskLevel && !isHighRiskCategory) return null;

  const severity = tx.counterpartyRiskLevel === "CRITICAL" ? "CRITICAL" : "HIGH";

  const evidence = {
    onChainTransactionId: tx.id,
    txHash: tx.txHash,
    counterpartyAddressMasked: `${tx.counterpartyAddress.slice(0, 4)}...${tx.counterpartyAddress.slice(-4)}`,
    counterpartyLabel: tx.counterpartyLabel,
    counterpartyRiskLevel: tx.counterpartyRiskLevel,
    counterpartyCategory: tx.counterpartyCategory,
  };

  return {
    ruleId: "HIGH_RISK_COUNTERPARTY",
    title: "High-risk counterparty",
    description: `Transaction ${tx.txHash} involves a high-risk counterparty (${tx.counterpartyRiskLevel ?? tx.counterpartyCategory ?? "unknown"}).`,
    severity,
    evidenceJson: JSON.stringify(evidence),
    evidenceHash: hashEvidence(evidence),
    onChainTransactionId: tx.id,
    walletAddressId: tx.walletAddressId ?? undefined,
    complianceCaseId: tx.complianceCaseId ?? undefined,
  };
}

// Rule 6: CROSS_CHAIN_RISK_PATTERN
export function evaluateCrossChainRiskPattern(txs: OnChainTx[], caseId?: string): OnChainRiskSignalCandidate | null {
  if (txs.length === 0) return null;

  const windowHours = 24;
  const threshold = 10000;

  // Group by network, find time windows
  const byNetwork = new Map<string, OnChainTx[]>();
  for (const tx of txs) {
    const arr = byNetwork.get(tx.network) ?? [];
    arr.push(tx);
    byNetwork.set(tx.network, arr);
  }

  const networks = Array.from(byNetwork.keys());
  if (networks.length < 2) return null;

  // Find any 24h window with >=2 networks and aggregate value >= threshold
  const sorted = [...txs].sort((a, b) => a.blockTime.getTime() - b.blockTime.getTime());

  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i].blockTime;
    const end = new Date(start.getTime() + windowHours * 60 * 60 * 1000);

    const windowTxs = sorted.filter((t) => t.blockTime >= start && t.blockTime <= end);
    const windowNetworks = new Set(windowTxs.map((t) => t.network));

    if (windowNetworks.size >= 2) {
      const totalUsd = windowTxs.reduce((sum, t) => {
        return sum + (t.usdValue ? parseFloat(toDecimalString(t.usdValue)) : parseFloat(toDecimalString(t.amount)));
      }, 0);

      if (totalUsd >= threshold) {
        const evidence = {
          networks: Array.from(windowNetworks),
          txHashes: windowTxs.map((t) => t.txHash),
          timeWindowStart: start.toISOString(),
          timeWindowEnd: end.toISOString(),
          aggregateValue: totalUsd,
          threshold,
          caseId: caseId ?? null,
        };

        return {
          ruleId: "CROSS_CHAIN_RISK_PATTERN",
          title: "Cross-chain risk pattern",
          description: `${windowNetworks.size} networks used within ${windowHours} hours with aggregate value ${totalUsd.toFixed(2)}.`,
          severity: "MEDIUM",
          evidenceJson: JSON.stringify(evidence),
          evidenceHash: hashEvidence(evidence),
          complianceCaseId: caseId ?? undefined,
        };
      }
    }
  }

  return null;
}
