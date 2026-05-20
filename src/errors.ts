import type { ProviderSlug } from './types.js';

export class AiConnectorError extends Error {
  code: string;
  provider?: ProviderSlug;

  constructor(code: string, message: string, options: { provider?: ProviderSlug; cause?: unknown } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.provider = options.provider;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

export class ProviderNotInstalledError extends AiConnectorError {
  constructor(provider: ProviderSlug, binary: string) {
    super('PROVIDER_NOT_INSTALLED', `Provider ${provider} is not installed. Missing binary: ${binary}`, { provider });
  }
}

export class ProviderNotConnectedError extends AiConnectorError {
  constructor(provider: ProviderSlug, message = `Provider ${provider} is not connected`) {
    super('PROVIDER_NOT_CONNECTED', message, { provider });
  }
}

export class ProviderLoginExpiredError extends AiConnectorError {
  constructor(provider: ProviderSlug) {
    super('PROVIDER_LOGIN_EXPIRED', `Login session expired for ${provider}`, { provider });
  }
}

export class ProviderTimeoutError extends AiConnectorError {
  constructor(provider: ProviderSlug, message = `Provider ${provider} timed out`) {
    super('PROVIDER_TIMEOUT', message, { provider });
  }
}

export class ProviderGenerationError extends AiConnectorError {
  constructor(provider: ProviderSlug, message: string, cause?: unknown) {
    super('PROVIDER_GENERATION_ERROR', message, { provider, cause });
  }
}

export class ProviderUnsupportedPlatformError extends AiConnectorError {
  constructor(provider: ProviderSlug, message: string) {
    super('PROVIDER_UNSUPPORTED_PLATFORM', message, { provider });
  }
}

export class ProviderAuthUnsupportedError extends AiConnectorError {
  constructor(provider: ProviderSlug, message: string) {
    super('PROVIDER_AUTH_UNSUPPORTED', message, { provider });
  }
}

export class ConfigPermissionError extends AiConnectorError {
  constructor(message: string, cause?: unknown) {
    super('CONFIG_PERMISSION_ERROR', message, { cause });
  }
}

export class SecretStoreRequiredError extends AiConnectorError {
  constructor(provider: ProviderSlug) {
    super('SECRET_STORE_REQUIRED', `A secret store is required to persist secrets for ${provider}`, { provider });
  }
}
