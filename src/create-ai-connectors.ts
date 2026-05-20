import crypto from 'node:crypto';
import path from 'node:path';
import { spawnExecutable } from './process/run-cli.js';
import { keyPreview, resolveHomeDir } from './env.js';
import { PROVIDERS, PROVIDER_SLUGS } from './providers.js';
import { runtimeProviderStatus, runtimeStatus as readRuntimeStatus } from './runtime.js';
import { SQLiteProviderStore } from './storage/sqlite-store.js';
import { EnvSecretStore } from './secrets/env-secret-store.js';
import { generateText as generateTextRoot } from './generate-text.js';
import { streamText as streamTextRoot } from './stream-text.js';
import {
  generateImage as generateImageRoot,
  generateSpeech as generateSpeechRoot,
  generateTextFromMedia as generateTextFromMediaRoot,
  generateVideo as generateVideoRoot,
  transcribeAudio as transcribeAudioRoot,
  uploadFile as uploadFileRoot,
} from './media.js';
import type {
  AiConnectors,
  AiConnectorsOptions,
  AuthKind,
  ConnectProviderOptions,
  DisconnectResult,
  GenerateImageInput,
  GenerateImageResult,
  GenerateMediaTextInput,
  GenerateSpeechInput,
  GenerateSpeechResult,
  GenerateTextInput,
  GenerateTextResult,
  GenerateTextChunk,
  GenerateVideoInput,
  GenerateVideoResult,
  LoginSession,
  ProviderSlug,
  ProviderStatus,
  ProviderStore,
  SecretStore,
  StoredProvider,
  TranscribeAudioInput,
  TranscribeAudioResult,
  UploadFileInput,
  UploadFileResult,
} from './types.js';

const sessions = new Map<string, LoginSession>();

function nowIso() {
  return new Date().toISOString();
}

function expiresIso() {
  return new Date(Date.now() + 10 * 60 * 1000).toISOString();
}

function makeSession(provider: ProviderSlug, authKind: AuthKind, updates: Partial<LoginSession> = {}): LoginSession {
  const session: LoginSession = {
    id: crypto.randomUUID(),
    provider,
    authKind,
    status: 'pending',
    createdAt: nowIso(),
    expiresAt: expiresIso(),
    ...updates,
  };
  sessions.set(session.id, session);
  return session;
}

function loginCommand(provider: ProviderSlug): string {
  if (provider === 'codex') return 'codex';
  if (provider === 'claude') return 'claude auth login --claudeai';
  if (provider === 'gemini') return 'gemini';
  return 'grok';
}

function loginArgs(provider: ProviderSlug): string[] {
  if (provider === 'codex') return [];
  if (provider === 'claude') return ['auth', 'login', '--claudeai'];
  if (provider === 'gemini') return [];
  return [];
}

function storedProvider(provider: ProviderSlug, authKind: AuthKind, isDefault = false, apiKey = ''): StoredProvider {
  const definition = PROVIDERS[provider];
  return {
    slug: provider,
    label: definition.label,
    vendor: definition.vendor,
    enabled: true,
    isDefault,
    authKind,
    transport: provider === 'grok' && authKind === 'api_key' ? 'api' : definition.defaultTransport,
    accountInfo: {
      defaultModel: definition.defaultModel,
      providerAuthMode: authKind,
    },
    keyPreview: apiKey ? keyPreview(apiKey) : undefined,
    connectedAt: nowIso(),
  };
}

function hasVertexAuth(env: NodeJS.ProcessEnv): boolean {
  return !!(env.GOOGLE_CLOUD_PROJECT && (env.GOOGLE_APPLICATION_CREDENTIALS || env.GOOGLE_CLOUD_LOCATION));
}

