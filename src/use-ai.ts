import { createAiConnectors } from './create-ai-connectors.js';
import { normalizeProvider } from './provider-alias.js';
import type { GeneratedAsset, ProviderSlug, UseAIInput, UseAIOutput, UseAIResult } from './types.js';

export async function useAI(input: UseAIInput): Promise<UseAIResult> {
  if (isBrowserRuntime()) return useAIFromBrowser(input);
  const provider = normalizeProvider(input.provider);
  const output = normalizeOutput(input.output);
  const connectors = createAiConnectors(input);

  if (output === 'text') {
    const result = await connectors.generateText({
      provider,
      prompt: requiredPrompt(input),
      system: input.system,
      model: input.model,
      auth: input.auth,
      timeoutMs: input.timeoutMs,
      cwd: input.cwd,
    });
    return { provider, output, model: result.model, text: result.text, raw: result.raw };
  }

  if (output === 'media-text') {
    const result = await connectors.generateTextFromMedia({
      provider,
      prompt: requiredPrompt(input),
      system: input.system,
      model: input.model,
      auth: input.auth,
      timeoutMs: input.timeoutMs,
      media: input.media,
    });
    return { provider, output, model: result.model, text: result.text, raw: result.raw };
  }

  if (output === 'image') {
    const result = await connectors.generateImage({
      provider,
      prompt: requiredPrompt(input),
      model: input.model,
      auth: input.auth,
      timeoutMs: input.timeoutMs,
      n: input.n,
      size: input.size,
      responseFormat: input.responseFormat,
    });
    return {
      provider,
      output,
      model: result.model,
      assets: result.images.map((image, index) => ({
        kind: 'image',
        filename: input.filename || `image-${index + 1}.png`,
        mimeType: 'image/png',
        url: image.url,
        b64Json: image.b64Json,
      })),
      raw: result.raw,
    };
  }

  if (output === 'video') {
    const result = await connectors.generateVideo({
      provider,
      prompt: requiredPrompt(input),
      model: input.model,
      auth: input.auth,
      timeoutMs: input.timeoutMs,
      pollIntervalMs: input.pollIntervalMs,
      waitForCompletion: input.waitForCompletion,
      duration: input.duration,
      aspectRatio: input.aspectRatio,
      resolution: input.resolution,
      image: input.image,
      referenceImages: input.referenceImages,
    });
    return {
      provider,
      output,
      model: result.model,
      asset: result.videoUrl
        ? { kind: 'video', filename: input.filename || 'video.mp4', mimeType: 'video/mp4', url: result.videoUrl }
        : undefined,
      raw: result.raw,
    };
  }

  if (output === 'audio' || output === 'speech') {
    const result = await connectors.generateSpeech({
      provider,
      text: input.content || input.prompt || '',
      model: input.model,
      auth: input.auth,
      timeoutMs: input.timeoutMs,
      voiceId: input.voiceId,
      language: input.language,
    });
    return {
      provider,
      output,
      asset: {
        kind: 'audio',
        filename: input.filename || 'speech.mp3',
        mimeType: result.contentType,
        bytes: result.audio,
      },
      raw: result.raw,
    };
  }

  if (output === 'upload') {
    const result = await connectors.uploadFile({
      provider,
      auth: input.auth,
      timeoutMs: input.timeoutMs,
      filePath: input.filePath,
      file: input.file,
      filename: input.filename,
      mimeType: input.mimeType,
      purpose: input.purpose,
    });
    return { provider, output, text: result.id, raw: result.raw };
  }

  if (output === 'transcribe') {
    const result = await connectors.transcribeAudio({
      provider,
      auth: input.auth,
      timeoutMs: input.timeoutMs,
      filePath: input.filePath,
      file: input.file,
      filename: input.filename,
      mimeType: input.mimeType,
      model: input.model,
      language: input.language,
    });
    return { provider, output, text: result.text, raw: result.raw };
  }

  return createDocumentResult(provider, output, await documentText(input, connectors, provider), input);
}

