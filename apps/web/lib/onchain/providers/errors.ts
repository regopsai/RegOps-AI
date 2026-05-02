export class OnChainProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OnChainProviderError";
  }
}

export class OnChainConfigurationError extends OnChainProviderError {
  constructor(message: string) {
    super(message);
    this.name = "OnChainConfigurationError";
  }
}

export class OnChainValidationError extends OnChainProviderError {
  constructor(message: string) {
    super(message);
    this.name = "OnChainValidationError";
  }
}
