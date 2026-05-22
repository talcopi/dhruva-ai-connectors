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

export async function connectAI(input: ConnectAIInput): Promise<ConnectAIResult> {
  const provider = normalizeProvider(input.provider);
  if (isBrowserRuntime() && input.endpoint) return connectFromBrowser(provider, input);
  const connectors = createAiConnectors(input);
  const authKind = input.authKind || (provider === 'grok' ? 'cli_browser' : 'cli_oauth');
  const session = await connectors.connectProvider(provider, { ...input, authKind });
  const result = toConnectResult(provider, session);
  if (input.openBrowser !== false && result.redirectUrl) await openUrl(result.redirectUrl).catch(() => false);
  if (input.poll === true && !result.connected && result.sessionId) {
    return pollNodeStatus(connectors, provider, result, input);
  }
  return result;
}

async function connectFromBrowser(provider: ProviderSlug, input: ConnectAIInput): Promise<ConnectAIResult> {
  const global = globalThis as BrowserGlobal;
  const pendingTab = input.openBrowser === false ? null : global.window?.open?.('about:blank', '_blank');
  const response = await fetch(input.endpoint || '/api/ai/connect', {
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
  const redirectUrl = result.redirectUrl || result.verificationUrl;
  if (pendingTab && redirectUrl) {
    try {
      if (pendingTab.location) pendingTab.location.href = redirectUrl;
    } catch {
      // Browser blocked document access after navigation; opening fallback below is enough.
    }
  } else if (redirectUrl && input.openBrowser !== false) {
    global.window?.open?.(redirectUrl, '_blank', 'noopener,noreferrer');
  } else {
    try {
      pendingTab?.close?.();
    } catch {
      // noop
    }
  }

  if (result.userCode && global.navigator?.clipboard) {
    await global.navigator.clipboard.writeText(result.userCode).catch(() => undefined);
  }

  if (input.poll === false || result.connected || !result.sessionId) return result;
  return pollBrowserStatus(provider, result, input);
}

async function pollBrowserStatus(provider: ProviderSlug, initial: ConnectAIResult, input: ConnectAIInput): Promise<ConnectAIResult> {
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
    redirectUrl: value.redirectUrl || value.verificationUrl,
    verificationUrl: value.verificationUrl,
    userCode: value.userCode,
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
