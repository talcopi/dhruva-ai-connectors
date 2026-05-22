import fsp from 'node:fs/promises';
import { providerHome } from './env.js';
import { cancelOAuthSessions } from './oauth-login.js';
import type { AuthKind, DisconnectResult, ProviderSlug, ProviderStore, SecretStore } from './types.js';

const SECRET_AUTH_KINDS: AuthKind[] = ['api_key', 'oauth_token', 'cli_oauth', 'cli_browser', 'vertex'];

export async function removeProviderConnection({
  provider,
  cwd,
  env,
  store,
  secretStore,
}: {
  provider: ProviderSlug;
  cwd: string;
  env: NodeJS.ProcessEnv;
  store: ProviderStore;
  secretStore: SecretStore;
}): Promise<DisconnectResult> {
  cancelOAuthSessions(provider);
  const existing = await store.get(provider);
  await store.delete(provider);
  const removedSecrets = await removeProviderSecrets(provider, secretStore);
  const authHome = providerHome(provider, cwd, env);
  const removedAuthHome = await removeDirectory(authHome);
  return {
    provider,
    ok: true,
    removedMetadata: !!existing,
    removedSecrets,
    removedAuthHome,
    details: {
      authHome,
      note: 'Provider metadata, package-managed secrets, active login sessions, and package-managed CLI OAuth files were removed for this provider only.',
    },
  };
}

async function removeProviderSecrets(provider: ProviderSlug, secretStore: SecretStore): Promise<string[]> {
  const removed: string[] = [];
  for (const authKind of SECRET_AUTH_KINDS) {
    const ref = providerSecretRef(provider, authKind);
    try {
      const existing = await secretStore.get(ref);
      await secretStore.delete(ref);
      if (existing !== null) removed.push(ref);
    } catch {
      // Custom/read-only secret stores may not support deletion.
    }
  }
  return removed;
}

async function removeDirectory(dir: string): Promise<boolean> {
  let existed = false;
  try {
    const stat = await fsp.stat(dir);
    existed = stat.isDirectory() || stat.isFile();
  } catch {
    existed = false;
  }
  await fsp.rm(dir, { recursive: true, force: true });
  return existed;
}

function providerSecretRef(provider: ProviderSlug, authKind: AuthKind): string {
  return `provider:${provider}:${authKind}`;
}
