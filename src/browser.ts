import type { ConnectAIInput, ConnectAIResult, ProviderInput, ProviderSlug, UseAIInput, UseAIResult } from './types.js';

type BrowserWindow = {
  open?: (url?: string, target?: string, features?: string) => { location?: { href: string }; close?: () => void } | null;
};

type BrowserGlobal = typeof globalThis & {
  window?: BrowserWindow;
  navigator?: { clipboard?: { writeText(value: string): Promise<void> } };
};

const ALIASES: Record<string, ProviderSlug> = {
  codex: 'codex',
  anthropic: 'claude',
  claude: 'claude',
  google: 'gemini',
  gemini: 'gemini',
  xai: 'grok',
  grok: 'grok',
};

export async function connectAI(input: ConnectAIInput): Promise<ConnectAIResult> {
  const provider = normalizeProvider(input.provider);
  const global = globalThis as BrowserGlobal;
  const pendingTab = input.openBrowser === false ? null : global.window?.open?.('about:blank', '_blank');
  const endpoint = input.endpoint || '/api/ai/connect';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'connectAI', input: { ...input, provider } }),
  });
  const data = await response.json();
  if (!response.ok) {
    pendingTab?.close?.();
    throw new Error(data?.error || `connectAI failed with HTTP ${response.status}`);
  }
  let result = normalizeResult(provider, data);
  const redirectUrl = result.redirectUrl || result.verificationUrl;
  if (redirectUrl && pendingTab?.location) pendingTab.location.href = redirectUrl;
  else if (redirectUrl && input.openBrowser !== false) global.window?.open?.(redirectUrl, '_blank', 'noopener,noreferrer');
  else pendingTab?.close?.();
  if (result.userCode && global.navigator?.clipboard) await global.navigator.clipboard.writeText(result.userCode).catch(() => undefined);
  if (input.poll === false || result.connected || !result.sessionId) return result;

  const attempts = input.maxPollAttempts ?? 60;
  const interval = input.pollIntervalMs ?? 3000;
  for (let i = 0; i < attempts; i += 1) {
    await sleep(interval);
    const statusResponse = await fetch(input.statusEndpoint || endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'status', provider, sessionId: result.sessionId }),
    });
    const statusData = await statusResponse.json();
    if (!statusResponse.ok) throw new Error(statusData?.error || `connectAI status failed with HTTP ${statusResponse.status}`);
    result = normalizeResult(provider, statusData);
    if (result.connected || ['failed', 'expired', 'cancelled'].includes(result.status)) return result;
  }
  return result;
}

export async function useAI(input: UseAIInput & { endpoint?: string }): Promise<UseAIResult> {
  const endpoint = input.endpoint || '/api/ai/use';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'useAI', input }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || `useAI failed with HTTP ${response.status}`);
  return data;
}

export type * from './types.js';

function normalizeProvider(provider: ProviderInput): ProviderSlug {
  const normalized = ALIASES[String(provider || 'codex').trim().toLowerCase()];
  if (!normalized) throw new Error(`Unknown provider: ${provider || ''}. Use codex, anthropic, google, or grok.`);
  return normalized;
}

function normalizeResult(provider: ProviderSlug, data: unknown): ConnectAIResult {
  const value = data as Partial<ConnectAIResult> & { id?: string };
  return {
    provider: value.provider || provider,
    status: value.status || 'pending',
    sessionId: value.sessionId || value.id || '',
    authKind: value.authKind || 'api_key',
    redirectUrl: value.redirectUrl || value.verificationUrl,
    verificationUrl: value.verificationUrl,
    userCode: value.userCode,
    needsCode: value.needsCode,
    instructions: value.instructions,
    connected: value.connected ?? value.status === 'connected',
    stored: value.stored ?? value.status === 'connected',
    error: value.error,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
