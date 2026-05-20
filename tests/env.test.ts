import { describe, expect, it } from 'vitest';
import { keyPreview, redactEnv, sanitizedCliEnv } from '../src/env.js';

describe('env helpers', () => {
  it('redacts secret-like values', () => {
    const redacted = redactEnv({
      XAI_API_KEY: 'xai-secret',
      NORMAL_VALUE: 'visible',
      DATABASE_URL: 'sqlite:///tmp/example.db',
    });
    expect(redacted.XAI_API_KEY).toBe('[REDACTED]');
    expect(redacted.DATABASE_URL).toBe('[REDACTED]');
    expect(redacted.NORMAL_VALUE).toBe('visible');
  });

  it('keeps cli env allowlisted', () => {
    const env = sanitizedCliEnv({ PATH: '/bin', XAI_API_KEY: 'secret' }, { XAI_API_KEY: 'secret' });
    expect(env.PATH).toBe('/bin');
    expect(env.XAI_API_KEY).toBe('secret');
  });

  it('creates short key previews', () => {
    expect(keyPreview('xai-1234567890')).toBe('xai-12...7890');
  });
});
