import { createAiConnectors } from './create-ai-connectors.js';
import { normalizeProvider } from './provider-alias.js';
import type { ConnectAIInput, ConnectAIResult, LoginSession, ProviderSlug } from './types.js';

type BrowserGlobal = typeof globalThis & {
  window?: {
    open?: (url?: string, target?: string, features?: string) => { closed?: boolean; location?: { href: string }; close?: () => void } | null;
    setTimeout?: typeof setTimeout;
  };
  navigator?: {
    clipboard?: { writeText(value: string): Promise<void> };
  };
};
type BrowserTab = ReturnType<NonNullable<NonNullable<BrowserGlobal['window']>['open']>>;

export async function connectAI(input: ConnectAIInput): Promise<ConnectAIResult> {
  const provider = normalizeProvider(input.provider);
  if (isBrowserRuntime() && input.endpoint) return connectFromBrowser(provider, input);
  const connectors = createAiConnectors(input);
  if (input.sessionId) {
    const session = input.code
      ? await connectors.submitLoginCode(provider, input.sessionId, input.code)
      : await connectors.getLoginStatus(provider, input.sessionId);
    if (!session) {
      return {
        provider,
        status: 'failed',
        sessionId: input.sessionId,
        authKind: input.authKind || defaultAuthKind(provider, input),
        connected: false,
        stored: false,
        error: 'Login session not found',
      };
    }
    const result = toConnectResult(provider, session);
    input.onStatus?.(result);
    if (input.poll === true && !result.connected && !result.needsCode && result.sessionId) {
      return pollNodeStatus(connectors, provider, result, input);
    }
    return result;
  }
  const authKind = input.authKind || defaultAuthKind(provider, input);
  const session = await connectors.connectProvider(provider, { ...input, authKind });
  const result = toConnectResult(provider, session);
  input.onStatus?.(result);
  if (input.openBrowser !== false && result.redirectUrl) await openUrl(authUrlWithCode(result.provider, result.redirectUrl, result.userCode)).catch(() => false);
  if (input.poll === true && !result.connected && result.sessionId) {
    return pollNodeStatus(connectors, provider, result, input);
  }
  return result;
}

function defaultAuthKind(provider: ProviderSlug, input: ConnectAIInput): LoginSession['authKind'] {
  if (provider !== 'grok') return 'cli_oauth';
  const env = input.env || process.env;
  if (input.apiKey || env.XAI_API_KEY || env.GROK_CODE_XAI_API_KEY) return 'api_key';
  return 'cli_browser';
}

async function connectFromBrowser(provider: ProviderSlug, input: ConnectAIInput): Promise<ConnectAIResult> {
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
    const result = normalizeConnectResult(provider, data);
    input.onStatus?.(result);
    if (input.poll === true && !result.connected && !result.needsCode && result.sessionId) return pollBrowserStatus(provider, result, input, null);
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
    try {
      pendingTab?.close?.();
    } catch {
      // noop
    }
    throw new Error(data?.error || `connectAI failed with HTTP ${response.status}`);
  }

  const result = normalizeConnectResult(provider, data);
  input.onStatus?.(result);
  const redirected = redirectLoginTab(global, pendingTab, result, input);

  if (result.userCode && global.navigator?.clipboard) {
    await global.navigator.clipboard.writeText(result.userCode).catch(() => undefined);
  }

  if (result.needsCode || input.poll === false || result.connected || !result.sessionId) {
    if (!redirected && !result.redirectUrl && !result.verificationUrl) closePendingTab(pendingTab);
    return result;
  }
  return pollBrowserStatus(provider, result, input, { tab: pendingTab, redirected });
}

