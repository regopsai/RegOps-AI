import type { z } from "zod";

export interface GenerateStructuredInput<T extends z.ZodType> {
  systemPrompt: string;
  userPrompt: string;
  responseSchema: T;
  responseSchemaName: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface GenerateStructuredOutput<T> {
  outputJson: T;
  rawText?: string;
  model: string;
  provider: string;
  tokenUsage?: TokenUsage;
  latencyMs: number;
}

export interface AIProvider {
  readonly name: string;
  generateStructuredJson<T extends z.ZodType>(
    input: GenerateStructuredInput<T>
  ): Promise<GenerateStructuredOutput<z.infer<T>>>;
}
