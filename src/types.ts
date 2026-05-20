import type { ChildProcess } from 'node:child_process';

export type ProviderSlug = 'codex' | 'claude' | 'gemini' | 'grok';

export type AuthKind = 'cli_oauth' | 'cli_browser' | 'api_key' | 'oauth_token' | 'vertex';

export type ProviderTransport = 'cli' | 'api' | 'app_server' | 'acp';

export type LoginStatus = 'starting' | 'pending' | 'connected' | 'failed' | 'cancelled' | 'expired';

export type GenerateMode = 'answer' | 'plan' | 'code';

export type ToolMode = 'none' | 'readonly' | 'provider_default';

export interface ProviderDefinition {
  slug: ProviderSlug;
  label: string;
  vendor: string;
  packageName: string | null;
  binary: string;
  authKinds: AuthKind[];
  defaultAuthKind: AuthKind;
  defaultTransport: ProviderTransport;
  defaultModelEnv: string;
  defaultModel: string;
}

export interface SafeAccountInfo {
  email?: string;
  organization?: string;
  planType?: string;
  cliPackage?: string;
  cliVersion?: string;
  cliHome?: string;
  defaultModel?: string;
  providerAuthMode?: string;
}

export interface RuntimeProviderStatus {
  slug: ProviderSlug;
  label: string;
  installed: boolean;
  binary: string;
  binaryPath?: string;
  packageName: string | null;
  packageVersion?: string;
  authHome: string;
  configuredAuthKinds: AuthKind[];
  authConfigured: boolean;
  defaultModel: string;
  notes?: string[];
}

export type RuntimeStatus = Record<ProviderSlug, RuntimeProviderStatus>;

export interface StoredProvider {
  slug: ProviderSlug;
  label: string;
  vendor: string;
  enabled: boolean;
  isDefault: boolean;
  authKind: AuthKind;
  transport: ProviderTransport;
  accountInfo: SafeAccountInfo;
  keyPreview?: string;
  encryptedSecretRef?: string;
  defaultModel?: string;
  connectedAt?: string;
  lastUsedAt?: string;
  lastError?: string;
}

export interface ProviderStatus extends StoredProvider {
  runtime: RuntimeProviderStatus;
  connected: boolean;
}

export interface ProviderStore {
  list(): Promise<StoredProvider[]>;
  get(slug: ProviderSlug): Promise<StoredProvider | null>;
  upsert(provider: StoredProvider): Promise<StoredProvider>;
  delete(slug: ProviderSlug): Promise<void>;
}

export interface SecretStore {
  set(id: string, value: string): Promise<void>;
  get(id: string): Promise<string | null>;
  delete(id: string): Promise<void>;
}

export interface AuthOverride {
  kind: AuthKind;
  apiKey?: string;
  oauthToken?: string;
}

export interface ConnectProviderOptions {
  authKind?: AuthKind;
  apiKey?: string;
  oauthToken?: string;
  email?: string;
  timeoutMs?: number;
  openBrowser?: boolean;
  interactive?: boolean;
  setDefault?: boolean;
}

export interface LoginSession {
  id: string;
  provider: ProviderSlug;
  authKind: AuthKind;
  status: LoginStatus;
  verificationUrl?: string;
  userCode?: string;
  command?: string;
  instructions?: string;
  error?: string;
  createdAt: string;
  expiresAt?: string;
}

export interface DisconnectResult {
  provider: ProviderSlug;
  ok: boolean;
  removedMetadata: boolean;
  details?: Record<string, unknown>;
}

export interface GenerateTextInput {
  provider?: ProviderSlug;
  prompt: string;
  system?: string;
  model?: string;
  auth?: AuthOverride;
  timeoutMs?: number;
  cwd?: string;
  mode?: GenerateMode;
  tools?: ToolMode;
  transport?: ProviderTransport;
}

export interface GenerateTextResult {
  provider: ProviderSlug;
  transport: ProviderTransport;
  model: string;
  text: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  account?: SafeAccountInfo;
  raw?: unknown;
}

export interface GenerateTextChunk {
  provider: ProviderSlug;
  model?: string;
  textDelta?: string;
  done?: boolean;
  raw?: unknown;
}

export type MediaInputPart =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'image';
      url?: string;
      dataUrl?: string;
      detail?: 'low' | 'high' | 'auto';
    }
  | {
      type: 'file';
      url?: string;
      fileId?: string;
    };

