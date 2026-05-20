import path from 'node:path';
import { fileExists, providerHome } from '../env.js';
import { runtimeProviderStatus } from '../runtime.js';

export async function readGeminiStatus() {
  const runtime = runtimeProviderStatus('gemini');
  const configDir = path.join(providerHome('gemini'), '.gemini');
  const hasCredentials =
    fileExists(path.join(configDir, 'gemini-credentials.json')) ||
    fileExists(path.join(configDir, 'oauth_creds.json')) ||
    fileExists(path.join(configDir, 'google_accounts.json')) ||
    !!process.env.GEMINI_API_KEY ||
    !!process.env.GOOGLE_API_KEY;

  return {
    loggedIn: hasCredentials,
    authMethod: runtime.configuredAuthKinds[0] || '',
    cliPackage: runtime.packageName || '',
    cliVersion: runtime.packageVersion || '',
    cliHome: runtime.authHome,
    defaultModel: runtime.defaultModel,
  };
}