async function pollBrowserStatus(
  provider: ProviderSlug,
  initial: ConnectAIResult,
  input: ConnectAIInput,
  popup: { tab: BrowserTab | null | undefined; redirected: boolean } | null
): Promise<ConnectAIResult> {
  const global = globalThis as BrowserGlobal;
  const endpoint = input.statusEndpoint || input.endpoint || '/api/ai/connect';
  const attempts = input.maxPollAttempts ?? 60;
  const interval = input.pollIntervalMs ?? 3000;
  let current = initial;
  for (let i = 0; i < attempts; i += 1) {
    await sleep(interval);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'status', provider, sessionId: current.sessionId }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || `connectAI status failed with HTTP ${response.status}`);
    current = normalizeConnectResult(provider, data);
    input.onStatus?.(current);
    if (popup && !popup.redirected) {
      popup.redirected = redirectLoginTab(global, popup.tab, current, input);
    }
    if (current.needsCode) return current;
    if (current.connected || current.status === 'failed' || current.status === 'expired' || current.status === 'cancelled') return current;
  }
  return { ...current, status: 'pending', connected: false };
}

function toConnectResult(provider: ProviderSlug, session: LoginSession): ConnectAIResult {
  return {
    provider,
    status: session.status,
    sessionId: session.id,
    authKind: session.authKind,
    redirectUrl: session.verificationUrl,
    verificationUrl: session.verificationUrl,
    userCode: session.userCode,
    needsCode: session.needsCode,
    instructions: session.instructions,
    connected: session.status === 'connected',
    stored: session.status === 'connected',
    error: session.error,
  };
}

function normalizeConnectResult(provider: ProviderSlug, data: unknown): ConnectAIResult {
  const value = data as Partial<ConnectAIResult & LoginSession> & { result?: ConnectAIResult };
  if (value.result) return value.result;
  const sessionId = value.sessionId || value.id || '';
  const status = value.status || 'pending';
  return {
    provider: (value.provider as ProviderSlug) || provider,
    status,
    sessionId,
    authKind: value.authKind || 'api_key',
    redirectUrl: value.redirectUrl || value.verificationUrl || (value as { verification_url?: string }).verification_url,
    verificationUrl: value.verificationUrl || (value as { verification_url?: string }).verification_url,
    userCode: value.userCode || (value as { user_code?: string }).user_code,
    needsCode: value.needsCode,
    instructions: value.instructions,
    connected: value.connected ?? status === 'connected',
    stored: value.stored ?? status === 'connected',
    error: value.error,
  };
}

async function pollNodeStatus(
  connectors: ReturnType<typeof createAiConnectors>,
  provider: ProviderSlug,
  initial: ConnectAIResult,
  input: ConnectAIInput
): Promise<ConnectAIResult> {
  const attempts = input.maxPollAttempts ?? 60;
  const interval = input.pollIntervalMs ?? 3000;
  let current = initial;
  for (let i = 0; i < attempts; i += 1) {
    await sleep(interval);
    const status = await connectors.getLoginStatus(provider, current.sessionId);
    if (!status) return current;
    current = toConnectResult(provider, status);
    if (current.connected || current.status === 'failed' || current.status === 'expired' || current.status === 'cancelled') return current;
  }
  return current;
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
    if (tab && 'document' in tab) {
      const doc = (tab as unknown as { document?: { title?: string; body?: { innerHTML?: string } } }).document;
      if (doc) {
        doc.title = `${label} login`;
        if (doc.body) doc.body.innerHTML = '<p style="font-family: system-ui, sans-serif; padding: 24px;">Preparing secure login...</p>';
      }
    }
  } catch {
    // Ignore popup document access errors.
  }
  return tab;
}

function redirectLoginTab(
  global: BrowserGlobal,
  tab: BrowserTab | null | undefined,
  result: ConnectAIResult,
  input: ConnectAIInput
): boolean {
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

function isBrowserRuntime(): boolean {
  const global = globalThis as BrowserGlobal & { document?: unknown };
  return !!global.window && !!global.document;
}

async function openUrl(url: string): Promise<boolean> {
  const { spawn } = await import('node:child_process');
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.unref();
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
