import { createAiConnectors } from '../create-ai-connectors.js';
import type { ConnectProviderOptions } from '../types.js';

export function connectGemini(options?: ConnectProviderOptions) {
  return createAiConnectors().connectProvider('gemini', options);
}
