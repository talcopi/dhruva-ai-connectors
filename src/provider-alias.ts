import { isProviderSlug } from './providers.js';
import type { ProviderInput, ProviderSlug } from './types.js';

const PROVIDER_ALIASES: Record<string, ProviderSlug> = {
  codex: 'codex',
  anthropic: 'claude',
  claude: 'claude',
  google: 'gemini',
  gemini: 'gemini',
  xai: 'grok',
  grok: 'grok',
};

export function normalizeProvider(input?: ProviderInput): ProviderSlug {
  const value = String(input || 'codex').trim().toLowerCase();
  const normalized = PROVIDER_ALIASES[value];
  if (normalized && isProviderSlug(normalized)) return normalized;
  throw new Error(`Unknown provider: ${input || ''}. Use codex, anthropic, google, or grok.`);
}
