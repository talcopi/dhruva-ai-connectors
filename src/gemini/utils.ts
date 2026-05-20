import { providerHome, sanitizedCliEnv } from '../env.js';

export function geminiCliEnv(extra: Record<string, string | undefined> = {}) {
  return sanitizedCliEnv(process.env, {
    GEMINI_CLI_HOME: providerHome('gemini'),
    GEMINI_CLI_NO_RELAUNCH: 'true',
    GEMINI_CLI_TRUST_WORKSPACE: 'true',
    GEMINI_FORCE_FILE_STORAGE: 'true',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
    GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
    GOOGLE_CLOUD_LOCATION: process.env.GOOGLE_CLOUD_LOCATION,
    GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    ...extra,
  });
}
