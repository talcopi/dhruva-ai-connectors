import { createAiConnectors } from './create-ai-connectors.js';
import { normalizeProvider } from './provider-alias.js';
import type { DisconnectResult, LogoutAIInput, ProviderSlug } from './types.js';

export async function logoutAI(input: LogoutAIInput): Promise<DisconnectResult> {
  const provider = normalizeProvider(input.provider);
  if (isBrowserRuntime() && input.endpoint) return logoutFromBrowser(provider, input);
  return createAiConnectors(input).disconnectProvider(provider);
}

async function logoutFromBrowser(provider: ProviderSlug, input: LogoutAIInput): Promise<DisconnectResult> {
  const endpoint = input.endpoint || '/api/ai/connect';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'logoutAI', provider }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || `logoutAI failed with HTTP ${response.status}`);
  return data;
}

function isBrowserRuntime(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}
