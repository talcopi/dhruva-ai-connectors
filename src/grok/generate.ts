import { generateGrokApiText } from './generate-api.js';
import { generateGrokCliText } from './generate-cli.js';
import { runtimeProviderStatus } from '../runtime.js';
import type { GenerateTextInput, GenerateTextResult } from '../types.js';

export async function generateGrokText(input: GenerateTextInput): Promise<GenerateTextResult> {
  const wantsCli = input.transport === 'cli' || input.auth?.kind === 'cli_browser';
  const runtime = runtimeProviderStatus('grok', input.cwd || process.cwd());
  const apiKey = input.auth?.apiKey || process.env.XAI_API_KEY || '';

  if (!wantsCli && apiKey) {
    return generateGrokApiText(input);
  }
  if (wantsCli || runtime.installed) {
    return generateGrokCliText(input);
  }
  return generateGrokApiText(input);
}
