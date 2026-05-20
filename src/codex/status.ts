import { runtimeProviderStatus } from '../runtime.js';

export async function readCodexAccount() {
  const status = runtimeProviderStatus('codex');
  return status.authConfigured
    ? {
        cliPackage: status.packageName || '',
        cliVersion: status.packageVersion || '',
        cliHome: status.authHome,
        defaultModel: status.defaultModel,
        providerAuthMode: status.configuredAuthKinds[0] || '',
      }
    : null;
}
