import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileExists, writePrivateFile } from '../env.js';
import type { SecretStore } from '../types.js';

type SecretFile = {
  version: 1;
  secrets: Record<string, string>;
};

export class EncryptedFileSecretStore implements SecretStore {
  private readonly key: Buffer;

  constructor(
    private readonly filePath = path.join(process.cwd(), '.hru-ai', 'secrets.json'),
    encryptionKey = process.env.HRU_AI_SECRET_KEY || ''
  ) {
    if (!encryptionKey) throw new Error('HRU_AI_SECRET_KEY is required for EncryptedFileSecretStore');
    this.key = crypto.createHash('sha256').update(encryptionKey).digest();
  }

  async set(id: string, value: string): Promise<void> {
    const file = await this.read();
    file.secrets[id] = this.encrypt(value);
    await writePrivateFile(this.filePath, `${JSON.stringify(file, null, 2)}\n`);
  }

  async get(id: string): Promise<string | null> {
    const encrypted = (await this.read()).secrets[id];
    return encrypted ? this.decrypt(encrypted) : null;
  }

  async delete(id: string): Promise<void> {
    const file = await this.read();
    delete file.secrets[id];
    await writePrivateFile(this.filePath, `${JSON.stringify(file, null, 2)}\n`);
  }

  private async read(): Promise<SecretFile> {
    if (!fileExists(this.filePath)) return { version: 1, secrets: {} };
    try {
      const parsed = JSON.parse(await fsp.readFile(this.filePath, 'utf8')) as SecretFile;
      return { version: 1, secrets: parsed.secrets || {} };
    } catch {
      return { version: 1, secrets: {} };
    }
  }

  private encrypt(value: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
  }

  private decrypt(value: string): string {
    const raw = Buffer.from(value, 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const encrypted = raw.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }
}
