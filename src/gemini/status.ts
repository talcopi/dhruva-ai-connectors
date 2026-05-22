import path from 'node:path';
import { fileExists, providerHome } from '../env.js';
import { runtimeProviderStatus } from '../runtime.js';

export async function readGeminiStatus(cwd = process.cwd(), env: NodeJS.ProcessEnv = process.env) {
  const runtime = runtimeProviderStatus('gemini', cwd, env);
  const configDir = path.join(providerHome('gemini', cwd, env), '.gemini');
  const hasCredentials =
    fileExists(path.join(configDir, 'gemini-credentials.json')) ||
    fileExists(path.join(configDir, 'oauth_creds.json')) ||
    fileExists(path.join(configDir, 'google_accounts.json')) ||
    !!env.GEMINI_API_KEY ||
    !!env.GOOGLE_API_KEY;

  return {
    loggedIn: hasCredentials,
    authMethod: runtime.configuredAuthKinds[0] || '',
    cliPackage: runtime.packageName || '',
    cliVersion: runtime.packageVersion || '',
    cliHome: runtime.authHome,
    defaultModel: runtime.defaultModel,
  };
}
