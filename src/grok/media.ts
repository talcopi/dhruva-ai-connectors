import fsp from 'node:fs/promises';
import path from 'node:path';
import { ProviderAuthUnsupportedError, ProviderGenerationError, ProviderNotConnectedError } from '../errors.js';
import { modelFromEnv } from '../env.js';
import { extractTextFromKnownJson } from '../generate-text.js';
import { PROVIDERS } from '../providers.js';
import { sanitizeOutput } from '../process/sanitize-output.js';
import type {
  AuthOverride,
  GenerateImageInput,
  GenerateImageResult,
  GenerateMediaTextInput,
  GenerateSpeechInput,
  GenerateSpeechResult,
  GenerateTextResult,
  GenerateVideoInput,
  GenerateVideoResult,
  MediaInputPart,
  ProviderSlug,
  TranscribeAudioInput,
  TranscribeAudioResult,
  UploadFileInput,
  UploadFileResult,
} from '../types.js';

type JsonRecord = Record<string, any>;
type FileLikeInput = Pick<UploadFileInput, 'filePath' | 'file' | 'filename' | 'mimeType'>;

const DEFAULT_REQUEST_TIMEOUT_MS = 120000;
const DEFAULT_VIDEO_TIMEOUT_MS = 600000;
const DEFAULT_VIDEO_POLL_INTERVAL_MS = 5000;

export function buildGrokResponsesContent(input: GenerateMediaTextInput): JsonRecord[] {
  if (!input.prompt || !String(input.prompt).trim()) {
    throw new Error('Prompt is required');
  }

  const content: JsonRecord[] = [];
  for (const part of input.media || []) {
    if (part.type === 'text') {
      if (part.text) content.push({ type: 'input_text', text: part.text });
      continue;
    }
    if (part.type === 'image') {
      const imageUrl = part.url || part.dataUrl;
      if (!imageUrl) throw new Error('Image media requires url or dataUrl');
      content.push({
        type: 'input_image',
        image_url: imageUrl,
        ...(part.detail ? { detail: part.detail } : {}),
      });
      continue;
    }
    if (part.type === 'file') {
      if (!part.url && !part.fileId) throw new Error('File media requires url or fileId');
      content.push({
        type: 'input_file',
        ...(part.url ? { file_url: part.url } : {}),
        ...(part.fileId ? { file_id: part.fileId } : {}),
      });
    }
  }

  content.push({ type: 'input_text', text: String(input.prompt) });
  return content;
}

export async function generateGrokTextFromMedia(input: GenerateMediaTextInput): Promise<GenerateTextResult> {
  const apiKey = requireGrokApiKey(input.auth);
  const model = input.model || modelFromEnv('grok', PROVIDERS.grok.defaultModel);
  const json = await postGrokJson(
    '/responses',
    apiKey,
    {
      model,
      store: input.store ?? false,
      input: [
        ...(input.system ? [{ role: 'system', content: input.system }] : []),
        {
          role: 'user',
          content: buildGrokResponsesContent(input),
        },
      ],
    },
    input.timeoutMs
  );

  return {
    provider: 'grok',
    transport: 'api',
    model,
    text: extractTextFromKnownJson(json).trim(),
    raw: json,
    usage: {
      inputTokens: json?.usage?.input_tokens,
      outputTokens: json?.usage?.output_tokens,
      totalTokens: json?.usage?.total_tokens,
    },
    account: {
      defaultModel: model,
      providerAuthMode: 'xai_api_key',
    },
  };
}

export async function uploadGrokFile(input: UploadFileInput): Promise<UploadFileResult> {
  const apiKey = requireGrokApiKey(input.auth);
  const form = new FormData();
  await appendFile(form, input);
  form.append('purpose', input.purpose || 'assistants');

  const json = await fetchGrok('/files', apiKey, { method: 'POST', body: form }, input.timeoutMs);
  return {
    provider: 'grok',
    id: String(json?.id || ''),
    filename: json?.filename || input.filename || (input.filePath ? path.basename(input.filePath) : undefined),
    purpose: json?.purpose || input.purpose || 'assistants',
    bytes: json?.bytes,
    raw: json,
  };
}

