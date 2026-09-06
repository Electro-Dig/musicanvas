import assert from 'node:assert/strict';
import test from 'node:test';

import { createQuadLilyWorkspace } from '../quad/core.ts';
import { createUserPadAsset } from '../quad/library/core.ts';
import {
  LIBRARY_LOCAL_STORAGE_KEY,
  LocalStorageLibraryRepository,
  type LibraryStorage,
} from '../quad/library/localStorage.ts';

const FIXED_NOW = '2026-09-02T00:00:00.000Z';

class MemoryStorage implements LibraryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

test('persists, reads, upserts and removes personal Library assets', () => {
  const storage = new MemoryStorage();
  const repository = new LocalStorageLibraryRepository(storage);
  const original = createUserPadAsset({
    id: 'personal-one', name: 'First Name', pad: createQuadLilyWorkspace().pads.A, now: FIXED_NOW,
  });
  const renamed = { ...original, name: 'Renamed' };

  repository.save(original);
  repository.save(renamed);

  assert.equal(repository.list().length, 1);
  assert.equal(repository.get('personal-one')?.name, 'Renamed');
  assert.notEqual(repository.get('personal-one'), renamed);
  assert.equal(repository.remove('personal-one'), true);
  assert.equal(repository.remove('personal-one'), false);
  assert.deepEqual(repository.list(), []);
});

test('ignores malformed index members without discarding valid assets', () => {
  const storage = new MemoryStorage();
  const valid = createUserPadAsset({
    id: 'kept', name: 'Kept', pad: createQuadLilyWorkspace().pads.A, now: FIXED_NOW,
  });
  storage.setItem(LIBRARY_LOCAL_STORAGE_KEY, JSON.stringify({
    kind: 'gemidi.quad-lily-library-index',
    version: 1,
    assets: [valid, { ...valid, id: 'bad', version: 999 }],
  }));

  const repository = new LocalStorageLibraryRepository(storage);

  assert.deepEqual(repository.list().map(asset => asset.id), ['kept']);
});

test('treats an invalid local index as an empty personal Library', () => {
  const storage = new MemoryStorage();
  storage.setItem(LIBRARY_LOCAL_STORAGE_KEY, '{broken');

  assert.deepEqual(new LocalStorageLibraryRepository(storage).list(), []);

  storage.setItem(LIBRARY_LOCAL_STORAGE_KEY, JSON.stringify({
    kind: 'wrong-index', version: 1, assets: [],
  }));
  assert.deepEqual(new LocalStorageLibraryRepository(storage).list(), []);
});

test('refuses to save a mutated invalid asset', () => {
  const repository = new LocalStorageLibraryRepository(new MemoryStorage());
  const valid = createUserPadAsset({
    id: 'mutated', name: 'Mutated', pad: createQuadLilyWorkspace().pads.A, now: FIXED_NOW,
  });

  assert.throws(() => repository.save({ ...valid, version: 9 } as never), /valid Library asset/);
  assert.deepEqual(repository.list(), []);
});
