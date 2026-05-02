import type { RiskLevel } from "@regops-ai/database";

export interface WalletScreeningResult {
  provider: string;
  providerRunId?: string;
  riskScore: number | null;
  riskLevel: RiskLevel;
  categories: string[];
  labels: string[];
  summary: string;
}

export interface ScreenWalletInput {
  network: string;
  address: string;
}

export interface OnChainProvider {
  readonly name: string;
  screenWalletAddress(input: ScreenWalletInput): Promise<WalletScreeningResult>;
}
