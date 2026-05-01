import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { MockProvider } from "./mock-provider";
import { OpenAICompatibleProvider } from "./openai-compatible-provider";
import { AIValidationError, AIRequestError, AITimeoutError } from "./errors";
import { createAIProvider, getMockProviderWarning, AIConfigurationError } from "./index";

const testSchema = z.object({
  summary: z.string().min(1),
  score: z.number().min(0).max(100),
});

describe("MockProvider", () => {
  it("returns valid structured JSON matching schema", async () => {
    const provider = new MockProvider({
      summary: "Test summary",
      score: 75,
    });

    const result = await provider.generateStructuredJson({
      systemPrompt: "You are a test assistant.",
      userPrompt: "Generate test data.",
      responseSchema: testSchema,
      responseSchemaName: "TestOutput",
    });

    expect(result.outputJson.summary).toBe("Test summary");
    expect(result.outputJson.score).toBe(75);
    expect(result.provider).toBe("mock");
    expect(result.model).toBe("mock-model");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.tokenUsage).toBeDefined();
  });

  it("throws AIValidationError when deterministic output does not match schema", async () => {
    const provider = new MockProvider({
      summary: "",
      score: -1,
    });

    await expect(
      provider.generateStructuredJson({
        systemPrompt: "Test",
        userPrompt: "Test",
        responseSchema: testSchema,
        responseSchemaName: "TestOutput",
      })
    ).rejects.toBeInstanceOf(AIValidationError);
  });
});

describe("OpenAICompatibleProvider", () => {
  let provider: OpenAICompatibleProvider;

  beforeEach(() => {
    provider = new OpenAICompatibleProvider("test-key", "https://api.test.com/v1", "gpt-test", 5000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed structured output on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: { content: JSON.stringify({ summary: "Hello", score: 42 }) },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      })
    );

    const result = await provider.generateStructuredJson({
      systemPrompt: "Test",
      userPrompt: "Test",
      responseSchema: testSchema,
      responseSchemaName: "TestOutput",
    });

    expect(result.outputJson.summary).toBe("Hello");
    expect(result.outputJson.score).toBe(42);
    expect(result.provider).toBe("openai-compatible");
    expect(result.tokenUsage?.totalTokens).toBe(15);
  });

  it("throws AIRequestError on non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => "Rate limited",
      })
    );

    await expect(
      provider.generateStructuredJson({
        systemPrompt: "Test",
        userPrompt: "Test",
        responseSchema: testSchema,
        responseSchemaName: "TestOutput",
      })
    ).rejects.toBeInstanceOf(AIRequestError);
  });

  it("throws AIValidationError when response is not valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: "not json" } }],
        }),
      })
    );

    await expect(
      provider.generateStructuredJson({
        systemPrompt: "Test",
        userPrompt: "Test",
        responseSchema: testSchema,
        responseSchemaName: "TestOutput",
      })
    ).rejects.toBeInstanceOf(AIValidationError);
  });

  it("throws AIValidationError when JSON does not match schema", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ summary: "Hello" }) } }],
        }),
      })
    );

    await expect(
      provider.generateStructuredJson({
        systemPrompt: "Test",
        userPrompt: "Test",
        responseSchema: testSchema,
        responseSchemaName: "TestOutput",
      })
    ).rejects.toBeInstanceOf(AIValidationError);
  });

  it("throws AITimeoutError on abort", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        return new Promise((_, reject) => {
          const err = new Error("Aborted");
          err.name = "AbortError";
          reject(err);
        });
      })
    );

    await expect(
      provider.generateStructuredJson({
        systemPrompt: "Test",
        userPrompt: "Test",
        responseSchema: testSchema,
        responseSchemaName: "TestOutput",
        timeoutMs: 1,
      })
    ).rejects.toBeInstanceOf(AITimeoutError);
  });

  it("does not expose API key in thrown errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "Internal error",
      })
    );

    try {
      await provider.generateStructuredJson({
        systemPrompt: "Test",
        userPrompt: "Test",
        responseSchema: testSchema,
        responseSchemaName: "TestOutput",
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      expect(message).not.toContain("test-key");
    }
  });
});

describe("riskMemoAIOutputSchema", () => {
  it("accepts a complete valid output", () => {
    const output = {
      executiveSummary: "Summary",
      profileSummary: "Profile",
      documentReview: "Docs",
      transactionReview: "TXNs",
      riskSignalsSummary: "Signals",
      missingInformation: "None",
      recommendedAction: "LOW_RISK_REVIEW",
      evidenceReferences: [{ type: "case", id: "c1", label: "Case", relevance: "Primary" }],
      limitations: "Advisory only",
    };
    expect(() => import("./schemas").then((m) => m.riskMemoAIOutputSchema.parse(output))).not.toThrow();
  });

  it("rejects unsupported recommendedAction", async () => {
    const { riskMemoAIOutputSchema } = await import("./schemas");
    const output = {
      executiveSummary: "Summary",
      profileSummary: "Profile",
      documentReview: "Docs",
      transactionReview: "TXNs",
      riskSignalsSummary: "Signals",
      missingInformation: "None",
      recommendedAction: "AUTO_APPROVE",
      evidenceReferences: [{ type: "case", id: "c1", label: "Case", relevance: "Primary" }],
      limitations: "Advisory only",
    };
    const result = riskMemoAIOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });

  it("rejects empty string fields", async () => {
    const { riskMemoAIOutputSchema } = await import("./schemas");
    const output = {
      executiveSummary: "",
      profileSummary: "Profile",
      documentReview: "Docs",
      transactionReview: "TXNs",
      riskSignalsSummary: "Signals",
      missingInformation: "None",
      recommendedAction: "LOW_RISK_REVIEW",
      evidenceReferences: [{ type: "case", id: "c1", label: "Case", relevance: "Primary" }],
      limitations: "Advisory only",
    };
    const result = riskMemoAIOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });
});

