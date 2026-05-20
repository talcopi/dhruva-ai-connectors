import fsp from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import { ensurePrivateDir } from '../env.js';
import type { ProviderSlug, ProviderStore, StoredProvider } from '../types.js';

type ProviderRow = {
  slug: ProviderSlug;
  label: string;
  vendor: string;
  enabled: number;
  is_default: number;
  auth_kind: StoredProvider['authKind'];
  transport: StoredProvider['transport'];
  account_info: string;
  key_preview: string | null;
  encrypted_secret_ref: string | null;
  default_model: string | null;
  connected_at: string | null;
  last_used_at: string | null;
  last_error: string | null;
};

export class SQLiteProviderStore implements ProviderStore {
  readonly dbPath: string;
  private db: Database.Database | null = null;

  constructor(dbPath = path.join(process.cwd(), '.hru-ai', 'providers.sqlite')) {
    this.dbPath = path.resolve(dbPath);
  }

  async list(): Promise<StoredProvider[]> {
    const db = await this.open();
    const rows = db.prepare('SELECT * FROM providers ORDER BY slug ASC').all() as ProviderRow[];
    return rows.map(rowToProvider);
  }

  async get(slug: ProviderSlug): Promise<StoredProvider | null> {
    const db = await this.open();
    const row = db.prepare('SELECT * FROM providers WHERE slug = ?').get(slug) as ProviderRow | undefined;
    return row ? rowToProvider(row) : null;
  }

  async upsert(provider: StoredProvider): Promise<StoredProvider> {
    const db = await this.open();
    db.prepare(`
      INSERT INTO providers (
        slug,
        label,
        vendor,
        enabled,
        is_default,
        auth_kind,
        transport,
        account_info,
        key_preview,
        encrypted_secret_ref,
        default_model,
        connected_at,
        last_used_at,
        last_error
      ) VALUES (
        @slug,
        @label,
        @vendor,
        @enabled,
        @is_default,
        @auth_kind,
        @transport,
        @account_info,
        @key_preview,
        @encrypted_secret_ref,
        @default_model,
        @connected_at,
        @last_used_at,
        @last_error
      )
      ON CONFLICT(slug) DO UPDATE SET
        label = excluded.label,
        vendor = excluded.vendor,
        enabled = excluded.enabled,
        is_default = excluded.is_default,
        auth_kind = excluded.auth_kind,
        transport = excluded.transport,
        account_info = excluded.account_info,
        key_preview = excluded.key_preview,
        encrypted_secret_ref = excluded.encrypted_secret_ref,
        default_model = excluded.default_model,
        connected_at = excluded.connected_at,
        last_used_at = excluded.last_used_at,
        last_error = excluded.last_error
    `).run(providerToParams(provider));
    return provider;
  }

  async delete(slug: ProviderSlug): Promise<void> {
    const db = await this.open();
    db.prepare('DELETE FROM providers WHERE slug = ?').run(slug);
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }

  private async open(): Promise<Database.Database> {
    if (this.db) return this.db;
    await ensurePrivateDir(path.dirname(this.dbPath));
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS providers (
        slug TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        vendor TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        is_default INTEGER NOT NULL DEFAULT 0,
        auth_kind TEXT NOT NULL,
        transport TEXT NOT NULL,
        account_info TEXT NOT NULL DEFAULT '{}',
        key_preview TEXT,
        encrypted_secret_ref TEXT,
        default_model TEXT,
        connected_at TEXT,
        last_used_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TRIGGER IF NOT EXISTS providers_updated_at
      AFTER UPDATE ON providers
      FOR EACH ROW
      BEGIN
        UPDATE providers SET updated_at = CURRENT_TIMESTAMP WHERE slug = OLD.slug;
      END;
    `);
    await setPrivateMode(this.dbPath);
    return this.db;
  }
}

function providerToParams(provider: StoredProvider) {
  return {
    slug: provider.slug,
    label: provider.label,
    vendor: provider.vendor,
    enabled: provider.enabled === false ? 0 : 1,
    is_default: provider.isDefault ? 1 : 0,
    auth_kind: provider.authKind,
    transport: provider.transport,
    account_info: JSON.stringify(provider.accountInfo || {}),
    key_preview: provider.keyPreview || null,
    encrypted_secret_ref: provider.encryptedSecretRef || null,
    default_model: provider.defaultModel || null,
    connected_at: provider.connectedAt || null,
    last_used_at: provider.lastUsedAt || null,
    last_error: provider.lastError || null,
  };
}

function rowToProvider(row: ProviderRow): StoredProvider {
  return {
    slug: row.slug,
    label: row.label,
    vendor: row.vendor,
    enabled: row.enabled !== 0,
    isDefault: row.is_default === 1,
    authKind: row.auth_kind,
    transport: row.transport,
    accountInfo: parseAccountInfo(row.account_info),
    keyPreview: row.key_preview || undefined,
    encryptedSecretRef: row.encrypted_secret_ref || undefined,
    defaultModel: row.default_model || undefined,
    connectedAt: row.connected_at || undefined,
    lastUsedAt: row.last_used_at || undefined,
    lastError: row.last_error || undefined,
  };
}

function parseAccountInfo(value: string) {
  try {
    return JSON.parse(value || '{}');
  } catch {
    return {};
  }
}

async function setPrivateMode(filePath: string): Promise<void> {
  try {
    await fsp.chmod(filePath, 0o600);
  } catch {
    // Best effort on non-POSIX filesystems.
  }
}
