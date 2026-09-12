import {
  parseLibraryAsset,
  serializeLibraryAsset,
  type LibraryAsset,
} from './core.ts';

export const LIBRARY_LOCAL_STORAGE_KEY = 'gemidi.quad-lily-library.v1';

const LIBRARY_INDEX_KIND = 'gemidi.quad-lily-library-index';
const LIBRARY_INDEX_VERSION = 1;

export interface LibraryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface StoredLibraryIndex {
  kind: typeof LIBRARY_INDEX_KIND;
  version: typeof LIBRARY_INDEX_VERSION;
  assets: unknown[];
}

export class LocalStorageLibraryRepository {
  private readonly storage: LibraryStorage;
  private readonly storageKey: string;

  constructor(
    storage: LibraryStorage,
    storageKey = LIBRARY_LOCAL_STORAGE_KEY,
  ) {
    this.storage = storage;
    this.storageKey = storageKey;
  }

  list(): LibraryAsset[] {
    const index = this.readIndex();
    const seenIds = new Set<string>();
    return index.assets.flatMap((candidate): LibraryAsset[] => {
      const asset = parseStoredAsset(candidate);
      if (!asset || seenIds.has(asset.id)) return [];
      seenIds.add(asset.id);
      return [asset];
    });
  }

  get(id: string): LibraryAsset | null {
    return this.list().find(asset => asset.id === id) ?? null;
  }

  save(asset: LibraryAsset): LibraryAsset {
    let serialized: string;
    try {
      serialized = serializeLibraryAsset(asset);
    } catch {
      throw new TypeError('Expected a valid Library asset.');
    }
    const normalized = parseLibraryAsset(serialized);
    if (!normalized) throw new TypeError('Expected a valid Library asset.');

    const assets = this.list();
    const existingIndex = assets.findIndex(candidate => candidate.id === normalized.id);
    if (existingIndex >= 0) assets[existingIndex] = normalized;
    else assets.push(normalized);
    this.writeAssets(assets);
    return parseLibraryAsset(serializeLibraryAsset(normalized))!;
  }

  remove(id: string): boolean {
    const assets = this.list();
    const remaining = assets.filter(asset => asset.id !== id);
    if (remaining.length === assets.length) return false;
    this.writeAssets(remaining);
    return true;
  }

  private readIndex(): StoredLibraryIndex {
    const value = this.storage.getItem(this.storageKey);
    if (value === null) return emptyIndex();

    try {
      const decoded = JSON.parse(value) as unknown;
      if (!isRecord(decoded)
        || decoded.kind !== LIBRARY_INDEX_KIND
        || decoded.version !== LIBRARY_INDEX_VERSION
        || !Array.isArray(decoded.assets)) return emptyIndex();
      return {
        kind: LIBRARY_INDEX_KIND,
        version: LIBRARY_INDEX_VERSION,
        assets: decoded.assets,
      };
    } catch {
      return emptyIndex();
    }
  }

  private notifyChanged(): void {
    if (typeof window !== "undefined") window.dispatchEvent(new Event("quad-library-changed"));
  }

  private writeAssets(assets: LibraryAsset[]): void {
    if (assets.length === 0) {
      this.storage.removeItem(this.storageKey);
      this.notifyChanged();
      return;
    }
    const index: StoredLibraryIndex = {
      kind: LIBRARY_INDEX_KIND,
      version: LIBRARY_INDEX_VERSION,
      assets: assets.map(asset => JSON.parse(serializeLibraryAsset(asset)) as unknown),
    };
    this.storage.setItem(this.storageKey, JSON.stringify(index));
    this.notifyChanged();
  }
}

function parseStoredAsset(value: unknown): LibraryAsset | null {
  try {
    return parseLibraryAsset(JSON.stringify(value));
  } catch {
    return null;
  }
}

function emptyIndex(): StoredLibraryIndex {
  return { kind: LIBRARY_INDEX_KIND, version: LIBRARY_INDEX_VERSION, assets: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
