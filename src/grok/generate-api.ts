import { buildPrompt, extractTextFromKnownJson, normalizePrompt } from '../generate-text.js';
import { ProviderGenerationError, ProviderNotConnectedError } from '../errors.js';
import { modelFromEnv } from '../env.js';
import { PROVIDERS } from '../providers.js';
import { sanitizeOutput } from '../process/sanitize-output.js';
import type { GenerateTextInput, GenerateTextResult } from '../types.js';

export async function generateGrokApiText(input: GenerateTextInput): Promise<GenerateTextResult> {
  normalizePrompt(input);
  const apiKey = input.auth?.apiKey || process.env.XAI_API_KEY;
  if (!apiKey) throw new ProviderNotConnectedError('grok', 'Set XAI_API_KEY or pass auth.apiKey for Grok API mode.');

  const model = input.model || modelFromEnv('grok', PROVIDERS.grok.defaultModel);
  const baseUrl = (process.env.XAI_BASE_URL || 'https://api.x.ai/v1').replace(/\/$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 120000);

  try {
    const response = await fetch(`${baseUrl}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'system',
            content: input.system || 'Answer the user clearly and concisely.',
          },
          {
            role: 'user',
            content: String(input.prompt),
          },
        ],
      }),
      signal: controller.signal,
    });

    const rawText = await response.text();
    const json = rawText ? JSON.parse(rawText) : null;
    if (!response.ok) {
      throw new ProviderGenerationError(
        'grok',
        sanitizeOutput(json?.error?.message || json?.message || rawText || `Grok API failed with HTTP ${response.status}`)
      );
    }

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
  } catch (error) {
    if (error instanceof ProviderGenerationError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new ProviderGenerationError('grok', sanitizeOutput(message), error);
  } finally {
    clearTimeout(timeout);
  }
}

export function buildGrokPrompt(input: GenerateTextInput): string {
  return buildPrompt(input, 'Answer the user clearly and concisely.');
}
