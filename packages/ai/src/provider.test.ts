import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { MockProvider } from "./mock-provider";
import { OpenAICompatibleProvider } from "./openai-compatible-provider";
import { AIValidationError, AIRequestError, AITimeoutError } from "./errors";

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
