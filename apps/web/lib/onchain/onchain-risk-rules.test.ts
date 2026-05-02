import { describe, it, expect } from "vitest";
import {
  evaluateWalletHighRiskScore,
  evaluateWalletHighRiskCategory,
  evaluateHighValueStablecoinTransfer,
  evaluateRapidStablecoinSweep,
  evaluateHighRiskCounterparty,
  evaluateCrossChainRiskPattern,
} from "./onchain-risk-rules";
import type { RiskLevel } from "@regops-ai/database";

interface TxLike {
  id: string;
  walletAddressId: string;
  complianceCaseId: string;
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

function makeTx(overrides: Partial<TxLike> = {}): TxLike {
  return {
    id: "tx-1",
    walletAddressId: "wallet-1",
    complianceCaseId: "case-1",
    network: "SOLANA",
    txHash: "hash1",
    direction: "INBOUND",
    assetSymbol: "USDC",
    amount: { toString: () => "5000" },
    usdValue: { toString: () => "5000" },
    counterpartyAddress: null,
    counterpartyLabel: null,
    counterpartyRiskLevel: null,
    counterpartyCategory: null,
    blockTime: new Date("2024-01-15T10:00:00Z"),
    ...overrides,
  };
}

describe("onchain-risk-rules", () => {
  describe("evaluateWalletHighRiskScore", () => {
    it("triggers for HIGH risk level", () => {
      const result = evaluateWalletHighRiskScore({
        walletAddressId: "w1",
        network: "SOLANA",
        address: "ABC123",
        riskScore: 85,
        riskLevel: "HIGH" as RiskLevel,
        categories: [],
        labels: [],
        provider: "manual",
      });
      expect(result).not.toBeNull();
      expect(result?.severity).toBe("HIGH");
    });

    it("triggers for CRITICAL risk level", () => {
      const result = evaluateWalletHighRiskScore({
        walletAddressId: "w1",
        network: "SOLANA",
        address: "ABC123",
        riskScore: 90,
        riskLevel: "CRITICAL" as RiskLevel,
        categories: [],
        labels: [],
        provider: "manual",
      });
      expect(result?.severity).toBe("CRITICAL");
    });

    it("triggers for score >= 80", () => {
      const result = evaluateWalletHighRiskScore({
        walletAddressId: "w1",
        network: "SOLANA",
        address: "ABC123",
        riskScore: 80,
        riskLevel: "MEDIUM" as RiskLevel,
        categories: [],
        labels: [],
        provider: "manual",
      });
      expect(result).not.toBeNull();
    });

    it("does not trigger for low score and low level", () => {
      const result = evaluateWalletHighRiskScore({
        walletAddressId: "w1",
        network: "SOLANA",
        address: "ABC123",
        riskScore: 50,
        riskLevel: "LOW" as RiskLevel,
        categories: [],
        labels: [],
        provider: "manual",
      });
      expect(result).toBeNull();
    });
  });

  describe("evaluateWalletHighRiskCategory", () => {
    it("triggers for sanctioned category", () => {
      const result = evaluateWalletHighRiskCategory({
        walletAddressId: "w1",
        network: "SOLANA",
        address: "ABC123",
        riskScore: null,
        riskLevel: "UNKNOWN" as RiskLevel,
        categories: ["sanctioned"],
        labels: [],
        provider: "manual",
      });
      expect(result?.severity).toBe("CRITICAL");
    });

    it("triggers for mixer category", () => {
      const result = evaluateWalletHighRiskCategory({
        walletAddressId: "w1",
        network: "SOLANA",
        address: "ABC123",
        riskScore: null,
        riskLevel: "UNKNOWN" as RiskLevel,
        categories: ["mixer"],
        labels: [],
        provider: "manual",
      });
      expect(result?.severity).toBe("HIGH");
    });

    it("does not trigger for safe categories", () => {
      const result = evaluateWalletHighRiskCategory({
        walletAddressId: "w1",
        network: "SOLANA",
        address: "ABC123",
        riskScore: null,
        riskLevel: "UNKNOWN" as RiskLevel,
        categories: ["exchange", "wallet"],
        labels: [],
        provider: "manual",
      });
      expect(result).toBeNull();
    });
  });

  describe("evaluateHighValueStablecoinTransfer", () => {
    it("triggers for high-value USDC", () => {
      const result = evaluateHighValueStablecoinTransfer(makeTx({
        assetSymbol: "USDC",
        amount: { toString: () => "15000" },
        usdValue: { toString: () => "15000" },
      }));
      expect(result).not.toBeNull();
      expect(result?.severity).toBe("HIGH");
    });

    it("triggers when usdValue missing but amount high", () => {
      const result = evaluateHighValueStablecoinTransfer(makeTx({
        assetSymbol: "USDT",
        amount: { toString: () => "15000" },
        usdValue: null,
      }));
      expect(result).not.toBeNull();
    });

    it("does not trigger for low value", () => {
      const result = evaluateHighValueStablecoinTransfer(makeTx({
        assetSymbol: "USDC",
        amount: { toString: () => "100" },
        usdValue: { toString: () => "100" },
      }));
      expect(result).toBeNull();
    });

    it("does not trigger for non-stablecoin", () => {
      const result = evaluateHighValueStablecoinTransfer(makeTx({
        assetSymbol: "BTC",
        amount: { toString: () => "15000" },
        usdValue: { toString: () => "15000" },
      }));
      expect(result).toBeNull();
    });
  });

  describe("evaluateRapidStablecoinSweep", () => {
    it("triggers for rapid inbound+outbound within 30min", () => {
      const baseTime = new Date("2024-01-15T10:00:00Z");
      const txs = [
        makeTx({
          id: "tx-in",
          direction: "INBOUND",
          assetSymbol: "USDC",
          amount: { toString: () => "15000" },
          usdValue: { toString: () => "15000" },
          blockTime: baseTime,
        }),
        makeTx({
          id: "tx-out",
          direction: "OUTBOUND",
          assetSymbol: "USDC",
          amount: { toString: () => "14900" },
          usdValue: { toString: () => "14900" },
          blockTime: new Date(baseTime.getTime() + 10 * 60 * 1000),
        }),
      ];
      const result = evaluateRapidStablecoinSweep(txs);
      expect(result).not.toBeNull();
      expect(result?.severity).toBe("HIGH");
    });

    it("does not trigger if time gap exceeds 30min", () => {
      const baseTime = new Date("2024-01-15T10:00:00Z");
      const txs = [
        makeTx({
          id: "tx-in",
          direction: "INBOUND",
          assetSymbol: "USDC",
          amount: { toString: () => "10000" },
          blockTime: baseTime,
        }),
        makeTx({
          id: "tx-out",
          direction: "OUTBOUND",
          assetSymbol: "USDC",
          amount: { toString: () => "9900" },
          blockTime: new Date(baseTime.getTime() + 60 * 60 * 1000),
        }),
      ];
      const result = evaluateRapidStablecoinSweep(txs);
      expect(result).toBeNull();
    });

    it("does not trigger for non-stablecoin", () => {
      const txs = [
        makeTx({ direction: "INBOUND", assetSymbol: "BTC", amount: { toString: () => "10000" } }),
        makeTx({ direction: "OUTBOUND", assetSymbol: "BTC", amount: { toString: () => "9900" } }),
      ];
      const result = evaluateRapidStablecoinSweep(txs);
      expect(result).toBeNull();
    });
  });

  describe("evaluateHighRiskCounterparty", () => {
    it("triggers for CRITICAL counterparty", () => {
      const result = evaluateHighRiskCounterparty(makeTx({
        counterpartyAddress: "0xbad",
        counterpartyRiskLevel: "CRITICAL" as RiskLevel,
      }));
      expect(result?.severity).toBe("CRITICAL");
    });

    it("triggers for darknet category", () => {
      const result = evaluateHighRiskCounterparty(makeTx({
        counterpartyAddress: "0xbad",
        counterpartyCategory: "darknet",
      }));
      expect(result?.severity).toBe("HIGH");
    });

    it("does not trigger for safe counterparty", () => {
      const result = evaluateHighRiskCounterparty(makeTx({
        counterpartyAddress: "0xgood",
        counterpartyRiskLevel: "LOW" as RiskLevel,
      }));
      expect(result).toBeNull();
    });

    it("does not trigger if no counterparty address", () => {
      const result = evaluateHighRiskCounterparty(makeTx({
        counterpartyAddress: null,
        counterpartyRiskLevel: "HIGH" as RiskLevel,
      }));
      expect(result).toBeNull();
    });
  });

  describe("evaluateCrossChainRiskPattern", () => {
    it("triggers for multi-network within 24h with high value", () => {
      const txs = [
        makeTx({ network: "SOLANA", assetSymbol: "USDC", amount: { toString: () => "6000" }, usdValue: { toString: () => "6000" }, blockTime: new Date("2024-01-15T10:00:00Z") }),
        makeTx({ network: "BASE", assetSymbol: "USDT", amount: { toString: () => "5000" }, usdValue: { toString: () => "5000" }, blockTime: new Date("2024-01-15T11:00:00Z") }),
      ];
      const result = evaluateCrossChainRiskPattern(txs, "case-1");
      expect(result).not.toBeNull();
      expect(result?.severity).toBe("MEDIUM");
    });

    it("does not trigger for single network", () => {
      const txs = [
        makeTx({ network: "SOLANA", assetSymbol: "USDC", amount: { toString: () => "15000" }, usdValue: { toString: () => "15000" }, blockTime: new Date("2024-01-15T10:00:00Z") }),
      ];
      const result = evaluateCrossChainRiskPattern(txs);
      expect(result).toBeNull();
    });

    it("does not trigger if aggregate below threshold", () => {
      const txs = [
        makeTx({ network: "SOLANA", assetSymbol: "USDC", amount: { toString: () => "1000" }, usdValue: { toString: () => "1000" }, blockTime: new Date("2024-01-15T10:00:00Z") }),
        makeTx({ network: "BASE", assetSymbol: "USDT", amount: { toString: () => "1000" }, usdValue: { toString: () => "1000" }, blockTime: new Date("2024-01-15T11:00:00Z") }),
      ];
      const result = evaluateCrossChainRiskPattern(txs);
      expect(result).toBeNull();
    });
  });
});
