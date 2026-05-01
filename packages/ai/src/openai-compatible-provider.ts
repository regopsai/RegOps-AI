import type { z } from "zod";
import type { AIProvider, GenerateStructuredInput, GenerateStructuredOutput } from "./provider";
import { AIRequestError, AITimeoutError, AIValidationError } from "./errors";

interface OpenAICompatibleMessage {
  role: "system" | "user";
  content: string;
}

interface OpenAICompatibleRequest {
  model: string;
  messages: OpenAICompatibleMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: "json_object" } | { type: "json_schema"; json_schema: unknown };
}

interface OpenAICompatibleResponse {
  choices: Array<{
    message?: { content?: string };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string };
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly name = "openai-compatible";

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = "https://api.openai.com/v1",
    private readonly defaultModel: string = "gpt-4o-mini",
    private readonly defaultTimeoutMs: number = 30000
  ) {}

  async generateStructuredJson<T extends z.ZodType>(
    input: GenerateStructuredInput<T>
  ): Promise<GenerateStructuredOutput<z.infer<T>>> {
    const startedAt = Date.now();
    const model = input.model ?? this.defaultModel;
    const timeoutMs = input.timeoutMs ?? this.defaultTimeoutMs;

    const requestBody: OpenAICompatibleRequest = {
      model,
      messages: [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: input.userPrompt },
      ],
      temperature: input.temperature ?? 0.2,
      max_tokens: input.maxTokens ?? 4096,
      response_format: { type: "json_object" },
    };

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: abortController.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === "AbortError") {
        throw new AITimeoutError();
      }
      throw new AIRequestError(`Network error: ${err instanceof Error ? err.message : String(err)}`, undefined, err);
    }

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorBody = "";
      try {
        errorBody = await response.text();
      } catch {
        // ignore
      }
      throw new AIRequestError(
        `Provider returned ${response.status}: ${errorBody.slice(0, 200)}`,
        response.status
      );
    }

    let body: OpenAICompatibleResponse;
    try {
      body = (await response.json()) as OpenAICompatibleResponse;
    } catch (err) {
      throw new AIValidationError("Failed to parse provider response as JSON", err);
    }

    if (body.error?.message) {
      throw new AIRequestError(`Provider error: ${body.error.message}`);
    }

    const rawContent = body.choices?.[0]?.message?.content?.trim() ?? "";
    if (!rawContent) {
      throw new AIValidationError("Provider returned empty content");
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawContent);
    } catch (err) {
      throw new AIValidationError("Provider response is not valid JSON", err);
    }

    const validationResult = input.responseSchema.safeParse(parsedJson);
    if (!validationResult.success) {
      throw new AIValidationError(
        `Schema validation failed for ${input.responseSchemaName}: ${validationResult.error.message}`,
        validationResult.error
      );
    }

    const latencyMs = Date.now() - startedAt;

    return {
      outputJson: validationResult.data as z.infer<T>,
      rawText: rawContent,
      model,
      provider: this.name,
      tokenUsage: body.usage
        ? {
            promptTokens: body.usage.prompt_tokens,
            completionTokens: body.usage.completion_tokens,
            totalTokens: body.usage.total_tokens,
          }
        : undefined,
      latencyMs,
    };
  }
}
