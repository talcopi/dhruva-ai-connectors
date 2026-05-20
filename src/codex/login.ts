import { createAiConnectors } from '../create-ai-connectors.js';
import type { ConnectProviderOptions } from '../types.js';

export function connectCodex(options?: ConnectProviderOptions) {
  return createAiConnectors().connectProvider('codex', options);
}