describe("createAIProvider configuration safety", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("test env missing AI_PROVIDER uses mock", () => {
    process.env.NODE_ENV = "test";
    delete process.env.AI_PROVIDER;
    const provider = createAIProvider();
    expect(provider.name).toBe("mock");
  });

  it("development missing AI_PROVIDER uses mock", () => {
    process.env.NODE_ENV = "development";
    delete process.env.AI_PROVIDER;
    const provider = createAIProvider();
    expect(provider.name).toBe("mock");
  });

  it("production missing AI_PROVIDER fails closed", () => {
    process.env.NODE_ENV = "production";
    delete process.env.AI_PROVIDER;
    expect(() => createAIProvider()).toThrow(AIConfigurationError);
    expect(() => createAIProvider()).toThrow("AI_PROVIDER is required in production");
  });

  it("production AI_PROVIDER=mock fails closed without override", () => {
    process.env.NODE_ENV = "production";
    process.env.AI_PROVIDER = "mock";
    delete process.env.REGOPS_ALLOW_MOCK_AI_IN_PRODUCTION;
    expect(() => createAIProvider()).toThrow(AIConfigurationError);
    expect(() => createAIProvider()).toThrow("not allowed in production");
  });

  it("production AI_PROVIDER=mock succeeds with override", () => {
    process.env.NODE_ENV = "production";
    process.env.AI_PROVIDER = "mock";
    process.env.REGOPS_ALLOW_MOCK_AI_IN_PRODUCTION = "true";
    const provider = createAIProvider();
    expect(provider.name).toBe("mock");
  });

  it("openai-compatible without AI_API_KEY fails", () => {
    process.env.AI_PROVIDER = "openai-compatible";
    delete process.env.AI_API_KEY;
    process.env.AI_MODEL = "gpt-4o";
    expect(() => createAIProvider()).toThrow(AIConfigurationError);
    expect(() => createAIProvider()).toThrow("AI_API_KEY is required");
  });

  it("openai-compatible without AI_MODEL fails", () => {
    process.env.AI_PROVIDER = "openai-compatible";
    process.env.AI_API_KEY = "sk-test";
    delete process.env.AI_MODEL;
    expect(() => createAIProvider()).toThrow(AIConfigurationError);
    expect(() => createAIProvider()).toThrow("AI_MODEL is required");
  });

  it("openai-compatible with required env returns provider instance", () => {
    process.env.AI_PROVIDER = "openai-compatible";
    process.env.AI_API_KEY = "sk-test";
    process.env.AI_MODEL = "gpt-4o";
    const provider = createAIProvider();
    expect(provider.name).toBe("openai-compatible");
  });

  it("unknown AI_PROVIDER fails", () => {
    process.env.AI_PROVIDER = "unknown-provider";
    expect(() => createAIProvider()).toThrow(AIConfigurationError);
    expect(() => createAIProvider()).toThrow("Unknown AI_PROVIDER");
  });

  it("error messages do not contain API keys", () => {
    process.env.AI_PROVIDER = "openai-compatible";
    process.env.AI_API_KEY = "sk-super-secret-key-123";
    delete process.env.AI_MODEL;
    try {
      createAIProvider();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      expect(message).not.toContain("sk-super-secret-key-123");
    }
  });
});

describe("getMockProviderWarning", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns no warning when provider is not mock", () => {
    process.env.AI_PROVIDER = "openai-compatible";
    const warning = getMockProviderWarning();
    expect(warning.showWarning).toBe(false);
  });

  it("returns dev warning when provider is mock in development", () => {
    process.env.NODE_ENV = "development";
    process.env.AI_PROVIDER = "mock";
    const warning = getMockProviderWarning();
    expect(warning.showWarning).toBe(true);
    expect(warning.message).toContain("local development");
  });

  it("returns production danger warning when mock is allowed in production", () => {
    process.env.NODE_ENV = "production";
    process.env.AI_PROVIDER = "mock";
    process.env.REGOPS_ALLOW_MOCK_AI_IN_PRODUCTION = "true";
    const warning = getMockProviderWarning();
    expect(warning.showWarning).toBe(true);
    expect(warning.message).toContain("production");
    expect(warning.message).toContain("Do not use");
  });

  it("does not expose API key in warning", () => {
    process.env.NODE_ENV = "development";
    process.env.AI_PROVIDER = "mock";
    process.env.AI_API_KEY = "sk-secret";
    const warning = getMockProviderWarning();
    expect(warning.message).not.toContain("sk-secret");
  });
});
