import type { z } from "zod";
import type { AIProvider, GenerateStructuredInput, GenerateStructuredOutput } from "./provider";
import { AIValidationError } from "./errors";

export class MockProvider implements AIProvider {
  readonly name = "mock";

  constructor(private readonly deterministicOutput?: Record<string, unknown>) {}

  async generateStructuredJson<T extends z.ZodType>(
    input: GenerateStructuredInput<T>
  ): Promise<GenerateStructuredOutput<z.infer<T>>> {
    const startedAt = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 10));

    const output = this.deterministicOutput ?? this.buildDefaultRiskMemo(input.userPrompt);

    const validationResult = input.responseSchema.safeParse(output);
    if (!validationResult.success) {
      throw new AIValidationError(
        `Mock output validation failed: ${validationResult.error.message}`,
        validationResult.error
      );
    }

    return {
      outputJson: validationResult.data as z.infer<T>,
      rawText: JSON.stringify(output),
      model: "mock-model",
      provider: this.name,
      tokenUsage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
      latencyMs: Date.now() - startedAt,
    };
  }

  private buildDefaultRiskMemo(userPrompt: string): Record<string, unknown> {
    const hasBusiness = userPrompt.includes("Business Profile");
    return {
      executiveSummary: `This is a mock advisory risk memo. The case involves a ${hasBusiness ? "business" : "customer"} profile under review.`,
      profileSummary: `The ${hasBusiness ? "business" : "individual"} profile appears complete with basic information on file.`,
      documentReview: "Documents have been reviewed. No obvious forgeries detected in available samples.",
      transactionReview: "Transaction patterns appear within normal ranges for the profile type.",
      riskSignalsSummary: "One or more deterministic risk signals were identified and are summarized above.",
      missingInformation: "No critical missing information at this time.",
      recommendedAction: "LOW_RISK_REVIEW",
      evidenceReferences: [
        {
          type: "case" as const,
          id: "case-1",
          label: "Compliance Case",
          relevance: "Primary subject of this risk memo",
        },
      ],
      limitations: "This is a mock advisory output. Human compliance staff must make the final decision.",
    };
  }
}