export function createAiConnectors(options: AiConnectorsOptions = {}): AiConnectors {
  const cwd = options.cwd || process.cwd();
  const env = options.env || process.env;
  const homeDir = path.resolve(cwd, options.homeDir || env.HRU_AI_HOME || '.hru-ai');
  const sqlitePath = env.HRU_AI_SQLITE_PATH ? path.resolve(cwd, env.HRU_AI_SQLITE_PATH) : path.join(homeDir, 'providers.sqlite');
  const store: ProviderStore = options.store || new SQLiteProviderStore(sqlitePath);
  const secretStore: SecretStore = options.secretStore || new EnvSecretStore(env);
  const defaultProvider = options.defaultProvider || 'codex';

  async function listProviders(): Promise<ProviderStatus[]> {
    const records = await store.list();
    const bySlug = new Map(records.map((record) => [record.slug, record]));
    return PROVIDER_SLUGS.map((slug) => {
      const runtime = runtimeProviderStatus(slug, cwd, env);
      const stored = bySlug.get(slug);
      const record = stored || {
        ...storedProvider(slug, PROVIDERS[slug].defaultAuthKind, slug === defaultProvider),
        connectedAt: undefined,
      };
      return {
        ...record,
        runtime,
        connected: !!stored && record.enabled !== false && (runtime.authConfigured || !!stored.connectedAt),
      };
    });
  }

  async function connectProvider(provider: ProviderSlug, connectOptions: ConnectProviderOptions = {}): Promise<LoginSession> {
    const definition = PROVIDERS[provider];
    const authKind = connectOptions.authKind || definition.defaultAuthKind;
    const apiKey =
      connectOptions.apiKey ||
      (provider === 'grok' ? env.XAI_API_KEY || env.GROK_CODE_XAI_API_KEY : '') ||
      (provider === 'codex' ? env.OPENAI_API_KEY : '') ||
      (provider === 'claude' ? env.ANTHROPIC_API_KEY || env.CLAUDE_CODE_OAUTH_TOKEN : '') ||
      (provider === 'gemini' ? env.GEMINI_API_KEY || env.GOOGLE_API_KEY : '');

    if (authKind === 'api_key' || (provider === 'grok' && apiKey)) {
      await store.upsert(storedProvider(provider, 'api_key', !!connectOptions.setDefault, apiKey));
      return makeSession(provider, 'api_key', {
        status: 'connected',
        instructions: `${definition.label} connected with API key metadata. Raw key was not stored by default.`,
      });
    }

    if (authKind === 'oauth_token' && connectOptions.oauthToken) {
      await store.upsert(storedProvider(provider, 'oauth_token', !!connectOptions.setDefault));
      return makeSession(provider, 'oauth_token', {
        status: 'connected',
        instructions: `${definition.label} connected with OAuth token metadata. Raw token was not stored by default.`,
      });
    }

    if (provider === 'gemini' && authKind === 'vertex' && hasVertexAuth(env)) {
      await store.upsert(storedProvider(provider, 'vertex', !!connectOptions.setDefault));
      return makeSession(provider, 'vertex', {
        status: 'connected',
        instructions: `${definition.label} connected with Vertex AI environment metadata.`,
      });
    }

    if (connectOptions.interactive) {
      const code = await runInteractiveLogin(provider);
      const runtime = runtimeProviderStatus(provider, cwd, env);
      if (code === 0 || runtime.authConfigured) {
        await store.upsert(storedProvider(provider, authKind, !!connectOptions.setDefault));
        return makeSession(provider, authKind, { status: 'connected', command: loginCommand(provider) });
      }
      return makeSession(provider, authKind, {
        status: 'failed',
        command: loginCommand(provider),
        error: `${definition.label} login command exited with code ${code}`,
      });
    }

    return makeSession(provider, authKind, {
      command: loginCommand(provider),
      instructions: `Run \`${loginCommand(provider)}\` in a terminal, then call getLoginStatus(). Server apps should use API-key mode where provider docs support it.`,
    });
  }

  async function getLoginStatus(provider: ProviderSlug, sessionId: string): Promise<LoginSession | null> {
    const session = sessions.get(sessionId);
    if (!session || session.provider !== provider) return null;
    if (session.expiresAt && Date.now() > new Date(session.expiresAt).getTime()) {
      session.status = 'expired';
      return session;
    }
    const runtime = runtimeProviderStatus(provider, cwd, env);
    const record = await store.get(provider);
    if (runtime.authConfigured || record?.enabled) {
      session.status = 'connected';
      if (!record) await store.upsert(storedProvider(provider, session.authKind));
    }
    return session;
  }

  async function disconnectProvider(provider: ProviderSlug): Promise<DisconnectResult> {
    const existing = await store.get(provider);
    await store.delete(provider);
    return {
      provider,
      ok: true,
      removedMetadata: !!existing,
      details: {
        note: 'CLI-managed credentials were not deleted. Remove provider auth files or run provider logout manually if needed.',
      },
    };
  }

  async function setDefaultProvider(provider: ProviderSlug): Promise<void> {
    const records = await store.list();
    for (const record of records) {
      await store.upsert({ ...record, isDefault: record.slug === provider });
    }
    if (!records.some((record) => record.slug === provider)) {
      await store.upsert(storedProvider(provider, PROVIDERS[provider].defaultAuthKind, true));
    }
  }

  async function generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
    const provider = input.provider || (await resolveDefaultProvider(store, defaultProvider));
    return generateTextRoot({ ...input, provider });
  }

  async function* streamText(input: GenerateTextInput): AsyncIterable<GenerateTextChunk> {
    const provider = input.provider || (await resolveDefaultProvider(store, defaultProvider));
    yield* streamTextRoot({ ...input, provider });
  }

  async function generateTextFromMedia(input: GenerateMediaTextInput): Promise<GenerateTextResult> {
    const provider = input.provider || (await resolveDefaultProvider(store, defaultProvider));
    return generateTextFromMediaRoot({ ...input, provider });
  }

  async function uploadFile(input: UploadFileInput): Promise<UploadFileResult> {
    const provider = input.provider || (await resolveDefaultProvider(store, defaultProvider));
    return uploadFileRoot({ ...input, provider });
  }

  async function generateImage(input: GenerateImageInput): Promise<GenerateImageResult> {
    const provider = input.provider || (await resolveDefaultProvider(store, defaultProvider));
    return generateImageRoot({ ...input, provider });
  }

  async function generateVideo(input: GenerateVideoInput): Promise<GenerateVideoResult> {
    const provider = input.provider || (await resolveDefaultProvider(store, defaultProvider));
    return generateVideoRoot({ ...input, provider });
  }

  async function generateSpeech(input: GenerateSpeechInput): Promise<GenerateSpeechResult> {
    const provider = input.provider || (await resolveDefaultProvider(store, defaultProvider));
    return generateSpeechRoot({ ...input, provider });
  }

  async function transcribeAudio(input: TranscribeAudioInput): Promise<TranscribeAudioResult> {
    const provider = input.provider || (await resolveDefaultProvider(store, defaultProvider));
    return transcribeAudioRoot({ ...input, provider });
  }

  async function runInteractiveLogin(provider: ProviderSlug): Promise<number | null> {
    const child = spawnExecutable(PROVIDERS[provider].binary, loginArgs(provider), {
      cwd,
      stdio: 'inherit',
      env: {
        HRU_AI_HOME: resolveHomeDir(cwd, env),
      },
    });
    return new Promise((resolve) => {
      child.on('close', (code) => resolve(code));
      child.on('error', () => resolve(null));
    });
  }

  void secretStore;

  return {
    runtimeStatus: () => readRuntimeStatus({ cwd, env }),
    listProviders,
    connectProvider,
    getLoginStatus,
    disconnectProvider,
    generateText,
    streamText,
    generateTextFromMedia,
    uploadFile,
    generateImage,
    generateVideo,
    generateSpeech,
    transcribeAudio,
    setDefaultProvider,
    runInteractiveLogin,
  };
}

async function resolveDefaultProvider(store: ProviderStore, fallback: ProviderSlug): Promise<ProviderSlug> {
  const record = (await store.list()).find((provider) => provider.enabled !== false && provider.isDefault);
  return record?.slug || fallback;
}

let defaultConnectors: AiConnectors | null = null;

export function getDefaultConnectors(): AiConnectors {
  if (!defaultConnectors) defaultConnectors = createAiConnectors();
  return defaultConnectors;
}
