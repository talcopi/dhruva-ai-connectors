import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ensureGeminiConfigDir, keyPreview, redactEnv, sanitizedCliEnv } from '../src/env.js';
import { geminiCliEnv } from '../src/gemini/utils.js';

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

  it('preseeds Gemini OAuth settings without external setup', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hru-gemini-env-'));
    try {
      const configDir = await ensureGeminiConfigDir(dir, {});
      const settings = JSON.parse(await fs.readFile(path.join(configDir, 'settings.json'), 'utf8'));
      expect(settings.security.auth.selectedType).toBe('oauth-personal');
      expect(settings.ide.enabled).toBe(false);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('runs Gemini CLI against the package-managed OAuth store', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hru-gemini-cli-env-'));
    try {
      const env = geminiCliEnv({
        cwd: dir,
        env: { PATH: '/bin', HOME: '/tmp/home' },
        extra: { GEMINI_API_KEY: 'test-key' },
      });
      expect(env.GEMINI_CLI_HOME).toBe(path.join(dir, '.hru-ai', 'gemini'));
      expect(env.GEMINI_FORCE_FILE_STORAGE).toBe('true');
      expect(env.GEMINI_FORCE_ENCRYPTED_FILE_STORAGE).toBe('true');
      expect(env.GEMINI_API_KEY).toBe('test-key');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
