import { providerHome, sanitizedCliEnv } from '../env.js';

export function claudeCliEnv(extra: Record<string, string | undefined> = {}) {
  return sanitizedCliEnv(process.env, {
    CLAUDE_CONFIG_DIR: providerHome('claude'),
    CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN,
    ...extra,
  });
}
