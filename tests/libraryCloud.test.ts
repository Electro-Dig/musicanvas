import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LIBRARY_KEY_STORAGE_KEY,
  deleteLibraryItem,
  getOrCreateLibraryKey,
  isValidLibraryKey,
  listLibraryItems,
  listPublicLibraryItems,
  publishLibraryItem,
  resolveLibraryApiBaseUrl,
  saveLibraryItem,
  setLibraryKey,
} from '../quad/library/cloud.ts';

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

test('creates, persists and replaces a copyable random Library Key', () => {
  const storage = new MemoryStorage();
  const generated = getOrCreateLibraryKey(storage);

  assert.equal(isValidLibraryKey(generated), true);
  assert.equal(storage.getItem(LIBRARY_KEY_STORAGE_KEY), generated);
  assert.equal(getOrCreateLibraryKey(storage), generated);

  const replacement = `gml_${'a'.repeat(64)}`;
  assert.equal(setLibraryKey(replacement, storage), replacement);
  assert.equal(getOrCreateLibraryKey(storage), replacement);
  assert.throws(() => setLibraryKey('not-a-library-key', storage), /Library Key/);
});

test('uses the deployed Netlify API from Vite localhost and same-origin API in production', () => {
  assert.equal(
    resolveLibraryApiBaseUrl({ hostname: 'localhost', origin: 'http://localhost:3000' }),
    'https://musicanvas.art',
  );
  assert.equal(
    resolveLibraryApiBaseUrl({ hostname: '127.0.0.1', origin: 'http://127.0.0.1:3000' }),
    'https://musicanvas.art',
  );
  assert.equal(
    resolveLibraryApiBaseUrl({ hostname: 'gemidi.example', origin: 'https://gemidi.example' }),
    '',
  );
});

test('lists, saves and deletes through the API with the private Library Key header', async () => {
  const libraryKey = `gml_${'b'.repeat(64)}`;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const item = {
    schemaVersion: 1 as const,
    id: 'pattern-one',
    name: 'Pattern one',
    kind: 'pattern' as const,
    createdAt: '2026-09-02T01:00:00.000Z',
    updatedAt: '2026-09-02T01:00:00.000Z',
    data: { untouched: ['domain', 'wrapper'] },
  };
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (init?.method === 'DELETE') return new Response(null, { status: 204 });
    if (init?.method === 'PUT') {
      return Response.json({ item });
    }
    return Response.json({ items: [item] });
  };
  const options = { libraryKey, apiBaseUrl: 'https://library.test', fetchImpl };

  assert.deepEqual(await listLibraryItems(options), [item]);
  assert.deepEqual(await saveLibraryItem({
    id: 'pattern-one',
    name: 'Pattern one',
    kind: 'pattern',
    data: item.data,
  }, options), item);
  await deleteLibraryItem('pattern-one', options);

  assert.deepEqual(calls.map(call => [call.url, call.init?.method ?? 'GET']), [
    ['https://library.test/api/library', 'GET'],
    ['https://library.test/api/library/pattern-one', 'PUT'],
    ['https://library.test/api/library/pattern-one', 'DELETE'],
  ]);
  assert.equal(new Headers(calls[0].init?.headers).get('x-gemidi-library-key'), libraryKey);
  assert.deepEqual(JSON.parse(String(calls[1].init?.body)), {
    id: 'pattern-one',
    name: 'Pattern one',
    kind: 'pattern',
    data: { untouched: ['domain', 'wrapper'] },
  });
});

test('surfaces an API error instead of treating a failed request as an empty library', async () => {
  const fetchImpl: typeof fetch = async () => Response.json(
    { error: 'Library unavailable' },
    { status: 503 },
  );

  await assert.rejects(
    () => listLibraryItems({
      libraryKey: `gml_${'c'.repeat(64)}`,
      apiBaseUrl: 'https://library.test',
      fetchImpl,
    }),
    /Library unavailable/,
  );
});

test('lists and publishes Pattern Plaza items through /api/library/public', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const item = {
    schemaVersion: 1 as const,
    id: 'shared-one',
    name: 'Shared one',
    kind: 'pattern' as const,
    createdAt: '2026-09-04T00:17:00.000Z',
    updatedAt: '2026-09-04T00:17:00.000Z',
    data: { untouched: true },
    metadata: {
      author: 'ada@example.com',
      publishedAt: '2026-09-04T00:17:00.000Z',
      publisherId: 'user-uuid-12345678',
    },
  };
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    if (init?.method === 'POST') return Response.json({ item }, { status: 201 });
    return Response.json({ items: [item] });
  };

  assert.deepEqual(await listPublicLibraryItems({
    apiBaseUrl: 'https://library.test',
    fetchImpl,
  }), [item]);
  assert.equal(new Headers(calls[0].init?.headers).get('x-gemidi-library-key'), null);
  assert.equal(new Headers(calls[0].init?.headers).get('authorization'), null);

  assert.deepEqual(await publishLibraryItem({
    id: 'shared-one',
    name: 'Shared one',
    kind: 'pattern',
    data: item.data,
  }, {
    apiBaseUrl: 'https://library.test',
    jwtToken: 'jwt-token',
    fetchImpl,
  }), item);
  assert.equal(calls[1].url, 'https://library.test/api/library/public');
  assert.equal(new Headers(calls[1].init?.headers).get('authorization'), 'Bearer jwt-token');
});
