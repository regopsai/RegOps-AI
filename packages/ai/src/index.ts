import type { AIProvider, GenerateStructuredInput, GenerateStructuredOutput, TokenUsage } from "./provider";
import { OpenAICompatibleProvider } from "./openai-compatible-provider";
import { MockProvider } from "./mock-provider";
import {
  riskMemoAIOutputSchema,
  evidenceReferenceSchema,
  type RiskMemoAIOutput,
  type EvidenceReference,
} from "./schemas";
import {
  AIProviderError,
  AIValidationError,
  AIRequestError,
  AITimeoutError,
} from "./errors";

export type { AIProvider, GenerateStructuredInput, GenerateStructuredOutput, TokenUsage };
export { OpenAICompatibleProvider, MockProvider };
export { riskMemoAIOutputSchema, evidenceReferenceSchema, type RiskMemoAIOutput, type EvidenceReference };
export { AIProviderError, AIValidationError, AIRequestError, AITimeoutError };

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function isTest(): boolean {
  return process.env.NODE_ENV === "test";
}

function allowMockInProduction(): boolean {
  return process.env.REGOPS_ALLOW_MOCK_AI_IN_PRODUCTION === "true";
}

export class AIConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIConfigurationError";
  }
}

export function createAIProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER?.trim();
  const apiKey = process.env.AI_API_KEY?.trim() ?? "";
  const baseUrl = process.env.AI_BASE_URL?.trim();
  const model = process.env.AI_MODEL?.trim();
  const timeoutMs = process.env.AI_REQUEST_TIMEOUT_MS
    ? parseInt(process.env.AI_REQUEST_TIMEOUT_MS, 10)
    : 30000;

  // Explicit openai-compatible provider
  if (provider === "openai-compatible") {
    if (!apiKey) {
      throw new AIConfigurationError(
        "AI_API_KEY is required when AI_PROVIDER=openai-compatible"
      );
    }
    if (!model) {
      throw new AIConfigurationError(
        "AI_MODEL is required when AI_PROVIDER=openai-compatible"
      );
    }
    return new OpenAICompatibleProvider(apiKey, baseUrl, model, timeoutMs);
  }

  // Explicit mock provider
  if (provider === "mock") {
    if (isProduction() && !allowMockInProduction()) {
      throw new AIConfigurationError(
        "AI_PROVIDER=mock is not allowed in production. " +
          "Set AI_PROVIDER=openai-compatible with a real API key and model, " +
          "or set REGOPS_ALLOW_MOCK_AI_IN_PRODUCTION=true only if you explicitly intend to use mock output in production."
      );
    }
    return new MockProvider();
  }

  // Missing AI_PROVIDER
  if (!provider) {
    if (isProduction()) {
      throw new AIConfigurationError(
        "AI_PROVIDER is required in production. Set AI_PROVIDER=openai-compatible with AI_API_KEY and AI_MODEL."
      );
    }
    if (isTest()) {
      return new MockProvider();
    }
    // Development: use mock with visible fallback
    return new MockProvider();
  }

  // Unknown provider
  throw new AIConfigurationError(
    `Unknown AI_PROVIDER: "${provider}". Supported values: "openai-compatible", "mock".`
  );
}

/**
 * Returns a safe warning flag for UI display.
 * Does not expose API keys or other secrets.
 */
export function getMockProviderWarning(): {
  showWarning: boolean;
  message: string;
} {
  const provider = process.env.AI_PROVIDER?.trim();

  if (provider !== "mock") {
    return { showWarning: false, message: "" };
  }

  if (isProduction()) {
    if (allowMockInProduction()) {
      return {
        showWarning: true,
        message:
          "Mock AI provider is enabled in production. Do not use for real compliance decisions.",
      };
    }
    // This path should not be reachable because createAIProvider throws,
    // but we return a safe default just in case.
    return { showWarning: false, message: "" };
  }

  return {
    showWarning: true,
    message: "Using mock AI provider for local development.",
  };
}
