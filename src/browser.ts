import type {
  ConnectAIInput,
  ConnectAIResult,
  DisconnectResult,
  LogoutAIInput,
  ProviderInput,
  ProviderSlug,
  RunAgentWorkflowInput,
  RunAgentWorkflowResult,
  UseAIInput,
  UseAIResult,
} from './types.js';

type BrowserWindow = {
  open?: (url?: string, target?: string, features?: string) => { closed?: boolean; location?: { href: string }; close?: () => void } | null;
};

type BrowserGlobal = typeof globalThis & {
  window?: BrowserWindow;
  navigator?: { clipboard?: { writeText(value: string): Promise<void> } };
};
type BrowserTab = ReturnType<NonNullable<NonNullable<BrowserGlobal['window']>['open']>>;

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
  const endpoint = input.endpoint || '/api/ai/connect';
  if (input.sessionId) {
    const response = await fetch(input.statusEndpoint || endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: input.code ? 'submitCode' : 'status',
        provider,
        sessionId: input.sessionId,
        code: input.code,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || `connectAI ${input.code ? 'submitCode' : 'status'} failed with HTTP ${response.status}`);
    const result = normalizeResult(provider, data);
    input.onStatus?.(result);
    if (input.poll === true && !result.connected && !result.needsCode && result.sessionId) return pollStatus(provider, result, input, null);
    return result;
  }

  const pendingTab = input.openBrowser === false ? null : openPendingLoginTab(global, providerLabel(provider));
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
  const result = normalizeResult(provider, data);
  input.onStatus?.(result);
  const redirected = redirectLoginTab(global, pendingTab, result, input);
  if (result.userCode && global.navigator?.clipboard) await global.navigator.clipboard.writeText(result.userCode).catch(() => undefined);
  if (result.needsCode || input.poll === false || result.connected || !result.sessionId) {
    if (!redirected && !result.redirectUrl && !result.verificationUrl) closePendingTab(pendingTab);
    return result;
  }

  return pollStatus(provider, result, input, { tab: pendingTab, redirected });
}

async function pollStatus(
  provider: ProviderSlug,
  initial: ConnectAIResult,
  input: ConnectAIInput,
  popup: { tab: BrowserTab | null | undefined; redirected: boolean } | null
): Promise<ConnectAIResult> {
  const global = globalThis as BrowserGlobal;
  const endpoint = input.endpoint || '/api/ai/connect';
  let result = initial;
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
    input.onStatus?.(result);
    if (popup && !popup.redirected) {
      popup.redirected = redirectLoginTab(global, popup.tab, result, input);
    }
    if (result.needsCode) return result;
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

export async function logoutAI(input: LogoutAIInput): Promise<DisconnectResult> {
  const provider = normalizeProvider(input.provider);
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

export async function runAgentWorkflow(input: Omit<RunAgentWorkflowInput, 'tools'> & { endpoint?: string }): Promise<RunAgentWorkflowResult> {
  const endpoint = input.endpoint || '/api/ai/use';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'workflow', input }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || `runAgentWorkflow failed with HTTP ${response.status}`);
  return data;
}

export async function runAITools(input: Omit<RunAgentWorkflowInput, 'tools'> & { endpoint?: string }): Promise<RunAgentWorkflowResult> {
  return runAgentWorkflow(input);
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
    redirectUrl: value.redirectUrl || value.verificationUrl || (value as { verification_url?: string }).verification_url,
    verificationUrl: value.verificationUrl || (value as { verification_url?: string }).verification_url,
    userCode: value.userCode || (value as { user_code?: string }).user_code,
    needsCode: value.needsCode,
    instructions: value.instructions,
    connected: value.connected ?? value.status === 'connected',
    stored: value.stored ?? value.status === 'connected',
    error: value.error,
  };
}

function providerLabel(provider: ProviderSlug): string {
  if (provider === 'codex') return 'Codex';
  if (provider === 'claude') return 'Anthropic';
  if (provider === 'gemini') return 'Google';
  return 'Grok';
}

function openPendingLoginTab(global: BrowserGlobal, label: string): BrowserTab | null | undefined {
  const tab = global.window?.open?.('about:blank', '_blank');
  try {
    const doc = (tab as unknown as { document?: { title?: string; body?: { innerHTML?: string } } })?.document;
    if (doc) {
      doc.title = `${label} login`;
      if (doc.body) doc.body.innerHTML = '<p style="font-family: system-ui, sans-serif; padding: 24px;">Preparing secure login...</p>';
    }
  } catch {
    // Ignore popup document access errors.
  }
  return tab;
}

function redirectLoginTab(global: BrowserGlobal, tab: BrowserTab | null | undefined, result: ConnectAIResult, input: ConnectAIInput): boolean {
  const rawUrl = result.redirectUrl || result.verificationUrl;
  if (!rawUrl || input.openBrowser === false) return false;
  const url = authUrlWithCode(result.provider, rawUrl, result.userCode);
  if (tab && !tab.closed) {
    try {
      if (tab.location) tab.location.href = url;
      return true;
    } catch {
      // Browser blocked document access after navigation; fallback below still helps.
    }
  }
  return !!global.window?.open?.(url, '_blank', 'noopener,noreferrer');
}

function closePendingTab(tab: BrowserTab | null | undefined): void {
  try {
    tab?.close?.();
  } catch {
    // noop
  }
}

function authUrlWithCode(provider: ProviderSlug, url: string, code?: string): string {
  if (provider !== 'codex' || !code) return url;
  try {
    const target = new URL(url);
    if (!target.searchParams.has('user_code')) target.searchParams.set('user_code', code);
    return target.toString();
  } catch {
    return url;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
