import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { connectAI, normalizeProvider, useAI } from '../src/index.js';
import { SQLiteProviderStore } from '../src/storage/sqlite-store.js';
import { SQLiteSecretStore } from '../src/secrets/sqlite-secret-store.js';

describe('high-level API', () => {
  it('accepts vendor aliases for the four supported providers', () => {
    expect(normalizeProvider('codex')).toBe('codex');
    expect(normalizeProvider('anthropic')).toBe('claude');
    expect(normalizeProvider('google')).toBe('gemini');
    expect(normalizeProvider('grok')).toBe('grok');
  });

  it('connectAI stores API credentials encrypted in SQLite', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'hru-ai-connectai-'));
    try {
      const dbPath = path.join(dir, 'providers.sqlite');
      const store = new SQLiteProviderStore(dbPath);
      const secretStore = new SQLiteSecretStore(dbPath, { encryptionKey: 'test-key' });

      const result = await connectAI({
        provider: 'grok',
        authKind: 'api_key',
        apiKey: 'xai-test-secret',
        setDefault: true,
        cwd: dir,
        store,
        secretStore,
      });

      expect(result).toMatchObject({ provider: 'grok', status: 'connected', connected: true, stored: true });
      const stored = await store.get('grok');
      expect(stored?.encryptedSecretRef).toBe('provider:grok:api_key');
      expect(JSON.stringify(stored)).not.toContain('xai-test-secret');
      expect(await secretStore.get('provider:grok:api_key')).toBe('xai-test-secret');
      store.close();
      secretStore.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('connectAI uses Grok API mode automatically when XAI_API_KEY is configured', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'hru-ai-grok-env-'));
    try {
      const dbPath = path.join(dir, 'providers.sqlite');
      const store = new SQLiteProviderStore(dbPath);
      const secretStore = new SQLiteSecretStore(dbPath, { encryptionKey: 'test-key' });

      const result = await connectAI({
        provider: 'grok',
        setDefault: true,
        cwd: dir,
        env: { XAI_API_KEY: 'xai-env-secret' },
        store,
        secretStore,
      });

      expect(result).toMatchObject({ provider: 'grok', status: 'connected', authKind: 'api_key', connected: true });
      expect(await secretStore.get('provider:grok:api_key')).toBe('xai-env-secret');
      store.close();
      secretStore.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('useAI creates CSV and PDF assets without provider calls when local content is supplied', async () => {
    const csv = await useAI({
      provider: 'codex',
      output: 'csv',
      rows: [
        { name: 'Asha', score: 10 },
        { name: 'Ravi', score: 12 },
      ],
    });
    expect(csv.asset?.filename).toBe('data.csv');
    expect(csv.asset?.text).toContain('name,score');

    const pdf = await useAI({
      provider: 'google',
      output: 'pdf',
      content: 'Hello PDF',
    });
    expect(Buffer.from(pdf.asset?.bytes || []).toString('utf8').startsWith('%PDF-1.4')).toBe(true);
  });
});
