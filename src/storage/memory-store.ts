import type { ProviderSlug, ProviderStore, StoredProvider } from '../types.js';

export class MemoryProviderStore implements ProviderStore {
  private records = new Map<ProviderSlug, StoredProvider>();

  constructor(initial: StoredProvider[] = []) {
    for (const record of initial) this.records.set(record.slug, { ...record });
  }

  async list(): Promise<StoredProvider[]> {
    return [...this.records.values()].map((record) => ({ ...record, accountInfo: { ...record.accountInfo } }));
  }

  async get(slug: ProviderSlug): Promise<StoredProvider | null> {
    const record = this.records.get(slug);
    return record ? { ...record, accountInfo: { ...record.accountInfo } } : null;
  }

  async upsert(provider: StoredProvider): Promise<StoredProvider> {
    const next = { ...provider, accountInfo: { ...provider.accountInfo } };
    this.records.set(provider.slug, next);
    return { ...next, accountInfo: { ...next.accountInfo } };
  }

  async delete(slug: ProviderSlug): Promise<void> {
    this.records.delete(slug);
  }
}
