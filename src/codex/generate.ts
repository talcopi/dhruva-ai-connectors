import { buildPrompt, normalizePrompt } from '../generate-text.js';
import { ProviderGenerationError, ProviderNotConnectedError, ProviderNotInstalledError } from '../errors.js';
import { modelFromEnv } from '../env.js';
import { PROVIDERS } from '../providers.js';
import { runExecutable } from '../process/run-cli.js';
import { sanitizeOutput } from '../process/sanitize-output.js';
import { runtimeProviderStatus } from '../runtime.js';
import { codexCliEnv } from './utils.js';
import type { GenerateTextInput, GenerateTextResult } from '../types.js';

export async function generateCodexText(input: GenerateTextInput): Promise<GenerateTextResult> {
  normalizePrompt(input);
  const runtime = runtimeProviderStatus('codex', input.cwd || process.cwd());
  if (!runtime.installed) throw new ProviderNotInstalledError('codex', PROVIDERS.codex.binary);
  if (!runtime.authConfigured && !input.auth?.apiKey) {
    throw new ProviderNotConnectedError('codex', 'Codex is not connected. Run `npx hru-ai login codex` or set OPENAI_API_KEY.');
  }

  const model = input.model || modelFromEnv('codex', PROVIDERS.codex.defaultModel);
  const prompt = buildPrompt(input, 'Answer the user. Do not modify files.');
  const result = await runExecutable(
    'codex',
    ['exec', '--sandbox', 'read-only', '--approval-policy', 'never', '--model', model, prompt],
    {
      cwd: input.cwd,
      env: codexCliEnv({ OPENAI_API_KEY: input.auth?.apiKey || process.env.OPENAI_API_KEY }),
      timeoutMs: input.timeoutMs ?? 120000,
    }
  );

  if (result.timedOut) throw new ProviderGenerationError('codex', 'Codex generation timed out');
  if (!result.ok) {
    throw new ProviderGenerationError('codex', sanitizeOutput(result.stderr || result.stdout || 'Codex generation failed'));
  }

  return {
    provider: 'codex',
    transport: 'cli',
    model,
    text: result.stdout.trim(),
    account: {
      cliPackage: runtime.packageName || '',
      cliVersion: runtime.packageVersion || '',
      cliHome: runtime.authHome,
      defaultModel: model,
    },
  };
}
