import { getDefaultConnectors } from './create-ai-connectors.js';
import { normalizeProvider } from './provider-alias.js';
import type {
  ConnectProviderOptions,
  ConnectAIInput,
  GenerateImageInput,
  GenerateMediaTextInput,
  GenerateSpeechInput,
  GenerateTextInput,
  GenerateVideoInput,
  ProviderInput,
  TranscribeAudioInput,
  UseAIInput,
  UploadFileInput,
} from './types.js';

export { connectAI } from './connect-ai.js';
export { useAI } from './use-ai.js';
export { createAiConnectors, getDefaultConnectors } from './create-ai-connectors.js';
export { normalizeProvider } from './provider-alias.js';
export { runtimeStatus, runtimeProviderStatus, packageVersion } from './runtime.js';
export { PROVIDERS, PROVIDER_SLUGS, isProviderSlug, requireProvider } from './providers.js';
export { redactEnv, sanitizedCliEnv, keyPreview } from './env.js';
export { MemoryProviderStore, FileProviderStore, SQLiteProviderStore } from './storage/index.js';
export { EnvSecretStore } from './secrets/env-secret-store.js';
export { EncryptedFileSecretStore } from './secrets/encrypted-file-secret-store.js';
export { SQLiteSecretStore } from './secrets/sqlite-secret-store.js';
export { generateCodexText } from './codex/generate.js';
export { generateClaudeText } from './claude/generate.js';
export { generateGeminiText } from './gemini/generate.js';
export { generateGrokText } from './grok/generate.js';
export {
  buildGrokResponsesContent,
  generateGrokImage,
  generateGrokSpeech,
  generateGrokTextFromMedia,
  generateGrokVideo,
  transcribeGrokAudio,
  uploadGrokFile,
} from './grok/media.js';
export { readCodexAccount } from './codex/status.js';
export { readClaudeStatus } from './claude/status.js';
export { readGeminiStatus } from './gemini/status.js';
export { readGrokStatus } from './grok/status.js';
export * from './errors.js';
export type * from './types.js';

export async function listProviders() {
  return getDefaultConnectors().listProviders();
}

export async function connectProvider(provider: ProviderInput, options?: ConnectProviderOptions) {
  return getDefaultConnectors().connectProvider(normalizeProvider(provider), options);
}

export async function getLoginStatus(provider: ProviderInput, sessionId: string) {
  return getDefaultConnectors().getLoginStatus(normalizeProvider(provider), sessionId);
}

export async function submitLoginCode(provider: ProviderInput, sessionId: string, code: string) {
  return getDefaultConnectors().submitLoginCode(normalizeProvider(provider), sessionId, code);
}

export async function disconnectProvider(provider: ProviderInput) {
  return getDefaultConnectors().disconnectProvider(normalizeProvider(provider));
}

export async function setDefaultProvider(provider: ProviderInput) {
  return getDefaultConnectors().setDefaultProvider(normalizeProvider(provider));
}

export async function generateText(input: GenerateTextInput) {
  return getDefaultConnectors().generateText(input);
}

export function streamText(input: GenerateTextInput) {
  return getDefaultConnectors().streamText(input);
}

export async function generateTextFromMedia(input: GenerateMediaTextInput) {
  return getDefaultConnectors().generateTextFromMedia(input);
}

export async function uploadFile(input: UploadFileInput) {
  return getDefaultConnectors().uploadFile(input);
}

export async function generateImage(input: GenerateImageInput) {
  return getDefaultConnectors().generateImage(input);
}

export async function generateVideo(input: GenerateVideoInput) {
  return getDefaultConnectors().generateVideo(input);
}

export async function generateSpeech(input: GenerateSpeechInput) {
  return getDefaultConnectors().generateSpeech(input);
}

export async function transcribeAudio(input: TranscribeAudioInput) {
  return getDefaultConnectors().transcribeAudio(input);
}

export type { ConnectAIInput, UseAIInput };
