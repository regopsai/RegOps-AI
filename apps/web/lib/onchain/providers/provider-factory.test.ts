import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createOnChainProvider, getMockProviderWarning } from "./provider-factory";
import { OnChainConfigurationError } from "./errors";

describe("onchain provider-factory", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function setNodeEnv(value: string) {
    (process.env as Record<string, string>).NODE_ENV = value;
  }

  describe("createOnChainProvider", () => {
    it("returns manual provider by default", () => {
      delete process.env.ONCHAIN_RISK_PROVIDER;
      const provider = createOnChainProvider();
      expect(provider.name).toBe("manual");
    });

    it("returns manual provider when set to manual", () => {
      process.env.ONCHAIN_RISK_PROVIDER = "manual";
      const provider = createOnChainProvider();
      expect(provider.name).toBe("manual");
    });

    it("returns mock provider in non-production when set to mock", () => {
      process.env.ONCHAIN_RISK_PROVIDER = "mock";
      setNodeEnv("development");
      const provider = createOnChainProvider();
      expect(provider.name).toBe("mock");
    });

    it("blocks mock provider in production without override", () => {
      process.env.ONCHAIN_RISK_PROVIDER = "mock";
      setNodeEnv("production");
      delete process.env.REGOPS_ALLOW_MOCK_ONCHAIN_PROVIDER_IN_PRODUCTION;
      expect(() => createOnChainProvider()).toThrow(OnChainConfigurationError);
    });

    it("allows mock provider in production with override", () => {
      process.env.ONCHAIN_RISK_PROVIDER = "mock";
      setNodeEnv("production");
      process.env.REGOPS_ALLOW_MOCK_ONCHAIN_PROVIDER_IN_PRODUCTION = "true";
      const provider = createOnChainProvider();
      expect(provider.name).toBe("mock");
    });

    it("throws for unknown provider", () => {
      process.env.ONCHAIN_RISK_PROVIDER = "chainalysis";
      expect(() => createOnChainProvider()).toThrow(OnChainConfigurationError);
    });
  });

  describe("getMockProviderWarning", () => {
    it("returns no warning when provider is manual", () => {
      process.env.ONCHAIN_RISK_PROVIDER = "manual";
      const warning = getMockProviderWarning();
      expect(warning.showWarning).toBe(false);
    });

    it("returns warning for mock in dev", () => {
      process.env.ONCHAIN_RISK_PROVIDER = "mock";
      setNodeEnv("development");
      const warning = getMockProviderWarning();
      expect(warning.showWarning).toBe(true);
      expect(warning.message).toContain("Mock on-chain provider is active");
    });

    it("returns danger warning for mock in production without override", () => {
      process.env.ONCHAIN_RISK_PROVIDER = "mock";
      setNodeEnv("production");
      delete process.env.REGOPS_ALLOW_MOCK_ONCHAIN_PROVIDER_IN_PRODUCTION;
      const warning = getMockProviderWarning();
      expect(warning.showWarning).toBe(true);
      expect(warning.message).toContain("DANGER");
    });
  });
});
