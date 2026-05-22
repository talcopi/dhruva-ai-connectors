import { providerHome, sanitizedCliEnv } from '../env.js';

export function geminiCliEnv({
  cwd = process.cwd(),
  env = process.env,
  extra = {},
}: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  extra?: Record<string, string | undefined>;
} = {}) {
  return sanitizedCliEnv(env, {
    GEMINI_CLI_HOME: providerHome('gemini', cwd, env),
    GEMINI_CLI_NO_RELAUNCH: 'true',
    GEMINI_CLI_TRUST_WORKSPACE: 'true',
    GEMINI_FORCE_FILE_STORAGE: 'true',
    GEMINI_FORCE_ENCRYPTED_FILE_STORAGE: 'true',
    GEMINI_API_KEY: env.GEMINI_API_KEY,
    GOOGLE_API_KEY: env.GOOGLE_API_KEY,
    GOOGLE_CLOUD_PROJECT: env.GOOGLE_CLOUD_PROJECT,
    GOOGLE_CLOUD_LOCATION: env.GOOGLE_CLOUD_LOCATION,
    GOOGLE_APPLICATION_CREDENTIALS: env.GOOGLE_APPLICATION_CREDENTIALS,
    TERM: env.TERM || 'xterm-256color',
    COLORTERM: env.COLORTERM || 'truecolor',
    ...extra,
  });
}
