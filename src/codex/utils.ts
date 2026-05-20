import { providerHome, sanitizedCliEnv } from '../env.js';

export function codexCliEnv(extra: Record<string, string | undefined> = {}) {
  return sanitizedCliEnv(process.env, {
    CODEX_HOME: providerHome('codex'),
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ...extra,
  });
}