export async function generateGrokImage(input: GenerateImageInput): Promise<GenerateImageResult> {
  const apiKey = requireGrokApiKey(input.auth);
  const model = input.model || 'grok-imagine-image';
  if (!input.prompt || !String(input.prompt).trim()) throw new Error('Prompt is required');

  const json = await postGrokJson(
    '/images/generations',
    apiKey,
    {
      model,
      prompt: input.prompt,
      ...(input.n ? { n: input.n } : {}),
      ...(input.size ? { size: input.size } : {}),
      ...(input.responseFormat ? { response_format: input.responseFormat } : {}),
    },
    input.timeoutMs
  );

  return {
    provider: 'grok',
    model,
    images: Array.isArray(json?.data)
      ? json.data.map((item: JsonRecord) => ({
          url: item.url,
          b64Json: item.b64_json,
          revisedPrompt: item.revised_prompt,
          raw: item,
        }))
      : [],
    raw: json,
  };
}

export async function generateGrokVideo(input: GenerateVideoInput): Promise<GenerateVideoResult> {
  const apiKey = requireGrokApiKey(input.auth);
  const model = input.model || 'grok-imagine-video';
  if (!input.prompt || !String(input.prompt).trim()) throw new Error('Prompt is required');

  const timeoutMs = input.timeoutMs ?? DEFAULT_VIDEO_TIMEOUT_MS;
  const started = await postGrokJson(
    '/videos/generations',
    apiKey,
    {
      model,
      prompt: input.prompt,
      ...(input.duration ? { duration: input.duration } : {}),
      ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
      ...(input.resolution ? { resolution: input.resolution } : {}),
      ...(input.image ? { image: input.image } : {}),
      ...(input.referenceImages?.length ? { reference_images: input.referenceImages } : {}),
    },
    Math.min(timeoutMs, DEFAULT_REQUEST_TIMEOUT_MS)
  );
  const requestId = String(started?.request_id || started?.id || '');

  if (input.waitForCompletion === false || !requestId) {
    return {
      provider: 'grok',
      model,
      requestId: requestId || undefined,
      status: started?.status || 'pending',
      raw: started,
    };
  }

  const deadline = Date.now() + timeoutMs;
  const pollIntervalMs = input.pollIntervalMs ?? DEFAULT_VIDEO_POLL_INTERVAL_MS;
  let latest: JsonRecord = started;

  while (Date.now() < deadline) {
    await sleep(pollIntervalMs);
    latest = await getGrokJson(`/videos/${encodeURIComponent(requestId)}`, apiKey, Math.min(pollIntervalMs, 30000));
    const status = String(latest?.status || '').toLowerCase();
    if (status === 'done' || status === 'completed' || status === 'succeeded') {
      return {
        provider: 'grok',
        model,
        requestId,
        status,
        videoUrl: latest?.video?.url || latest?.url || latest?.data?.[0]?.url,
        raw: latest,
      };
    }
    if (status === 'failed' || status === 'expired' || status === 'cancelled') {
      throw new ProviderGenerationError('grok', sanitizeOutput(latest?.error?.message || `Grok video generation ${status}`));
    }
  }

  throw new ProviderGenerationError('grok', 'Grok video generation timed out');
}

export async function generateGrokSpeech(input: GenerateSpeechInput): Promise<GenerateSpeechResult> {
  const apiKey = requireGrokApiKey(input.auth);
  if (!input.text || !String(input.text).trim()) throw new Error('Text is required');

  const response = await fetchWithTimeout(
    `${grokBaseUrl()}/tts`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        text: input.text,
        voice_id: input.voiceId || 'eve',
        ...(input.language ? { language: input.language } : {}),
        ...(input.model ? { model: input.model } : {}),
      }),
    },
    input.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new ProviderGenerationError('grok', sanitizeOutput(errorText || `Grok TTS failed with HTTP ${response.status}`));
  }

  return {
    provider: 'grok',
    audio: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get('content-type') || 'audio/mpeg',
  };
}

