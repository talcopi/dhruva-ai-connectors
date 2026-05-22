import os from 'node:os';
import path from 'node:path';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { createAiConnectors } from '../src/create-ai-connectors.js';
import { SQLiteProviderStore } from '../src/storage/sqlite-store.js';
import { SQLiteSecretStore } from '../src/secrets/sqlite-secret-store.js';

describe('SQLiteProviderStore', () => {
  it('persists provider metadata', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'hru-ai-store-'));
    try {
      const store = new SQLiteProviderStore(path.join(dir, 'providers.sqlite'));
      await store.upsert({
        slug: 'grok',
        label: 'xAI Grok',
        vendor: 'xai',
        enabled: true,
        isDefault: true,
        authKind: 'api_key',
        transport: 'api',
        accountInfo: { defaultModel: 'grok-4.3' },
        keyPreview: 'xai-12...7890',
      });
      store.close();
      const next = new SQLiteProviderStore(path.join(dir, 'providers.sqlite'));
      expect(await next.get('grok')).toMatchObject({ slug: 'grok', keyPreview: 'xai-12...7890' });
      next.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('retrieves connected providers and deletes them on disconnect', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'dhruva-ai-connectors-'));
    try {
      const store = new SQLiteProviderStore(path.join(dir, 'providers.sqlite'));
      const connectors = createAiConnectors({
        cwd: dir,
        store,
        env: { ...process.env, XAI_API_KEY: 'xai-1234567890' },
      });

      const session = await connectors.connectProvider('grok', { authKind: 'api_key', setDefault: true });
      expect(session.status).toBe('connected');
      expect(await store.get('grok')).toMatchObject({ slug: 'grok', isDefault: true });

      const providers = await connectors.listProviders();
      expect(providers.find((provider) => provider.slug === 'grok')?.connected).toBe(true);

      const disconnected = await connectors.disconnectProvider('grok');
      expect(disconnected.removedMetadata).toBe(true);
      expect(await store.get('grok')).toBeNull();
      const providersAfterDisconnect = await connectors.listProviders();
      expect(providersAfterDisconnect.find((provider) => provider.slug === 'grok')?.connected).toBe(false);
      store.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('connects OAuth-token metadata without storing the raw token', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'dhruva-ai-oauth-'));
    try {
      const store = new SQLiteProviderStore(path.join(dir, 'providers.sqlite'));
      const connectors = createAiConnectors({ cwd: dir, store });

      const session = await connectors.connectProvider('claude', {
        authKind: 'oauth_token',
        oauthToken: 'claude-oauth-secret',
        setDefault: true,
      });
      expect(session.status).toBe('connected');

      const stored = await store.get('claude');
      expect(stored).toMatchObject({ slug: 'claude', authKind: 'oauth_token', isDefault: true });
      expect(JSON.stringify(stored)).not.toContain('claude-oauth-secret');
      store.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('deletes old provider credentials before reconnecting the same provider', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'dhruva-ai-reconnect-'));
    try {
      const dbPath = path.join(dir, 'providers.sqlite');
      const store = new SQLiteProviderStore(dbPath);
      const secretStore = new SQLiteSecretStore(dbPath, { encryptionKey: 'test-key' });
      const connectors = createAiConnectors({ cwd: dir, store, secretStore });

      const first = await connectors.connectProvider('claude', {
        authKind: 'oauth_token',
        oauthToken: 'old-claude-token',
      });
      expect(first.status).toBe('connected');
      await secretStore.set('provider:claude:api_key', 'old-extra-secret');
      const authHome = path.join(dir, '.hru-ai', 'claude');
      await mkdir(authHome, { recursive: true });
      await writeFile(path.join(authHome, '.credentials.json'), '{}');

      const second = await connectors.connectProvider('claude', {
        authKind: 'oauth_token',
        oauthToken: 'new-claude-token',
      });

      expect(second.status).toBe('connected');
      expect(await secretStore.get('provider:claude:oauth_token')).toBe('new-claude-token');
      expect(await secretStore.get('provider:claude:api_key')).toBeNull();
      await expect(access(authHome)).rejects.toThrow();
      store.close();
      secretStore.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('logs out one provider without deleting the whole sqlite database', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'dhruva-ai-logout-'));
    try {
      const dbPath = path.join(dir, 'providers.sqlite');
      const store = new SQLiteProviderStore(dbPath);
      const secretStore = new SQLiteSecretStore(dbPath, { encryptionKey: 'test-key' });
      const connectors = createAiConnectors({ cwd: dir, store, secretStore });
      await connectors.connectProvider('claude', { authKind: 'oauth_token', oauthToken: 'claude-secret' });
      const authHome = path.join(dir, '.hru-ai', 'claude');
      await mkdir(authHome, { recursive: true });
      await writeFile(path.join(authHome, '.credentials.json'), '{}');

      const result = await connectors.logoutProvider('claude');

      expect(result).toMatchObject({ provider: 'claude', ok: true, removedMetadata: true, removedAuthHome: true });
      expect(await store.get('claude')).toBeNull();
      expect(await secretStore.get('provider:claude:oauth_token')).toBeNull();
      await expect(access(authHome)).rejects.toThrow();
      await expect(access(dbPath)).resolves.toBeUndefined();
      store.close();
      secretStore.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
