import { generateGrokText } from '@dhruva/ai-connectors/grok';

const result = await generateGrokText({
  auth: { kind: 'api_key', apiKey: process.env.XAI_API_KEY },
  prompt: 'Create a short WhatsApp promo message.',
});

console.log(result.text);
