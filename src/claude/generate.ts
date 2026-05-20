import { buildPrompt, extractTextFromKnownJson, normalizePrompt, parseJsonMaybe } from '../generate-text.js';
import { ProviderGenerationError, ProviderNotConnectedError, ProviderNotInstalledError } from '../errors.js';
import { modelFromEnv } from '../env.js';
import { PROVIDERS } from '../providers.js';
import { runExecutable } from '../process/run-cli.js';
import { sanitizeOutput } from '../process/sanitize-output.js';
import { runtimeProviderStatus } from '../runtime.js';
import { claudeCliEnv } from './utils.js';
import { readClaudeStatus } from './status.js';
import type { GenerateTextInput, GenerateTextResult } from '../types.js';

export async function generateClaudeText(input: GenerateTextInput): Promise<GenerateTextResult> {
  normalizePrompt(input);
  const runtime = runtimeProviderStatus('claude', input.cwd || process.cwd());
  if (!runtime.installed) throw new ProviderNotInstalledError('claude', PROVIDERS.claude.binary);
  if (!runtime.authConfigured && !input.auth?.apiKey && !input.auth?.oauthToken) {
    throw new ProviderNotConnectedError(
      'claude',
      'Claude is not connected. Run `npx hru-ai login claude` or set CLAUDE_CODE_OAUTH_TOKEN / ANTHROPIC_API_KEY.'
    );
  }

  const model = input.model || modelFromEnv('claude', PROVIDERS.claude.defaultModel);
  const prompt = buildPrompt(input, 'Answer the user. Do not modify files.');
  const result = await runExecutable(
    'claude',
    [
      '-p',
      prompt,
      '--output-format',
      'json',
      '--model',
      model,
      '--permission-mode',
      'plan',
      '--tools',
      '',
      '--no-session-persistence',
      '--setting-sources',
      'user',
    ],
    {
      cwd: input.cwd,
      env: claudeCliEnv({
        CLAUDE_CODE_OAUTH_TOKEN: input.auth?.oauthToken || process.env.CLAUDE_CODE_OAUTH_TOKEN,
        ANTHROPIC_API_KEY: input.auth?.apiKey || process.env.ANTHROPIC_API_KEY,
      }),
      timeoutMs: input.timeoutMs ?? 120000,
    }
  );

  if (result.timedOut) throw new ProviderGenerationError('claude', 'Claude generation timed out');
  if (!result.ok) {
    throw new ProviderGenerationError('claude', sanitizeOutput(result.stderr || result.stdout || 'Claude generation failed'));
  }

  const json = parseJsonMaybe(result.stdout);
  const text = extractTextFromKnownJson(json) || result.stdout.trim();
  const status = await readClaudeStatus().catch(() => null);
  return {
    provider: 'claude',
    transport: 'cli',
    model,
    text: text.trim(),
    raw: json || undefined,
    account: {
      email: status?.email || '',
      organization: status?.orgName || status?.organization || '',
      planType: status?.subscriptionType || status?.planType || '',
      cliPackage: runtime.packageName || '',
      cliVersion: runtime.packageVersion || '',
      cliHome: runtime.authHome,
      defaultModel: model,
    },
  };
}
