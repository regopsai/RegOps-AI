export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}

export class AIValidationError extends AIProviderError {
  constructor(message: string, cause?: unknown) {
    super(message, "VALIDATION_ERROR", cause);
    this.name = "AIValidationError";
  }
}

export class AIRequestError extends AIProviderError {
  constructor(message: string, public readonly statusCode?: number, cause?: unknown) {
    super(message, "REQUEST_ERROR", cause);
    this.name = "AIRequestError";
  }
}

export class AITimeoutError extends AIProviderError {
  constructor(message: string = "AI request timed out") {
    super(message, "TIMEOUT_ERROR");
    this.name = "AITimeoutError";
  }
}
