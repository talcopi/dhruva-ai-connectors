import { keyPreview } from '../env.js';
import { runtimeProviderStatus } from '../runtime.js';

export async function readGrokStatus() {
  const runtime = runtimeProviderStatus('grok');
  const apiKey = process.env.XAI_API_KEY || process.env.GROK_CODE_XAI_API_KEY || '';
  return {
    loggedIn: runtime.authConfigured,
    authMethod: apiKey ? 'api_key' : runtime.installed ? 'cli_browser' : '',
    cliPackage: runtime.packageName || '',
    cliVersion: runtime.packageVersion || '',
    cliHome: runtime.authHome,
    defaultModel: runtime.defaultModel,
    keyPreview: apiKey ? keyPreview(apiKey) : '',
  };
}
