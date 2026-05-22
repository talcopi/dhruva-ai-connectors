import fs from 'node:fs';
import path from 'node:path';
import { configuredAuthKinds, modelFromEnv, providerHome } from './env.js';
import { PROVIDERS, PROVIDER_SLUGS } from './providers.js';
import { findExecutable } from './process/run-cli.js';
import { consumerRootFromPackageRoot, packageRoot } from './package-root.js';
import type { AiConnectorsOptions, ProviderSlug, RuntimeProviderStatus, RuntimeStatus } from './types.js';

function packageRoots(cwd: string): string[] {
  const ownPackageRoot = packageRoot();
  return [...new Set([cwd, process.cwd(), ownPackageRoot, consumerRootFromPackageRoot(ownPackageRoot)].filter(Boolean) as string[])];
}

export function packageVersion(packageName: string | null, cwd = process.cwd()): string {
  if (!packageName) return '';
  const parts = packageName.split('/');
  for (const root of packageRoots(cwd)) {
    const pkgPath = path.join(root, 'node_modules', ...parts, 'package.json');
    try {
      return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version || '';
    } catch {
      // Try next root.
    }
  }
  return '';
}

export async function runtimeStatus(options: Pick<AiConnectorsOptions, 'cwd' | 'env'> = {}): Promise<RuntimeStatus> {
  const cwd = options.cwd || process.cwd();
  const env = options.env || process.env;
  const result = {} as RuntimeStatus;

  for (const slug of PROVIDER_SLUGS) {
    result[slug] = runtimeProviderStatus(slug, cwd, env);
  }

  return result;
}

export function runtimeProviderStatus(
  slug: ProviderSlug,
  cwd = process.cwd(),
  env: NodeJS.ProcessEnv = process.env
): RuntimeProviderStatus {
  const provider = PROVIDERS[slug];
  const binaryPath = findExecutable(provider.binary, cwd, env);
  const authKinds = configuredAuthKinds(slug, cwd, env);
  const notes: string[] = [];

  if (slug === 'grok' && !binaryPath) {
    notes.push('Official Grok Build CLI is not installed or not on PATH. API mode can still work with XAI_API_KEY.');
  }
  if (slug === 'grok' && authKinds.length === 0) {
    notes.push('Set XAI_API_KEY for server/headless Grok API mode, or run Grok Build CLI login locally.');
  }

  return {
    slug,
    label: provider.label,
    installed: !!binaryPath,
    binary: provider.binary,
    binaryPath: binaryPath || undefined,
    packageName: provider.packageName,
    packageVersion: packageVersion(provider.packageName, cwd),
    authHome: providerHome(slug, cwd, env),
    configuredAuthKinds: authKinds,
    authConfigured: authKinds.length > 0,
    defaultModel: modelFromEnv(slug, provider.defaultModel, env),
    notes,
  };
}
