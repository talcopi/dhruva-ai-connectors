import { runtimeStatus, generateText } from '@dhruvaaignited/ai-connectors';

console.log(await runtimeStatus());

const result = await generateText({
  provider: 'grok',
  auth: { kind: 'api_key', apiKey: process.env.XAI_API_KEY },
  prompt: 'Say hello in one sentence.',
});

console.log(result.text);
