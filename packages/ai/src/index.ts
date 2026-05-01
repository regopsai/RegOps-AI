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

export function createAIProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER ?? "mock";
  const apiKey = process.env.AI_API_KEY ?? "";
  const baseUrl = process.env.AI_BASE_URL;
  const model = process.env.AI_MODEL;
  const timeoutMs = process.env.AI_REQUEST_TIMEOUT_MS
    ? parseInt(process.env.AI_REQUEST_TIMEOUT_MS, 10)
    : 30000;

  if (provider === "openai-compatible") {
    if (!apiKey) {
      throw new Error("AI_API_KEY is required when AI_PROVIDER=openai-compatible");
    }
    return new OpenAICompatibleProvider(
      apiKey,
      baseUrl,
      model,
      timeoutMs
    );
  }

  return new MockProvider();
}
