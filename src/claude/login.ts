import { createAiConnectors } from '../create-ai-connectors.js';
import type { ConnectProviderOptions } from '../types.js';

export function connectClaude(options?: ConnectProviderOptions) {
  return createAiConnectors().connectProvider('claude', options);
}
