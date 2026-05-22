import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { ensureGeminiConfigDir, ensurePrivateDir, providerHome, sanitizedCliEnv } from './env.js';
import { PROVIDERS } from './providers.js';
import { findExecutable, spawnExecutable } from './process/run-cli.js';
import { runtimeProviderStatus } from './runtime.js';
import type { AuthKind, LoginSession, ProviderSlug } from './types.js';

type JsonRecord = Record<string, any>;

type OAuthSessionState = LoginSession & {
  child?: ChildProcess;
  codex?: CodexAppServer;
  outputTail?: string;
  exited?: boolean;
  exitCode?: number | null;
};

const TTL_MS = 10 * 60 * 1000;
const CLEANUP_MS = 5 * 60 * 1000;
const CLAUDE_URL_RE = /https:\/\/claude\.com\/cai\/oauth\/authorize[^\s"'<>)]*/i;
const GEMINI_URL_RE = /https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth[^\s"'<>)]*/i;

const oauthSessions = new Map<string, OAuthSessionState>();

export async function startOAuthLogin({
  provider,
  authKind,
  cwd,
  env,
  openBrowser = false,
}: {
  provider: ProviderSlug;
  authKind: AuthKind;
  cwd: string;
  env: NodeJS.ProcessEnv;
  openBrowser?: boolean;
}): Promise<LoginSession> {
  if (provider === 'codex') return startCodexOAuth({ cwd, env, openBrowser });
  if (provider === 'claude') return startClaudeOAuth({ cwd, env, openBrowser });
  if (provider === 'gemini') return startGeminiOAuth({ cwd, env, openBrowser });
  return startCommandOAuth({ provider, authKind, cwd, env });
}

export async function getOAuthLoginStatus({
  provider,
  sessionId,
  cwd,
  env,
}: {
  provider: ProviderSlug;
  sessionId: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
}): Promise<LoginSession | null> {
  const session = oauthSessions.get(sessionId);
  if (!session || session.provider !== provider) return null;
  if (session.expiresAt && Date.now() > new Date(session.expiresAt).getTime()) {
    session.status = 'expired';
    closeSession(session);
    scheduleCleanup(session.id, 0);
    return publicSession(session);
  }

  if (provider === 'codex' && session.codex && session.status === 'pending') {
    await completeCodexIfReady(session).catch(() => undefined);
  }

  const runtime = runtimeProviderStatus(provider, cwd, env);
  if (runtime.authConfigured) {
    session.status = 'connected';
    scheduleCleanup(session.id);
  }

  return publicSession(session);
}

export async function submitOAuthCode({
  provider,
  sessionId,
  code,
  cwd,
  env,
}: {
  provider: ProviderSlug;
  sessionId: string;
  code: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
}): Promise<LoginSession | null> {
  const session = oauthSessions.get(sessionId);
  if (!session || session.provider !== provider) return null;
  if (!code.trim()) {
    session.error = 'Authorization code is required';
    return publicSession(session);
  }
  if (!session.child || session.child.killed || session.exited) {
    return getOAuthLoginStatus({ provider, sessionId, cwd, env });
  }
  session.child.stdin?.write(`${code.trim()}\n`);
  session.status = 'pending';
  await sleep(provider === 'gemini' ? 1200 : 800);
  return getOAuthLoginStatus({ provider, sessionId, cwd, env });
}

async function startCodexOAuth({
  cwd,
  env,
  openBrowser,
}: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  openBrowser: boolean;
}): Promise<LoginSession> {
  const runtime = runtimeProviderStatus('codex', cwd, env);
  if (!runtime.installed) return failedSession('codex', 'cli_oauth', 'Codex CLI is not installed.');

  const session = makeSession('codex', 'cli_oauth');
  oauthSessions.set(session.id, session);
  try {
    const codex = await new CodexAppServer(cwd, env).start();
    session.codex = codex;
    const result = await codex.call('account/login/start', { type: 'chatgptDeviceCode' }, 30000);
    session.verificationUrl = result?.verificationUrl || result?.authUrl || '';
    session.userCode = result?.userCode || '';
    session.status = 'pending';
    session.instructions = session.userCode
      ? `Codex login opened. If prompted, enter code ${session.userCode}.`
      : 'Codex login opened. Finish sign-in in the browser.';
    codex.onNotification = (message) => {
      if (message.method !== 'account/login/completed') return;
      if (message.params?.success) {
        session.status = 'connected';
        scheduleCleanup(session.id);
      } else {
        session.status = 'failed';
        session.error = message.params?.error || 'Codex login failed';
        scheduleCleanup(session.id);
      }
    };
    if (openBrowser && session.verificationUrl) await openUrl(session.verificationUrl).catch(() => false);
    return publicSession(session);
  } catch (error) {
    session.status = 'failed';
    session.error = error instanceof Error ? error.message : String(error);
    closeSession(session);
    return publicSession(session);
  }
}

async function startClaudeOAuth({
  cwd,
  env,
  openBrowser,
}: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  openBrowser: boolean;
}): Promise<LoginSession> {
  const runtime = runtimeProviderStatus('claude', cwd, env);
  if (!runtime.installed) return failedSession('claude', 'cli_oauth', 'Claude Code CLI is not installed.');
  await ensurePrivateDir(providerHome('claude', cwd, env));
  const session = makeSession('claude', 'cli_oauth', {
    instructions: 'Finish Claude login in the browser. If Claude shows an authorization code, submit it with the same session id.',
  });
  oauthSessions.set(session.id, session);

  const child = spawnExecutable('claude', ['auth', 'login', '--claudeai'], {
    cwd,
    env: {
      ...baseCliEnv(cwd, env),
      CLAUDE_CONFIG_DIR: providerHome('claude', cwd, env),
      BROWSER: env.CLAUDE_LOGIN_BROWSER || 'echo',
    },
  });
  session.child = child;
  child.stdout?.on('data', (chunk) => consumeUrlOutput(session, chunk, CLAUDE_URL_RE, openBrowser));
  child.stderr?.on('data', (chunk) => consumeUrlOutput(session, chunk, CLAUDE_URL_RE, openBrowser));
  child.on('close', () => completeProcessSession(session, 'claude', cwd, env, 'Claude login exited before OAuth completed.'));
  child.on('error', (error) => {
    session.status = 'failed';
    session.error = error.message;
    scheduleCleanup(session.id);
  });

  await sleep(1200);
  if (session.status === 'starting') session.status = 'pending';
  return publicSession(session);
}

