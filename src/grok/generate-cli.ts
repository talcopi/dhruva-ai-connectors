import { extractTextFromKnownJson, normalizePrompt, parseJsonMaybe } from '../generate-text.js';
import { ProviderGenerationError, ProviderNotConnectedError, ProviderNotInstalledError } from '../errors.js';
import { modelFromEnv } from '../env.js';
import { PROVIDERS } from '../providers.js';
import { runExecutable } from '../process/run-cli.js';
import { sanitizeOutput } from '../process/sanitize-output.js';
import { runtimeProviderStatus } from '../runtime.js';
import { grokCliEnv } from './utils.js';
import { buildGrokPrompt } from './generate-api.js';
import type { GenerateTextInput, GenerateTextResult } from '../types.js';

export async function generateGrokCliText(input: GenerateTextInput): Promise<GenerateTextResult> {
  normalizePrompt(input);
  const runtime = runtimeProviderStatus('grok', input.cwd || process.cwd());
  if (!runtime.installed) throw new ProviderNotInstalledError('grok', PROVIDERS.grok.binary);
  if (!runtime.authConfigured && !process.env.GROK_CODE_XAI_API_KEY && !input.auth?.apiKey) {
    throw new ProviderNotConnectedError('grok', 'Grok CLI is not connected. Run `grok` login or set GROK_CODE_XAI_API_KEY.');
  }

  const model = input.model || modelFromEnv('grok', PROVIDERS.grok.defaultModel);
  const prompt = buildGrokPrompt(input);
  const result = await runExecutable('grok', ['-p', prompt, '-m', model, '--output-format', 'json'], {
    cwd: input.cwd,
    env: grokCliEnv({
      GROK_CODE_XAI_API_KEY: input.auth?.apiKey || process.env.GROK_CODE_XAI_API_KEY,
      XAI_API_KEY: input.auth?.apiKey || process.env.XAI_API_KEY,
    }),
    timeoutMs: input.timeoutMs ?? 120000,
  });

  if (result.timedOut) throw new ProviderGenerationError('grok', 'Grok CLI generation timed out');
  if (!result.ok) {
    throw new ProviderGenerationError('grok', sanitizeOutput(result.stderr || result.stdout || 'Grok CLI generation failed'));
  }

  const json = parseJsonMaybe(result.stdout);
  const text = extractTextFromKnownJson(json) || result.stdout.trim();
  return {
    provider: 'grok',
    transport: 'cli',
    model,
    text: text.trim(),
    raw: json || undefined,
    account: {
      cliHome: runtime.authHome,
      defaultModel: model,
      providerAuthMode: runtime.configuredAuthKinds[0] || 'cli_browser',
    },
  };
}
