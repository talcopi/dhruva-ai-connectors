import { ProviderAuthUnsupportedError } from './errors.js';
import {
  assertGrokMediaProvider,
  generateGrokImage,
  generateGrokSpeech,
  generateGrokTextFromMedia,
  generateGrokVideo,
  transcribeGrokAudio,
  uploadGrokFile,
} from './grok/media.js';
import type {
  GenerateImageInput,
  GenerateImageResult,
  GenerateMediaTextInput,
  GenerateSpeechInput,
  GenerateSpeechResult,
  GenerateTextResult,
  GenerateVideoInput,
  GenerateVideoResult,
  ProviderSlug,
  TranscribeAudioInput,
  TranscribeAudioResult,
  UploadFileInput,
  UploadFileResult,
} from './types.js';

function resolveProvider(provider?: ProviderSlug): ProviderSlug {
  return provider || 'grok';
}

export async function generateTextFromMedia(input: GenerateMediaTextInput): Promise<GenerateTextResult> {
  const provider = resolveProvider(input.provider);
  assertGrokMediaProvider(provider);
  return generateGrokTextFromMedia(input);
}

export async function uploadFile(input: UploadFileInput): Promise<UploadFileResult> {
  const provider = resolveProvider(input.provider);
  assertGrokMediaProvider(provider);
  return uploadGrokFile(input);
}

export async function generateImage(input: GenerateImageInput): Promise<GenerateImageResult> {
  const provider = resolveProvider(input.provider);
  assertGrokMediaProvider(provider);
  return generateGrokImage(input);
}

export async function generateVideo(input: GenerateVideoInput): Promise<GenerateVideoResult> {
  const provider = resolveProvider(input.provider);
  assertGrokMediaProvider(provider);
  return generateGrokVideo(input);
}

export async function generateSpeech(input: GenerateSpeechInput): Promise<GenerateSpeechResult> {
  const provider = resolveProvider(input.provider);
  assertGrokMediaProvider(provider);
  return generateGrokSpeech(input);
}

export async function transcribeAudio(input: TranscribeAudioInput): Promise<TranscribeAudioResult> {
  const provider = resolveProvider(input.provider);
  assertGrokMediaProvider(provider);
  return transcribeGrokAudio(input);
}

export function unsupportedMediaProvider(provider: ProviderSlug): ProviderAuthUnsupportedError {
  return new ProviderAuthUnsupportedError(
    provider,
    'Media helper is not implemented for this provider. Use provider-specific API SDKs or call generateText() for text-only CLI generation.'
  );
}
