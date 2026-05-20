import { claudeCliEnv } from './utils.js';
import { runExecutable } from '../process/run-cli.js';
import { runtimeProviderStatus } from '../runtime.js';

function parseJson(text: string) {
  try {
    return JSON.parse(text || '{}');
  } catch {
    return null;
  }
}

export async function readClaudeStatus() {
  const runtime = runtimeProviderStatus('claude');
  if (!runtime.installed) {
    return {
      loggedIn: runtime.authConfigured,
      cliPackage: runtime.packageName || '',
      cliVersion: runtime.packageVersion || '',
      cliHome: runtime.authHome,
      defaultModel: runtime.defaultModel,
    };
  }

  const result = await runExecutable('claude', ['auth', 'status', '--json'], {
    env: claudeCliEnv(),
    timeoutMs: 30000,
  });
  const parsed = parseJson(result.stdout);
  if (parsed) return parsed;
  return {
    loggedIn: runtime.authConfigured,
    cliPackage: runtime.packageName || '',
    cliVersion: runtime.packageVersion || '',
    cliHome: runtime.authHome,
    defaultModel: runtime.defaultModel,
    error: result.stderr ? 'Claude auth status failed' : '',
  };
}
