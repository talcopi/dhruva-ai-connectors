import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import { ensurePrivateDir } from '../env.js';
import type { SecretStore } from '../types.js';

type SecretRow = {
  id: string;
  encrypted_value: string;
};

export class SQLiteSecretStore implements SecretStore {
  readonly dbPath: string;
  readonly keyPath: string;
  private readonly key: Buffer;
  private db: Database.Database | null = null;

  constructor(
    dbPath = path.join(process.cwd(), '.hru-ai', 'providers.sqlite'),
    options: { encryptionKey?: string; keyPath?: string } = {}
  ) {
    this.dbPath = path.resolve(dbPath);
    this.keyPath = path.resolve(options.keyPath || path.join(path.dirname(this.dbPath), 'secret.key'));
    this.key = resolveKey(options.encryptionKey || process.env.HRU_AI_SECRET_KEY || '', this.keyPath);
  }

  async set(id: string, value: string): Promise<void> {
    const db = await this.open();
    db.prepare(
      `INSERT INTO credentials (id, encrypted_value)
       VALUES (?, ?)
       ON CONFLICT(id) DO UPDATE SET
         encrypted_value = excluded.encrypted_value,
         updated_at = CURRENT_TIMESTAMP`
    ).run(id, this.encrypt(value));
  }

  async get(id: string): Promise<string | null> {
    const db = await this.open();
    const row = db.prepare('SELECT id, encrypted_value FROM credentials WHERE id = ?').get(id) as SecretRow | undefined;
    return row ? this.decrypt(row.encrypted_value) : null;
  }

  async delete(id: string): Promise<void> {
    const db = await this.open();
    db.prepare('DELETE FROM credentials WHERE id = ?').run(id);
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
      CREATE TABLE IF NOT EXISTS credentials (
        id TEXT PRIMARY KEY,
        encrypted_value TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await setPrivateMode(this.dbPath);
    return this.db;
  }

  private encrypt(value: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  private decrypt(value: string): string {
    const [, iv64, tag64, encrypted64] = value.split(':');
    if (!iv64 || !tag64 || !encrypted64) throw new Error('Invalid encrypted credential payload');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv64, 'base64'));
    decipher.setAuthTag(Buffer.from(tag64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(encrypted64, 'base64')), decipher.final()]).toString('utf8');
  }
}

function resolveKey(encryptionKey: string, keyPath: string): Buffer {
  if (encryptionKey) return crypto.createHash('sha256').update(encryptionKey).digest();
  if (fs.existsSync(keyPath)) {
    return crypto.createHash('sha256').update(fs.readFileSync(keyPath, 'utf8').trim()).digest();
  }
  fs.mkdirSync(path.dirname(keyPath), { recursive: true, mode: 0o700 });
  const generated = crypto.randomBytes(32).toString('base64');
  fs.writeFileSync(keyPath, `${generated}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(keyPath, 0o600);
  } catch {
    // Best effort on non-POSIX filesystems.
  }
  return crypto.createHash('sha256').update(generated).digest();
}

async function setPrivateMode(filePath: string): Promise<void> {
  try {
    await fsp.chmod(filePath, 0o600);
  } catch {
    // Best effort on non-POSIX filesystems.
  }
}

