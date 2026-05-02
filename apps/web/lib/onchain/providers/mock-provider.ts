import type { OnChainProvider, ScreenWalletInput, WalletScreeningResult } from "./provider";
import type { RiskLevel } from "@regops-ai/database";
import { OnChainConfigurationError } from "./errors";

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function mockAllowedInProduction(): boolean {
  return process.env.REGOPS_ALLOW_MOCK_ONCHAIN_PROVIDER_IN_PRODUCTION === "true";
}

function deterministicRiskLevel(address: string): RiskLevel {
  const firstChar = address.charCodeAt(0) % 5;
  const levels: RiskLevel[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL", "UNKNOWN"];
  return levels[firstChar] ?? "UNKNOWN";
}

function deterministicScore(address: string): number | null {
  const sum = address.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return sum % 101;
}

function deterministicCategories(address: string): string[] {
  const cats: string[] = [];
  if (address.length % 2 === 0) cats.push("exchange");
  if (address.includes("a") || address.includes("A")) cats.push("defi");
  if (address.includes("1") || address.includes("2")) cats.push("wallet");
  return cats;
}

function deterministicLabels(address: string): string[] {
  const labels: string[] = [];
  if (address.length > 30) labels.push("long_address");
  if (address.startsWith("0x")) labels.push("evm");
  return labels;
}

export class MockOnChainProvider implements OnChainProvider {
  readonly name = "mock";

  constructor() {
    if (isProduction() && !mockAllowedInProduction()) {
      throw new OnChainConfigurationError(
        "Mock on-chain provider is blocked in production. Set REGOPS_ALLOW_MOCK_ONCHAIN_PROVIDER_IN_PRODUCTION=true only if explicitly intended."
      );
    }
  }

  async screenWalletAddress(input: ScreenWalletInput): Promise<WalletScreeningResult> {
    const level = deterministicRiskLevel(input.address);
    const score = deterministicScore(input.address);
    const categories = deterministicCategories(input.address);
    const labels = deterministicLabels(input.address);

    const summaryParts: string[] = [];
    summaryParts.push(`Mock screening for ${input.network} address.`);
    if (score !== null) summaryParts.push(`Score: ${score}.`);
    summaryParts.push(`Level: ${level}.`);
    if (categories.length > 0) summaryParts.push(`Categories: ${categories.join(", ")}.`);

    return {
      provider: this.name,
      providerRunId: `mock-${input.network}-${input.address.slice(0, 8)}`,
      riskScore: score,
      riskLevel: level,
      categories,
      labels,
      summary: summaryParts.join(" "),
    };
  }
}