async function startGeminiOAuth({
  cwd,
  env,
  openBrowser,
}: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  openBrowser: boolean;
}): Promise<LoginSession> {
  const runtime = runtimeProviderStatus('gemini', cwd, env);
  if (!runtime.installed) return failedSession('gemini', 'cli_oauth', 'Gemini CLI is not installed.');
  if (process.platform === 'win32') return failedSession('gemini', 'cli_oauth', 'Gemini OAuth capture requires a pseudo-terminal on non-Windows systems.');
  await ensureGeminiConfigDir(cwd, env);
  const bundlePath = geminiBundlePath(cwd);
  if (!bundlePath) return failedSession('gemini', 'cli_oauth', 'Gemini CLI bundle was not found.');

  const session = makeSession('gemini', 'cli_oauth', {
    instructions: 'Finish Google login in the browser. If Gemini shows an authorization code, submit it with the same session id.',
  });
  oauthSessions.set(session.id, session);
  const child = spawn(process.env.PYTHON || 'python3', ['-c', PYTHON_PTY_RUNNER, process.execPath, bundlePath], {
    cwd,
    env: sanitizedCliEnv(env, {
      ...baseCliEnv(cwd, env),
      GEMINI_CLI_HOME: providerHome('gemini', cwd, env),
      GEMINI_CLI_NO_RELAUNCH: 'true',
      GEMINI_CLI_TRUST_WORKSPACE: 'true',
      GEMINI_FORCE_FILE_STORAGE: 'true',
      GEMINI_FORCE_ENCRYPTED_FILE_STORAGE: 'true',
      NO_BROWSER: 'true',
      TERM: env.TERM || 'xterm-256color',
      COLORTERM: env.COLORTERM || 'truecolor',
    }),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  session.child = child;
  child.stdout?.on('data', (chunk) => consumeUrlOutput(session, chunk, GEMINI_URL_RE, openBrowser));
  child.stderr?.on('data', (chunk) => consumeUrlOutput(session, chunk, GEMINI_URL_RE, openBrowser));
  child.on('close', (code) => {
    session.exited = true;
    session.exitCode = code;
    completeProcessSession(session, 'gemini', cwd, env, geminiExitError(session));
  });
  child.on('error', (error) => {
    session.status = 'failed';
    session.error = error.message;
    scheduleCleanup(session.id);
  });

  await sleep(1200);
  if (session.status === 'starting') session.status = 'pending';
  return publicSession(session);
}

async function startCommandOAuth({
  provider,
  authKind,
  cwd,
  env,
}: {
  provider: ProviderSlug;
  authKind: AuthKind;
  cwd: string;
  env: NodeJS.ProcessEnv;
}): Promise<LoginSession> {
  const runtime = runtimeProviderStatus(provider, cwd, env);
  if (runtime.authConfigured) return makeSession(provider, authKind, { status: 'connected' });
  return makeSession(provider, authKind, {
    status: 'pending',
    command: PROVIDERS[provider].binary,
    instructions:
      provider === 'grok'
        ? 'Grok browser OAuth depends on the installed Grok CLI. Run `grok` login locally, or use XAI_API_KEY for server mode.'
        : `Run ${PROVIDERS[provider].binary} login locally, then call status with this session id.`,
  });
}

function makeSession(provider: ProviderSlug, authKind: AuthKind, updates: Partial<LoginSession> = {}): OAuthSessionState {
  return {
    id: crypto.randomUUID(),
    provider,
    authKind,
    status: 'starting',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
    ...updates,
  };
}

function failedSession(provider: ProviderSlug, authKind: AuthKind, error: string): LoginSession {
  return publicSession(makeSession(provider, authKind, { status: 'failed', error }));
}

function publicSession(session: OAuthSessionState): LoginSession {
  return {
    id: session.id,
    provider: session.provider,
    authKind: session.authKind,
    status: session.status,
    verificationUrl: session.verificationUrl,
    userCode: session.userCode,
    needsCode: session.needsCode,
    command: session.command,
    instructions: session.instructions,
    error: session.error,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
  };
}

function consumeUrlOutput(session: OAuthSessionState, chunk: Buffer, pattern: RegExp, openBrowser: boolean): void {
  const text = cleanTerminalText(chunk.toString('utf8'));
  session.outputTail = `${session.outputTail || ''}${text}`.slice(-8000);
  const found = text.match(pattern) || session.outputTail.match(pattern);
  if (!found) return;
  if (!session.verificationUrl) {
    session.verificationUrl = found[0];
    session.needsCode = session.provider === 'claude' || session.provider === 'gemini';
    session.status = 'pending';
    if (openBrowser) openUrl(session.verificationUrl).catch(() => false);
  }
}

async function completeProcessSession(
  session: OAuthSessionState,
  provider: ProviderSlug,
  cwd: string,
  env: NodeJS.ProcessEnv,
  fallbackError: string
): Promise<void> {
  const runtime = runtimeProviderStatus(provider, cwd, env);
  if (runtime.authConfigured) {
    session.status = 'connected';
    scheduleCleanup(session.id);
    return;
  }
  if (session.status !== 'cancelled') {
    session.status = session.verificationUrl ? 'pending' : 'failed';
    if (!session.verificationUrl) session.error = fallbackError;
  }
}

function geminiExitError(session: OAuthSessionState): string {
  if (session.verificationUrl) return 'Gemini login process exited before the authorization code was submitted. Start login again.';
  const tail = String(session.outputTail || '').trim().split('\n').slice(-4).join(' ').trim();
  return tail ? `Gemini login exited before an OAuth URL was detected: ${tail.slice(0, 500)}` : 'Gemini login exited before an OAuth URL was detected.';
}

async function completeCodexIfReady(session: OAuthSessionState): Promise<void> {
  const account = await session.codex?.call('account/read', { refreshToken: true }, 30000).catch(() => null);
  if (account?.account) {
    session.status = 'connected';
    scheduleCleanup(session.id);
  }
}

function closeSession(session: OAuthSessionState): void {
  try {
    session.child?.kill('SIGTERM');
  } catch {
    // noop
  }
  try {
    session.codex?.close();
  } catch {
    // noop
  }
}

function scheduleCleanup(id: string, delay = CLEANUP_MS): void {
  setTimeout(() => {
    const session = oauthSessions.get(id);
    if (!session) return;
    closeSession(session);
    oauthSessions.delete(id);
  }, delay).unref?.();
}

function cleanTerminalText(text: string): string {
  const osc = new RegExp(`${String.fromCharCode(27)}\\][^${String.fromCharCode(7)}]*(?:${String.fromCharCode(7)}|${String.fromCharCode(27)}\\\\)`, 'g');
  const ansi = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'g');
  return text.replace(osc, '').replace(ansi, '');
}

function baseCliEnv(cwd: string, env: NodeJS.ProcessEnv): Record<string, string | undefined> {
  return {
    HRU_AI_HOME: providerHome('codex', cwd, env).split(path.sep).slice(0, -1).join(path.sep),
  };
}

async function openUrl(url: string): Promise<boolean> {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.unref();
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function geminiBundlePath(cwd: string): string {
  const candidates = [cwd, process.cwd()].map((root) =>
    path.join(root, 'node_modules', '@google', 'gemini-cli', 'bundle', 'gemini.js')
  );
  return candidates.find((candidate) => fs.existsSync(candidate)) || findExecutable('gemini', cwd) || '';
}

class CodexAppServer {
  child: ChildProcess | null = null;
  nextId = 1;
  buffer = '';
  pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  onNotification?: (message: JsonRecord) => void;

  constructor(
    private readonly cwd: string,
    private readonly env: NodeJS.ProcessEnv
  ) {}

  async start(): Promise<this> {
    await ensurePrivateDir(providerHome('codex', this.cwd, this.env));
    this.child = spawnExecutable('codex', ['app-server', '--listen', 'stdio://'], {
      cwd: this.cwd,
      env: {
        CODEX_HOME: providerHome('codex', this.cwd, this.env),
      },
    });
    this.child.stdout?.on('data', (chunk) => this.handleStdout(chunk));
    this.child.on('close', () => {
      for (const entry of this.pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(new Error('Codex app-server exited'));
      }
      this.pending.clear();
    });
    await this.call(
      'initialize',
      {
        clientInfo: { name: 'hru-ai-connectors', version: '0.1.0' },
        capabilities: { experimentalApi: true },
      },
      15000
    );
    return this;
  }

  call(method: string, params: JsonRecord = {}, timeoutMs = 60000): Promise<JsonRecord> {
    if (!this.child || this.child.killed) return Promise.reject(new Error('Codex app-server is not running'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex app-server timed out during ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child?.stdin?.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  close(): void {
    try {
      this.child?.kill('SIGTERM');
    } catch {
      // noop
    }
    this.child = null;
  }

  private handleStdout(chunk: Buffer): void {
    this.buffer += chunk.toString('utf8');
    let idx = this.buffer.indexOf('\n');
    while (idx >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (line) this.handleMessageLine(line);
      idx = this.buffer.indexOf('\n');
    }
  }

  private handleMessageLine(line: string): void {
    let message: JsonRecord;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message.id !== undefined && this.pending.has(message.id)) {
      const entry = this.pending.get(message.id)!;
      this.pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.error) entry.reject(new Error(message.error.message || 'Codex app-server request failed'));
      else entry.resolve(message.result || {});
      return;
    }
    if (message.method) this.onNotification?.(message);
  }
}

const PYTHON_PTY_RUNNER = String.raw`
import errno
import os
import pty
import select
import signal
import subprocess
import sys

command = sys.argv[1:]
child = None

def stop_child(signum, frame):
    if child and child.poll() is None:
        try:
            child.terminate()
        except Exception:
            pass
    sys.exit(128 + signum)

signal.signal(signal.SIGTERM, stop_child)
signal.signal(signal.SIGINT, stop_child)

master_fd, slave_fd = pty.openpty()
child = subprocess.Popen(command, stdin=slave_fd, stdout=slave_fd, stderr=slave_fd, close_fds=True)
os.close(slave_fd)
os.set_blocking(master_fd, False)
os.set_blocking(sys.stdin.fileno(), False)
stdin_open = True

def drain_master():
    while True:
        try:
            data = os.read(master_fd, 4096)
        except BlockingIOError:
            return
        except OSError as error:
            if error.errno == errno.EIO:
                return
            raise
        if not data:
            return
        os.write(sys.stdout.fileno(), data)
        sys.stdout.flush()

try:
    while True:
        read_fds = [master_fd]
        if stdin_open:
            read_fds.append(sys.stdin.fileno())
        readable, _, _ = select.select(read_fds, [], [], 0.1)
        if master_fd in readable:
            drain_master()
        if stdin_open and sys.stdin.fileno() in readable:
            try:
                user_input = os.read(sys.stdin.fileno(), 4096)
            except BlockingIOError:
                user_input = None
            if user_input:
                os.write(master_fd, user_input)
            else:
                stdin_open = False
        code = child.poll()
        if code is not None:
            drain_master()
            sys.exit(code)
finally:
    try:
        os.close(master_fd)
    except Exception:
        pass
    if child and child.poll() is None:
        try:
            child.terminate()
        except Exception:
            pass
`;
