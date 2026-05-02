import { OnChainConfigurationError } from "./errors";
import { MockOnChainProvider } from "./mock-provider";
import type { OnChainProvider } from "./provider";

export function createOnChainProvider(): OnChainProvider {
  const providerName = process.env.ONCHAIN_RISK_PROVIDER?.trim().toLowerCase() || "manual";

  if (providerName === "mock") {
    return new MockOnChainProvider();
  }

  if (providerName === "manual") {
    // Manual provider does not perform live screening; it is a placeholder
    // that indicates screening results are imported via CSV/upload.
    return new ManualOnChainProvider();
  }

  throw new OnChainConfigurationError(
    `Unknown on-chain risk provider: "${providerName}". Supported values: manual, mock.`
  );
}

export function getMockProviderWarning(): { showWarning: boolean; message: string } {
  const providerName = process.env.ONCHAIN_RISK_PROVIDER?.trim().toLowerCase() || "manual";

  if (providerName !== "mock") {
    return { showWarning: false, message: "" };
  }

  const isProd = process.env.NODE_ENV === "production";
  const allowed = process.env.REGOPS_ALLOW_MOCK_ONCHAIN_PROVIDER_IN_PRODUCTION === "true";

  if (isProd && !allowed) {
    return {
      showWarning: true,
      message: "DANGER: Mock on-chain provider is active in production without explicit override. Screening results are fake.",
    };
  }

  return {
    showWarning: true,
    message: "Mock on-chain provider is active. Screening results are deterministic fake data for development/testing only.",
  };
}

class ManualOnChainProvider implements OnChainProvider {
  readonly name = "manual";

  async screenWalletAddress(): Promise<never> {
    throw new OnChainConfigurationError(
      "Manual provider does not support live screening. Import screening results via CSV instead."
    );
  }
}