async function documentText(input: UseAIInput, connectors: ReturnType<typeof createAiConnectors>, provider: ProviderSlug): Promise<string> {
  if (input.rows?.length) return rowsToCsv(input.rows);
  if (input.content) return input.content;
  const result = await connectors.generateText({
    provider,
    prompt: documentPrompt(input),
    system: input.system,
    model: input.model,
    auth: input.auth,
    timeoutMs: input.timeoutMs,
    cwd: input.cwd,
  });
  return result.text;
}

function createDocumentResult(provider: ProviderSlug, output: UseAIOutput, text: string, input: UseAIInput): UseAIResult {
  if (output === 'csv') {
    return {
      provider,
      output,
      text,
      asset: textAsset('csv', input.filename || 'data.csv', 'text/csv; charset=utf-8', text),
    };
  }
  if (output === 'excel' || output === 'xlsx') {
    const html = tableHtmlFromCsv(text);
    return {
      provider,
      output,
      text,
      asset: textAsset('excel', input.filename || 'workbook.xls', 'application/vnd.ms-excel; charset=utf-8', html),
    };
  }
  if (output === 'doc' || output === 'docx') {
    const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>${paragraphHtml(text)}</body></html>`;
    return {
      provider,
      output,
      text,
      asset: textAsset('doc', input.filename || 'document.doc', 'application/msword; charset=utf-8', html),
    };
  }
  return {
    provider,
    output,
    text,
    asset: {
      kind: 'pdf',
      filename: input.filename || 'document.pdf',
      mimeType: 'application/pdf',
      bytes: buildSimplePdf(text),
    },
  };
}

async function useAIFromBrowser(input: UseAIInput): Promise<UseAIResult> {
  const endpoint = (input as UseAIInput & { endpoint?: string }).endpoint || '/api/ai/use';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'useAI', input }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || `useAI failed with HTTP ${response.status}`);
  return data;
}

function normalizeOutput(output: UseAIOutput | undefined): UseAIOutput {
  if (!output) return 'text';
  if (output === 'speech') return 'audio';
  return output;
}

function requiredPrompt(input: UseAIInput): string {
  const prompt = input.prompt || input.content || '';
  if (!prompt.trim()) throw new Error('prompt or content is required');
  return prompt;
}

function documentPrompt(input: UseAIInput): string {
  const prompt = input.prompt || '';
  if (!prompt.trim()) throw new Error('prompt, content, or rows is required for document generation');
  if (input.output === 'csv' || input.output === 'excel' || input.output === 'xlsx') {
    return `${prompt}\n\nReturn only valid CSV. Do not wrap it in markdown.`;
  }
  return prompt;
}

function rowsToCsv(rows: Array<Record<string, unknown>>): string {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => csvCell(row[header])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function textAsset(kind: GeneratedAsset['kind'], filename: string, mimeType: string, text: string): GeneratedAsset {
  return { kind, filename, mimeType, text, bytes: new TextEncoder().encode(text) };
}

function paragraphHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function tableHtmlFromCsv(csv: string): string {
  const rows = csv
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.split(',').map((cell) => `<td>${escapeHtml(cell.replace(/^"|"$/g, '').replace(/""/g, '"'))}</td>`));
  return `<!doctype html><html><head><meta charset="utf-8"></head><body><table>${rows
    .map((cells) => `<tr>${cells.join('')}</tr>`)
    .join('')}</table></body></html>`;
}

function buildSimplePdf(text: string): Uint8Array {
  const safeText = text
    .replace(/\r/g, '')
    .split('\n')
    .flatMap((line) => wrapLine(line, 86))
    .slice(0, 45)
    .map(escapePdfText);
  const content = ['BT', '/F1 11 Tf', '50 780 Td', '14 TL', ...safeText.map((line, index) => `${index === 0 ? '' : 'T* '}(${line}) Tj`), 'ET'].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

function wrapLine(line: string, width: number): string[] {
  if (!line) return [''];
  const output: string[] = [];
  let current = line;
  while (current.length > width) {
    output.push(current.slice(0, width));
    current = current.slice(width);
  }
  output.push(current);
  return output;
}

function escapePdfText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function isBrowserRuntime(): boolean {
  const global = globalThis as typeof globalThis & { window?: unknown; document?: unknown };
  return !!global.window && !!global.document;
}
