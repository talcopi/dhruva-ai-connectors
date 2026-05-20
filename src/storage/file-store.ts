import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileExists, writePrivateFile } from '../env.js';
import type { ProviderSlug, ProviderStore, StoredProvider } from '../types.js';

type StoreFile = {
  version: 1;
  providers: StoredProvider[];
};

export class FileProviderStore implements ProviderStore {
  readonly filePath: string;

  constructor(filePath = path.join(process.cwd(), '.hru-ai', 'providers.json')) {
    this.filePath = path.resolve(filePath);
  }

  async list(): Promise<StoredProvider[]> {
    return (await this.read()).providers;
  }

  async get(slug: ProviderSlug): Promise<StoredProvider | null> {
    return (await this.list()).find((provider) => provider.slug === slug) || null;
  }

  async upsert(provider: StoredProvider): Promise<StoredProvider> {
    const file = await this.read();
    const index = file.providers.findIndex((record) => record.slug === provider.slug);
    if (index >= 0) file.providers[index] = provider;
    else file.providers.push(provider);
    await this.write(file);
    return provider;
  }

  async delete(slug: ProviderSlug): Promise<void> {
    const file = await this.read();
    file.providers = file.providers.filter((provider) => provider.slug !== slug);
    await this.write(file);
  }

  private async read(): Promise<StoreFile> {
    if (!fileExists(this.filePath)) return { version: 1, providers: [] };
    try {
      const parsed = JSON.parse(await fsp.readFile(this.filePath, 'utf8')) as StoreFile;
      return {
        version: 1,
        providers: Array.isArray(parsed.providers) ? parsed.providers : [],
      };
    } catch {
      return { version: 1, providers: [] };
    }
  }

  private async write(file: StoreFile): Promise<void> {
    await writePrivateFile(this.filePath, `${JSON.stringify(file, null, 2)}\n`);
  }
}
