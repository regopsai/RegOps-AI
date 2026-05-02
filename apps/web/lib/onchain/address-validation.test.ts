import { describe, it, expect } from "vitest";
import {
  validateWalletAddress,
  normalizeWalletAddress,
  isValidEvmAddress,
  isValidSolanaAddress,
  isValidTronAddress,
} from "./address-validation";
import { OnChainValidationError } from "./providers/errors";

describe("address-validation", () => {
  describe("isValidEvmAddress", () => {
    it("accepts valid EVM address", () => {
      expect(isValidEvmAddress("0x1234567890abcdef1234567890abcdef12345678")).toBe(true);
    });
    it("rejects invalid EVM address", () => {
      expect(isValidEvmAddress("0x123")).toBe(false);
      expect(isValidEvmAddress("1234567890abcdef1234567890abcdef12345678")).toBe(false);
      expect(isValidEvmAddress("0xGGGG567890abcdef1234567890abcdef12345678")).toBe(false);
    });
  });

  describe("isValidSolanaAddress", () => {
    it("accepts valid Solana address", () => {
      expect(isValidSolanaAddress("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU")).toBe(true);
    });
    it("rejects invalid Solana address", () => {
      expect(isValidSolanaAddress("too_short")).toBe(false);
      expect(isValidSolanaAddress("0x1234567890abcdef1234567890abcdef12345678")).toBe(false);
    });
  });

  describe("isValidTronAddress", () => {
    it("accepts valid Tron address", () => {
      expect(isValidTronAddress("TKrLU9dGtnHT3Z1qoekY6oEg7qPLbzdn3C")).toBe(true);
    });
    it("rejects invalid Tron address", () => {
      expect(isValidTronAddress("ABC123")).toBe(false);
      expect(isValidTronAddress("0x1234567890abcdef1234567890abcdef12345678")).toBe(false);
    });
  });

  describe("normalizeWalletAddress", () => {
    it("lowercases EVM/Base addresses", () => {
      expect(normalizeWalletAddress("ETHEREUM", "0xABC")).toBe("0xabc");
      expect(normalizeWalletAddress("BASE", "0xABC")).toBe("0xabc");
    });
    it("preserves Solana/Tron original but trims", () => {
      expect(normalizeWalletAddress("SOLANA", "  ABC  ")).toBe("ABC");
      expect(normalizeWalletAddress("TRON", "  TKr  ")).toBe("TKr");
    });
  });

  describe("validateWalletAddress", () => {
    it("accepts and normalizes valid EVM address", () => {
      const addr = validateWalletAddress("ETHEREUM", "0xAbCdEf1234567890aBcDeF1234567890abCdeF12");
      expect(addr).toBe("0xabcdef1234567890abcdef1234567890abcdef12");
    });
    it("accepts and normalizes valid Base address", () => {
      const addr = validateWalletAddress("BASE", "0xAbCdEf1234567890aBcDeF1234567890abCdeF12");
      expect(addr).toBe("0xabcdef1234567890abcdef1234567890abcdef12");
    });
    it("accepts valid Solana address", () => {
      const addr = validateWalletAddress("SOLANA", "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU");
      expect(addr).toBe("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU");
    });
    it("accepts valid Tron address", () => {
      const addr = validateWalletAddress("TRON", "TKrLU9dGtnHT3Z1qoekY6oEg7qPLbzdn3C");
      expect(addr).toBe("TKrLU9dGtnHT3Z1qoekY6oEg7qPLbzdn3C");
    });
    it("rejects invalid EVM address", () => {
      expect(() => validateWalletAddress("ETHEREUM", "bad")).toThrow(OnChainValidationError);
    });
    it("rejects invalid Solana address", () => {
      expect(() => validateWalletAddress("SOLANA", "bad")).toThrow(OnChainValidationError);
    });
    it("rejects invalid Tron address", () => {
      expect(() => validateWalletAddress("TRON", "bad")).toThrow(OnChainValidationError);
    });
    it("rejects unsupported network", () => {
      expect(() => validateWalletAddress("BITCOIN", "1A...")).toThrow(OnChainValidationError);
    });
    it("trims whitespace", () => {
      const addr = validateWalletAddress("ETHEREUM", "  0xAbCdEf1234567890aBcDeF1234567890abCdeF12  ");
      expect(addr).toBe("0xabcdef1234567890abcdef1234567890abcdef12");
    });
  });
});
