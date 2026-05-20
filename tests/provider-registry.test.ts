import { describe, expect, it } from 'vitest';
import { PROVIDERS, PROVIDER_SLUGS } from '../src/providers.js';

describe('provider registry', () => {
  it('contains the four supported providers', () => {
    expect(PROVIDER_SLUGS).toEqual(['codex', 'claude', 'gemini', 'grok']);
    expect(PROVIDERS.grok.defaultModel).toBe('grok-4.3');
    expect(PROVIDERS.codex.binary).toBe('codex');
  });
});
