import { createAiConnectors } from '../create-ai-connectors.js';
import type { ConnectProviderOptions } from '../types.js';

export function connectGrok(options?: ConnectProviderOptions) {
  return createAiConnectors().connectProvider('grok', options);
}
