import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { AuthKind, ProviderSlug } from './types.js';

export const SECRET_KEY_PATTERNS = [
  /KEY$/i,
  /TOKEN$/i,
  /SECRET$/i,
  /PASSWORD$/i,
  /URI$/i,
  /URL$/i,
  /CREDENTIALS$/i,
  /^DATABASE_URL$/i,
];

export const SAFE_ENV_KEYS = [
  'PATH',
  'HOME',
  'USER',
  'USERNAME',
  'SHELL',
  'TERM',
  'LANG',
  'LC_ALL',
  'TMPDIR',
  'TEMP',
  'TMP',
  'SystemRoot',
  'ComSpec',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'NODE_EXTRA_CA_CERTS',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'no_proxy',
];

export function isSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

export function redactValue(key: string, value: unknown): unknown {
  if (value === undefined || value === null || value === '') return value;
  if (isSecretKey(key)) return '[REDACTED]';
  return value;
}

export function redactEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    result[key] = redactValue(key, value) as string | undefined;
  }
  return result;
}

export function sanitizedCliEnv(
  env: NodeJS.ProcessEnv = process.env,
  extra: Record<string, string | undefined> = {}
): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const key of SAFE_ENV_KEYS) {
    const value = env[key];
    if (value !== undefined) safe[key] = value;
  }
  safe.PATH = safe.PATH || env.PATH || '';
  safe.HOME = safe.HOME || env.HOME || process.cwd();
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined) safe[key] = value;
  }
  return safe;
}

export function resolveHomeDir(cwd = process.cwd(), env: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(cwd, env.HRU_AI_HOME || '.hru-ai');
}

export function providerHome(provider: ProviderSlug, cwd = process.cwd(), env: NodeJS.ProcessEnv = process.env): string {
  const home = resolveHomeDir(cwd, env);
  if (provider === 'codex') return path.resolve(cwd, env.CODEX_HOME || path.join(home, 'codex'));
  if (provider === 'claude') return path.resolve(cwd, env.CLAUDE_CONFIG_DIR || path.join(home, 'claude'));
  if (provider === 'gemini') return path.resolve(cwd, env.GEMINI_CLI_HOME || path.join(home, 'gemini'));
  return path.resolve(cwd, env.GROK_HOME || path.join(home, 'grok'));
}

export async function ensurePrivateDir(dir: string): Promise<string> {
  await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
  try {
    await fsp.chmod(dir, 0o700);
  } catch {
    // Best effort on non-POSIX filesystems.
  }
  return dir;
}

export async function ensureGeminiConfigDir(cwd = process.cwd(), env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const dir = await ensurePrivateDir(path.join(providerHome('gemini', cwd, env), '.gemini'));
  const settingsPath = path.join(dir, 'settings.json');
  const requiredSettings = {
    security: {
      auth: { selectedType: 'oauth-personal' },
      folderTrust: { enabled: false },
    },
    ide: { enabled: false, hasSeenNudge: true },
    tools: { useRipgrep: false },
    ui: { terminalBuffer: false, useAlternateBuffer: false },
  };
  let existing = {};
  try {
    existing = JSON.parse(await fsp.readFile(settingsPath, 'utf8'));
  } catch {
    // Use defaults when settings do not exist or cannot be parsed.
  }
  await fsp.writeFile(settingsPath, `${JSON.stringify(mergePlainObject(existing, requiredSettings), null, 2)}\n`, { mode: 0o600 });
  try {
    await fsp.chmod(settingsPath, 0o600);
  } catch {
    // Best effort on non-POSIX filesystems.
  }
  return dir;
}

function mergePlainObject(base: unknown, update: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = base && typeof base === 'object' && !Array.isArray(base) ? { ...(base as Record<string, unknown>) } : {};
  for (const [key, value] of Object.entries(update)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = mergePlainObject(result[key], value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export async function writePrivateFile(filePath: string, contents: string): Promise<void> {
  await ensurePrivateDir(path.dirname(filePath));
  await fsp.writeFile(filePath, contents, { mode: 0o600 });
  try {
    await fsp.chmod(filePath, 0o600);
  } catch {
    // Best effort on non-POSIX filesystems.
  }
}

export function fileExists(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

export function configuredAuthKinds(provider: ProviderSlug, cwd = process.cwd(), env: NodeJS.ProcessEnv = process.env): AuthKind[] {
  const kinds = new Set<AuthKind>();
  const home = providerHome(provider, cwd, env);

  if (provider === 'codex') {
    if (fileExists(path.join(home, 'auth.json'))) kinds.add('cli_oauth');
    if (env.OPENAI_API_KEY) kinds.add('api_key');
  }

  if (provider === 'claude') {
    if (fileExists(path.join(home, '.credentials.json'))) kinds.add('cli_oauth');
    if (env.CLAUDE_CODE_OAUTH_TOKEN) kinds.add('oauth_token');
    if (env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN) kinds.add('api_key');
  }

  if (provider === 'gemini') {
    const configDir = path.join(home, '.gemini');
    if (
      fileExists(path.join(configDir, 'gemini-credentials.json')) ||
      fileExists(path.join(configDir, 'oauth_creds.json')) ||
      fileExists(path.join(configDir, 'google_accounts.json'))
    ) {
      kinds.add('cli_oauth');
    }
    if (env.GEMINI_API_KEY || env.GOOGLE_API_KEY) kinds.add('api_key');
    if (env.GOOGLE_CLOUD_PROJECT && (env.GOOGLE_APPLICATION_CREDENTIALS || env.GOOGLE_CLOUD_LOCATION)) kinds.add('vertex');
  }

  if (provider === 'grok') {
    if (env.XAI_API_KEY || env.GROK_CODE_XAI_API_KEY) kinds.add('api_key');
  }

  return [...kinds];
}

export function modelFromEnv(provider: ProviderSlug, fallback: string, env: NodeJS.ProcessEnv = process.env): string {
  if (provider === 'codex') return env.CODEX_MODEL || fallback;
  if (provider === 'claude') return env.CLAUDE_MODEL || fallback;
  if (provider === 'gemini') return env.GEMINI_MODEL || fallback;
  return env.GROK_MODEL || fallback;
}

export function keyPreview(value: string): string {
  if (!value) return '';
  if (value.length <= 10) return `${value.slice(0, 3)}...`;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}
