import type { SecretStore } from '../types.js';

export class EnvSecretStore implements SecretStore {
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  async set(_id: string, _value: string): Promise<void> {
    throw new Error('EnvSecretStore is read-only');
  }

  async get(id: string): Promise<string | null> {
    return this.env[id] || null;
  }

  async delete(_id: string): Promise<void> {
    throw new Error('EnvSecretStore is read-only');
  }
}
