import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectAI } from '../src/connect-ai.js';

const originalWindow = (globalThis as any).window;
const originalDocument = (globalThis as any).document;
const originalFetch = globalThis.fetch;

afterEach(() => {
  vi.restoreAllMocks();
  setGlobal('window', originalWindow);
  setGlobal('document', originalDocument);
  setGlobal('fetch', originalFetch);
});

describe('browser connectAI flow', () => {
  it('keeps the popup alive and redirects when the OAuth URL appears during polling', async () => {
    const tab = fakeTab();
    setGlobal('window', { open: vi.fn(() => tab) });
    setGlobal('document', {});
    setGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ provider: 'gemini', status: 'pending', id: 'session-1', authKind: 'cli_oauth' }))
        .mockResolvedValueOnce(
          jsonResponse({
            provider: 'gemini',
            status: 'pending',
            id: 'session-1',
            authKind: 'cli_oauth',
            verificationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test',
            needsCode: true,
          })
        )
    );

    const statuses: string[] = [];
    const result = await connectAI({
      provider: 'google',
      endpoint: '/api/ai',
      pollIntervalMs: 1,
      maxPollAttempts: 2,
      onStatus: (status) => statuses.push(status.status),
    });

    expect(result.needsCode).toBe(true);
    expect(tab.closed).toBe(false);
    expect(tab.location.href).toContain('accounts.google.com');
    expect(statuses).toEqual(['pending', 'pending']);
  });

  it('adds the Codex device code to the browser URL and exposes it to React code', async () => {
    const tab = fakeTab();
    setGlobal('window', { open: vi.fn(() => tab) });
    setGlobal('document', {});
    setGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        jsonResponse({
          provider: 'codex',
          status: 'pending',
          id: 'codex-session',
          authKind: 'cli_oauth',
          verificationUrl: 'https://chatgpt.com/activate',
          userCode: 'ABCD-1234',
        })
      )
    );

    const result = await connectAI({
      provider: 'codex',
      endpoint: '/api/ai',
      poll: false,
    });

    expect(result.userCode).toBe('ABCD-1234');
    expect(tab.location.href).toBe('https://chatgpt.com/activate?user_code=ABCD-1234');
  });

  it('can submit an authorization code with the same connectAI function', async () => {
    let requestBody: any = null;
    setGlobal('window', { open: vi.fn() });
    setGlobal('document', {});
    setGlobal(
      'fetch',
      vi.fn(async (_url, init) => {
        requestBody = JSON.parse(String((init as RequestInit).body || '{}'));
        return jsonResponse({ provider: 'claude', status: 'connected', id: 'session-2', authKind: 'cli_oauth' });
      })
    );

    const result = await connectAI({
      provider: 'anthropic',
      endpoint: '/api/ai',
      sessionId: 'session-2',
      code: 'oauth-code',
    });

    expect(requestBody).toMatchObject({
      action: 'submitCode',
      provider: 'claude',
      sessionId: 'session-2',
      code: 'oauth-code',
    });
    expect(result.connected).toBe(true);
  });
});

function fakeTab() {
  return {
    closed: false,
    location: { href: '' },
    close() {
      this.closed = true;
    },
    document: {
      title: '',
      body: { innerHTML: '' },
    },
  };
}

function jsonResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => data,
  };
}

function setGlobal(key: string, value: unknown): void {
  if (value === undefined) {
    delete (globalThis as any)[key];
    return;
  }
  Object.defineProperty(globalThis, key, {
    value,
    configurable: true,
    writable: true,
  });
}