export interface GenerateMediaTextInput {
  provider?: ProviderSlug;
  prompt: string;
  system?: string;
  model?: string;
  auth?: AuthOverride;
  timeoutMs?: number;
  media?: MediaInputPart[];
  store?: boolean;
}

export interface UploadFileInput {
  provider?: ProviderSlug;
  auth?: AuthOverride;
  timeoutMs?: number;
  filePath?: string;
  file?: Blob | Buffer | Uint8Array | ArrayBuffer;
  filename?: string;
  mimeType?: string;
  purpose?: string;
}

export interface UploadFileResult {
  provider: ProviderSlug;
  id: string;
  filename?: string;
  purpose?: string;
  bytes?: number;
  raw?: unknown;
}

export interface GeneratedImage {
  url?: string;
  b64Json?: string;
  revisedPrompt?: string;
  raw?: unknown;
}

export interface GenerateImageInput {
  provider?: ProviderSlug;
  prompt: string;
  model?: string;
  auth?: AuthOverride;
  timeoutMs?: number;
  n?: number;
  size?: string;
  responseFormat?: 'url' | 'b64_json';
}

export interface GenerateImageResult {
  provider: ProviderSlug;
  model: string;
  images: GeneratedImage[];
  raw?: unknown;
}

export interface GenerateVideoInput {
  provider?: ProviderSlug;
  prompt: string;
  model?: string;
  auth?: AuthOverride;
  timeoutMs?: number;
  pollIntervalMs?: number;
  waitForCompletion?: boolean;
  duration?: number;
  aspectRatio?: string;
  resolution?: string;
  image?: string;
  referenceImages?: string[];
}

export interface GenerateVideoResult {
  provider: ProviderSlug;
  model: string;
  requestId?: string;
  status?: string;
  videoUrl?: string;
  raw?: unknown;
}

export interface GenerateSpeechInput {
  provider?: ProviderSlug;
  auth?: AuthOverride;
  timeoutMs?: number;
  text: string;
  voiceId?: string;
  language?: string;
  model?: string;
}

export interface GenerateSpeechResult {
  provider: ProviderSlug;
  audio: Uint8Array;
  contentType: string;
  raw?: unknown;
}

export interface TranscribeAudioInput {
  provider?: ProviderSlug;
  auth?: AuthOverride;
  timeoutMs?: number;
  filePath?: string;
  file?: Blob | Buffer | Uint8Array | ArrayBuffer;
  filename?: string;
  mimeType?: string;
  model?: string;
  language?: string;
}

export interface TranscribeAudioResult {
  provider: ProviderSlug;
  text: string;
  raw?: unknown;
}

export interface CliResult {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface RunCliOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
  input?: string;
}

export interface SpawnCliOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  stdio?: 'pipe' | 'inherit' | Array<'pipe' | 'inherit' | 'ignore'>;
}

export interface AiConnectorsOptions {
  cwd?: string;
  homeDir?: string;
  defaultProvider?: ProviderSlug;
  store?: ProviderStore;
  secretStore?: SecretStore;
  env?: NodeJS.ProcessEnv;
}

export interface AiConnectors {
  runtimeStatus(): Promise<RuntimeStatus>;
  listProviders(): Promise<ProviderStatus[]>;
  connectProvider(provider: ProviderSlug, options?: ConnectProviderOptions): Promise<LoginSession>;
  getLoginStatus(provider: ProviderSlug, sessionId: string): Promise<LoginSession | null>;
  disconnectProvider(provider: ProviderSlug): Promise<DisconnectResult>;
  generateText(input: GenerateTextInput): Promise<GenerateTextResult>;
  streamText(input: GenerateTextInput): AsyncIterable<GenerateTextChunk>;
  generateTextFromMedia(input: GenerateMediaTextInput): Promise<GenerateTextResult>;
  uploadFile(input: UploadFileInput): Promise<UploadFileResult>;
  generateImage(input: GenerateImageInput): Promise<GenerateImageResult>;
  generateVideo(input: GenerateVideoInput): Promise<GenerateVideoResult>;
  generateSpeech(input: GenerateSpeechInput): Promise<GenerateSpeechResult>;
  transcribeAudio(input: TranscribeAudioInput): Promise<TranscribeAudioResult>;
  setDefaultProvider(provider: ProviderSlug): Promise<void>;
  runInteractiveLogin(provider: ProviderSlug): Promise<number | null>;
}

export interface InteractiveLoginResult {
  provider: ProviderSlug;
  child: ChildProcess;
}
