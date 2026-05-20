#!/usr/bin/env node
import { createAiConnectors } from '../src/create-ai-connectors.js';
import { AiConnectorError } from '../src/errors.js';
import { isProviderSlug, PROVIDER_SLUGS } from '../src/providers.js';
import type { ProviderSlug } from '../src/types.js';

const connectors = createAiConnectors();

function usage() {
  console.log(`hru-ai

Commands:
  hru-ai status
  hru-ai providers
  hru-ai login <codex|claude|gemini|grok>
  hru-ai ask <codex|claude|gemini|grok> <prompt>
  hru-ai logout <codex|claude|gemini|grok>
  hru-ai doctor <codex|claude|gemini|grok>
`);
}

function requireProvider(value = ''): ProviderSlug {
  if (isProviderSlug(value)) return value;
  throw new Error(`Unknown provider "${value}". Use one of: ${PROVIDER_SLUGS.join(', ')}`);
}

async function main() {
  const [command, providerArg, ...rest] = process.argv.slice(2);
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    usage();
    return;
  }

  if (command === 'status' || command === 'providers') {
    const data = command === 'status' ? await connectors.runtimeStatus() : await connectors.listProviders();
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (command === 'doctor') {
    const provider = requireProvider(providerArg);
    const status = (await connectors.runtimeStatus())[provider];
    console.log(JSON.stringify(status, null, 2));
    if (provider === 'grok' && !status.installed) {
      console.log('\nGrok Build CLI docs: https://docs.x.ai/build/overview');
      console.log('Server mode can still work with XAI_API_KEY.');
    }
    return;
  }

  if (command === 'login') {
    const provider = requireProvider(providerArg);
    const useApiKey = provider === 'grok' && !!(process.env.XAI_API_KEY || process.env.GROK_CODE_XAI_API_KEY);
    const session = await connectors.connectProvider(provider, {
      authKind: useApiKey ? 'api_key' : undefined,
      interactive: !useApiKey,
      setDefault: true,
    });
    console.log(JSON.stringify(session, null, 2));
    return;
  }

  if (command === 'logout') {
    const provider = requireProvider(providerArg);
    console.log(JSON.stringify(await connectors.disconnectProvider(provider), null, 2));
    return;
  }

  if (command === 'ask') {
    const provider = requireProvider(providerArg);
    const prompt = rest.join(' ').trim();
    if (!prompt) throw new Error('Prompt is required');
    const result = await connectors.generateText({ provider, prompt });
    console.log(result.text);
    return;
  }

  usage();
}

main().catch((error) => {
  if (error instanceof AiConnectorError) {
    console.error(`${error.code}: ${error.message}`);
  } else {
    console.error(error instanceof Error ? error.message : String(error));
  }
  process.exitCode = 1;
});
