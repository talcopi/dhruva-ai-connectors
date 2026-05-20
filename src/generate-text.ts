import { PROVIDERS } from './providers.js';
import { generateCodexText } from './codex/generate.js';
import { generateClaudeText } from './claude/generate.js';
import { generateGeminiText } from './gemini/generate.js';
import { generateGrokText } from './grok/generate.js';
import type { GenerateTextInput, GenerateTextResult, ProviderSlug } from './types.js';

export async function generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
  const provider = (input.provider || 'codex') as ProviderSlug;
  if (!PROVIDERS[provider]) throw new Error(`Unknown provider: ${provider}`);

  if (provider === 'codex') return generateCodexText({ ...input, provider });
  if (provider === 'claude') return generateClaudeText({ ...input, provider });
  if (provider === 'gemini') return generateGeminiText({ ...input, provider });
  return generateGrokText({ ...input, provider });
}

export function buildPrompt(input: GenerateTextInput, fallbackSystem: string): string {
  const system = input.system || fallbackSystem;
  return [system, '', String(input.prompt || '')].filter(Boolean).join('\n');
}

export function normalizePrompt(input: GenerateTextInput): void {
  if (!input.prompt || !String(input.prompt).trim()) {
    throw new Error('Prompt is required');
  }
}

export function parseJsonMaybe(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function extractTextFromKnownJson(json: any): string {
  if (!json) return '';
  if (typeof json === 'string') return json;
  if (typeof json.text === 'string') return json.text;
  if (typeof json.result === 'string') return json.result;
  if (typeof json.response === 'string') return json.response;
  if (typeof json.output_text === 'string') return json.output_text;
  if (Array.isArray(json.output)) {
    return json.output
      .flatMap((item: any) => item?.content || [])
      .map((part: any) => part?.text || part?.content || '')
      .filter(Boolean)
      .join('');
  }
  if (Array.isArray(json.message?.content)) {
    return json.message.content.map((part: any) => part?.text || '').join('');
  }
  return '';
}
