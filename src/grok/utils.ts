import { providerHome, sanitizedCliEnv } from '../env.js';

export function grokCliEnv(extra: Record<string, string | undefined> = {}) {
  return sanitizedCliEnv(process.env, {
    GROK_HOME: providerHome('grok'),
    XAI_API_KEY: process.env.XAI_API_KEY,
    GROK_CODE_XAI_API_KEY: process.env.GROK_CODE_XAI_API_KEY,
    ...extra,
  });
}
