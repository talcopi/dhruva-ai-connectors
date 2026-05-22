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
import { dataUrlForArtifact, generateLocalArtifact } from './local-artifact.js';
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
  if (provider !== 'grok' || input.mediaMode === 'agent-local') {
    const artifact = await generateLocalArtifact({
      provider,
      kind: 'image',
      prompt: input.prompt,
      model: input.model,
      auth: input.auth,
      timeoutMs: input.timeoutMs,
      cwd: input.cwd,
      filename: input.filename,
      outputDir: input.outputDir,
      instructions: input.instructions,
      permissionMode: input.permissionMode,
      artifactRunner: input.artifactRunner,
    });
    const b64Json = Buffer.from(artifact.bytes).toString('base64');
    return {
      provider,
      model: artifact.model,
      images: [
        {
          url: dataUrlForArtifact(artifact),
          b64Json,
          revisedPrompt: input.prompt,
          raw: artifact,
        },
      ],
      raw: artifact,
    };
  }
  return generateGrokImage(input);
}

export async function generateVideo(input: GenerateVideoInput): Promise<GenerateVideoResult> {
  const provider = resolveProvider(input.provider);
  if (provider !== 'grok' || input.mediaMode === 'agent-local') {
    const artifact = await generateLocalArtifact({
      provider,
      kind: 'video',
      prompt: input.prompt,
      model: input.model,
      auth: input.auth,
      timeoutMs: input.timeoutMs,
      cwd: input.cwd,
      filename: input.filename,
      outputDir: input.outputDir,
      instructions: input.instructions,
      permissionMode: input.permissionMode,
      artifactRunner: input.artifactRunner,
    });
    return {
      provider,
      model: artifact.model,
      status: 'completed',
      videoUrl: dataUrlForArtifact(artifact),
      raw: artifact,
    };
  }
  return generateGrokVideo(input);
}

export async function generateSpeech(input: GenerateSpeechInput): Promise<GenerateSpeechResult> {
  const provider = resolveProvider(input.provider);
  if (provider !== 'grok' || input.mediaMode === 'agent-local') {
    const artifact = await generateLocalArtifact({
      provider,
      kind: 'audio',
      prompt: input.text,
      model: input.model,
      auth: input.auth,
      timeoutMs: input.timeoutMs,
      cwd: input.cwd,
      filename: input.filename,
      outputDir: input.outputDir,
      instructions: [input.instructions, input.voiceId ? `Voice: ${input.voiceId}` : '', input.language ? `Language: ${input.language}` : '']
        .filter(Boolean)
        .join('\n'),
      permissionMode: input.permissionMode,
      artifactRunner: input.artifactRunner,
    });
    return {
      provider,
      audio: artifact.bytes,
      contentType: artifact.mimeType,
      raw: artifact,
    };
  }
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
    'Provider-native media helper is not implemented for this provider. Use mediaMode: "agent-local" for CLI-created local artifacts or use the provider API mode where supported.'
  );
}
