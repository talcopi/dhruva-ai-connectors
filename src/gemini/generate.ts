import { buildPrompt, extractTextFromKnownJson, normalizePrompt, parseJsonMaybe } from '../generate-text.js';
import { ProviderGenerationError, ProviderNotConnectedError, ProviderNotInstalledError } from '../errors.js';
import { modelFromEnv } from '../env.js';
import { PROVIDERS } from '../providers.js';
import { runExecutable } from '../process/run-cli.js';
import { sanitizeOutput } from '../process/sanitize-output.js';
import { runtimeProviderStatus } from '../runtime.js';
import { geminiCliEnv } from './utils.js';
import { readGeminiStatus } from './status.js';
import type { GenerateTextInput, GenerateTextResult } from '../types.js';

export async function generateGeminiText(input: GenerateTextInput): Promise<GenerateTextResult> {
  normalizePrompt(input);
  const runtime = runtimeProviderStatus('gemini', input.cwd || process.cwd());
  if (!runtime.installed) throw new ProviderNotInstalledError('gemini', PROVIDERS.gemini.binary);
  if (!runtime.authConfigured && !input.auth?.apiKey) {
    throw new ProviderNotConnectedError('gemini', 'Gemini is not connected. Run `npx hru-ai login gemini` or set GEMINI_API_KEY.');
  }

  const model = input.model || modelFromEnv('gemini', PROVIDERS.gemini.defaultModel);
  const prompt = buildPrompt(input, 'Answer the user. Do not modify files.');
  const result = await runExecutable(
    'gemini',
    ['--prompt', prompt, '--output-format', 'json', '--model', model, '--approval-mode', 'plan', '--skip-trust'],
    {
      cwd: input.cwd,
      env: geminiCliEnv({
        GEMINI_API_KEY: input.auth?.apiKey || process.env.GEMINI_API_KEY,
      }),
      timeoutMs: input.timeoutMs ?? 120000,
    }
  );

  if (result.timedOut) throw new ProviderGenerationError('gemini', 'Gemini generation timed out');
  if (!result.ok) {
    const jsonError = parseJsonMaybe(result.stdout);
    throw new ProviderGenerationError(
      'gemini',
      sanitizeOutput(jsonError?.error?.message || result.stderr || result.stdout || 'Gemini generation failed')
    );
  }

  const json = parseJsonMaybe(result.stdout);
  const text = extractTextFromKnownJson(json) || result.stdout.trim();
  const status = await readGeminiStatus().catch(() => null);
  return {
    provider: 'gemini',
    transport: 'cli',
    model,
    text: text.trim(),
    raw: json || undefined,
    account: {
      cliPackage: runtime.packageName || '',
      cliVersion: runtime.packageVersion || '',
      cliHome: runtime.authHome,
      defaultModel: model,
      providerAuthMode: status?.authMethod || '',
    },
  };
}
