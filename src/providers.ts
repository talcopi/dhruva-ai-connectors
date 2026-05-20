import type { ProviderDefinition, ProviderSlug } from './types.js';

export const PROVIDERS: Record<ProviderSlug, ProviderDefinition> = {
  codex: {
    slug: 'codex',
    label: 'OpenAI Codex',
    vendor: 'openai',
    packageName: '@openai/codex',
    binary: 'codex',
    authKinds: ['cli_oauth', 'api_key'],
    defaultAuthKind: 'cli_oauth',
    defaultTransport: 'cli',
    defaultModelEnv: 'CODEX_MODEL',
    defaultModel: 'gpt-5.5',
  },
  claude: {
    slug: 'claude',
    label: 'Anthropic Claude Code',
    vendor: 'anthropic',
    packageName: '@anthropic-ai/claude-code',
    binary: 'claude',
    authKinds: ['cli_oauth', 'oauth_token', 'api_key'],
    defaultAuthKind: 'cli_oauth',
    defaultTransport: 'cli',
    defaultModelEnv: 'CLAUDE_MODEL',
    defaultModel: 'opus',
  },
  gemini: {
    slug: 'gemini',
    label: 'Google Gemini CLI',
    vendor: 'google',
    packageName: '@google/gemini-cli',
    binary: 'gemini',
    authKinds: ['cli_oauth', 'api_key', 'vertex'],
    defaultAuthKind: 'cli_oauth',
    defaultTransport: 'cli',
    defaultModelEnv: 'GEMINI_MODEL',
    defaultModel: 'gemini-2.5-flash',
  },
  grok: {
    slug: 'grok',
    label: 'xAI Grok',
    vendor: 'xai',
    packageName: null,
    binary: 'grok',
    authKinds: ['cli_browser', 'api_key'],
    defaultAuthKind: 'api_key',
    defaultTransport: 'api',
    defaultModelEnv: 'GROK_MODEL',
    defaultModel: 'grok-4.3',
  },
};

export const PROVIDER_SLUGS = Object.keys(PROVIDERS) as ProviderSlug[];

export function isProviderSlug(value: string): value is ProviderSlug {
  return Object.prototype.hasOwnProperty.call(PROVIDERS, value);
}

export function requireProvider(slug: ProviderSlug): ProviderDefinition {
  const provider = PROVIDERS[slug];
  if (!provider) throw new Error(`Unknown provider: ${slug}`);
  return provider;
}