export async function transcribeGrokAudio(input: TranscribeAudioInput): Promise<TranscribeAudioResult> {
  const apiKey = requireGrokApiKey(input.auth);
  const form = new FormData();
  await appendFile(form, input);
  if (input.model) form.append('model', input.model);
  if (input.language) form.append('language', input.language);

  const json = await fetchGrok('/stt', apiKey, { method: 'POST', body: form }, input.timeoutMs);
  return {
    provider: 'grok',
    text: String(json?.text || ''),
    raw: json,
  };
}

function requireGrokApiKey(auth?: AuthOverride): string {
  const apiKey = auth?.apiKey || process.env.XAI_API_KEY || process.env.GROK_CODE_XAI_API_KEY || '';
  if (!apiKey) throw new ProviderNotConnectedError('grok', 'Set XAI_API_KEY or pass auth.apiKey for Grok API media functions.');
  if (auth && auth.kind !== 'api_key') {
    throw new ProviderAuthUnsupportedError('grok', 'Grok media functions use API-key auth.');
  }
  return apiKey;
}

function grokBaseUrl(): string {
  return (process.env.XAI_BASE_URL || 'https://api.x.ai/v1').replace(/\/$/, '');
}

async function postGrokJson(pathname: string, apiKey: string, body: JsonRecord, timeoutMs?: number): Promise<JsonRecord> {
  return fetchGrok(
    pathname,
    apiKey,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    timeoutMs
  );
}

async function getGrokJson(pathname: string, apiKey: string, timeoutMs?: number): Promise<JsonRecord> {
  return fetchGrok(pathname, apiKey, { method: 'GET' }, timeoutMs);
}

async function fetchGrok(
  pathname: string,
  apiKey: string,
  init: RequestInit,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
): Promise<JsonRecord> {
  const response = await fetchWithTimeout(
    `${grokBaseUrl()}${pathname}`,
    {
      ...init,
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${apiKey}`,
      },
    },
    timeoutMs
  );
  const rawText = await response.text();
  const json = rawText ? parseJson(rawText) : null;
  if (!response.ok) {
    throw new ProviderGenerationError(
      'grok',
      sanitizeOutput(json?.error?.message || json?.message || rawText || `Grok API failed with HTTP ${response.status}`)
    );
  }
  return json || {};
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ProviderGenerationError('grok', sanitizeOutput(message), error);
  } finally {
    clearTimeout(timer);
  }
}

async function appendFile(form: FormData, input: FileLikeInput): Promise<void> {
  const filename = input.filename || (input.filePath ? path.basename(input.filePath) : 'upload.bin');
  const mimeType = input.mimeType || guessMimeType(filename);

  if (input.filePath) {
    const buffer = await fsp.readFile(input.filePath);
    form.append('file', new Blob([toArrayBuffer(buffer)], { type: mimeType }), filename);
    return;
  }

  if (input.file instanceof Blob) {
    form.append('file', input.file, filename);
    return;
  }

  if (input.file instanceof ArrayBuffer) {
    form.append('file', new Blob([input.file], { type: mimeType }), filename);
    return;
  }

  if (input.file) {
    const bytes = input.file instanceof Uint8Array ? input.file : new Uint8Array(input.file);
    form.append('file', new Blob([toArrayBuffer(bytes)], { type: mimeType }), filename);
    return;
  }

  throw new Error('filePath or file is required');
}

function parseJson(value: string): JsonRecord | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function guessMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const types: Record<string, string> = {
    '.aac': 'audio/aac',
    '.csv': 'text/csv',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.flac': 'audio/flac',
    '.gif': 'image/gif',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.json': 'application/json',
    '.m4a': 'audio/mp4',
    '.mkv': 'video/x-matroska',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.ogg': 'audio/ogg',
    '.opus': 'audio/opus',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.txt': 'text/plain',
    '.wav': 'audio/wav',
    '.webm': 'video/webm',
    '.webp': 'image/webp',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  return types[ext] || 'application/octet-stream';
}

export function assertGrokMediaProvider(provider: ProviderSlug): void {
  if (provider !== 'grok') {
    throw new ProviderAuthUnsupportedError(
      provider,
      'Media, image, voice, and video helpers are currently implemented for Grok API mode. Use generateText() for Codex, Claude, and Gemini text calls.'
    );
  }
}

export type { MediaInputPart };
