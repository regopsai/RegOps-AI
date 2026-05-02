import { z } from "zod";
import { OnChainValidationError } from "./providers/errors";

export const SUPPORTED_NETWORKS = ["SOLANA", "ETHEREUM", "BASE", "TRON"] as const;

export function isValidEvmAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function isValidSolanaAddress(address: string): boolean {
  // Base58-like, length 32-44 chars. Basic format check.
  const trimmed = address.trim();
  if (trimmed.length < 32 || trimmed.length > 44) return false;
  // Base58 alphabet: no 0, O, I, l
  return /^[A-HJ-NP-Za-km-z1-9]+$/.test(trimmed);
}

export function isValidTronAddress(address: string): boolean {
  const trimmed = address.trim();
  if (!trimmed.startsWith("T")) return false;
  if (trimmed.length < 25 || trimmed.length > 45) return false;
  // Base58-like alphabet
  return /^[A-HJ-NP-Za-km-z1-9]+$/.test(trimmed);
}

export function normalizeWalletAddress(network: string, address: string): string {
  const net = network.toUpperCase();
  const trimmed = address.trim();
  if (net === "ETHEREUM" || net === "BASE") {
    return trimmed.toLowerCase();
  }
  return trimmed;
}

export function validateWalletAddress(network: string, address: string): string {
  const net = network.toUpperCase();
  const trimmed = address.trim();

  if (net === "ETHEREUM" || net === "BASE") {
    if (!isValidEvmAddress(trimmed)) {
      throw new OnChainValidationError(`Invalid EVM address for ${net}: must be 0x + 40 hex chars.`);
    }
    return trimmed.toLowerCase();
  }

  if (net === "SOLANA") {
    if (!isValidSolanaAddress(trimmed)) {
      throw new OnChainValidationError("Invalid Solana address: expected base58-like string of 32-44 chars.");
    }
    return trimmed;
  }

  if (net === "TRON") {
    if (!isValidTronAddress(trimmed)) {
      throw new OnChainValidationError("Invalid Tron address: expected T-prefixed base58-like string.");
    }
    return trimmed;
  }

  throw new OnChainValidationError(`Unsupported network: ${network}`);
}

export const blockchainNetworkSchema = z.enum(SUPPORTED_NETWORKS);
