import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LibraryApiError,
  blobKeyForItem,
  createLibraryRequestHandler,
  hashLibraryKey,
  isAllowedLibraryOrigin,
  parseLibraryJsonBody,
  publicBlobKeyForItem,
} from '../netlify/functions/_shared/library.ts';

const LIBRARY_KEY = `gml_${'0'.repeat(64)}`;

class MemoryBlobStore {
  readonly values = new Map<string, unknown>();

  async list(options: { prefix: string }) {
    return {
      blobs: [...this.values.keys()]
        .filter(key => key.startsWith(options.prefix))
        .map(key => ({ key, etag: 'test' })),
    };
  }

  async get(key: string) {
    return this.values.get(key) ?? null;
  }

  async setJSON(key: string, value: unknown) {
    this.values.set(key, value);
  }

  async delete(key: string) {
    this.values.delete(key);
  }
}

test('hashes a valid Library Key into a non-reversible fixed namespace', async () => {
  assert.equal(
    await hashLibraryKey(LIBRARY_KEY),
    '9630ce21aeeda6f615a4e8157e3af2c5d0ee9874d64412bca02bbd774a92d60d',
  );
  await assert.rejects(() => hashLibraryKey('../../../shared'), /Library Key/);
});

test('derives blob keys only from a hashed namespace and a constrained item id', () => {
  assert.equal(
    blobKeyForItem('a'.repeat(64), 'pattern-01'),
    `${'a'.repeat(64)}/items/pattern-01.json`,
  );
  assert.equal(publicBlobKeyForItem('pattern-01'), 'public/items/pattern-01.json');
  assert.throws(() => blobKeyForItem('a'.repeat(64), '../other-user'), /ID/);
  assert.throws(() => blobKeyForItem('raw-key', 'pattern-01'), /namespace/);
});

test('accepts CORS only for the deployed app and local development origins', () => {
  assert.equal(isAllowedLibraryOrigin('https://quadlily.netlify.app'), true);
  assert.equal(isAllowedLibraryOrigin('https://gemidi-quad-lily-20260901.netlify.app'), true);
  assert.equal(isAllowedLibraryOrigin('http://localhost:3001'), true);
  assert.equal(isAllowedLibraryOrigin('http://127.0.0.1:3001'), true);
  assert.equal(isAllowedLibraryOrigin('http://localhost:3000'), false);
  assert.equal(isAllowedLibraryOrigin('https://attacker.example'), false);
});

test('rejects a JSON request body larger than 512 KiB before parsing it', async () => {
  const request = new Request('https://example.test/api/library', {
    method: 'POST',
    headers: { 'content-length': String(512 * 1024 + 1) },
    body: '{}',
  });

  await assert.rejects(
    () => parseLibraryJsonBody(request),
    (error: unknown) => error instanceof LibraryApiError && error.status === 413,
  );
});

test('saves, lists, reads and deletes only items inside the caller namespace', async () => {
  const store = new MemoryBlobStore();
  const handler = createLibraryRequestHandler({
    getStore: () => store,
    now: () => '2026-09-02T01:02:03.000Z',
    createId: () => 'generated-id',
  });
  const headers = {
    origin: 'http://localhost:3001',
    'content-type': 'application/json',
    'x-gemidi-library-key': LIBRARY_KEY,
  };
  const savedResponse = await handler(new Request('https://app.test/api/library', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'Warm orbit',
      kind: 'pattern',
      data: { schemaVersion: 3, nodes: [{ id: 'n1', x: 0.25, y: 0.5 }] },
    }),
  }), {});

  assert.equal(savedResponse.status, 201);
  const saved = await savedResponse.json() as { item: Record<string, unknown> };
  assert.deepEqual(saved.item, {
    schemaVersion: 1,
    id: 'generated-id',
    name: 'Warm orbit',
    kind: 'pattern',
    createdAt: '2026-09-02T01:02:03.000Z',
    updatedAt: '2026-09-02T01:02:03.000Z',
    data: { schemaVersion: 3, nodes: [{ id: 'n1', x: 0.25, y: 0.5 }] },
  });
  assert.equal([...store.values.keys()].length, 1);
  assert.equal([...store.values.keys()][0].includes(LIBRARY_KEY), false);

  const listResponse = await handler(new Request('https://app.test/api/library', {
    headers,
  }), {});
  assert.equal(listResponse.status, 200);
  assert.deepEqual(await listResponse.json(), { items: [saved.item] });

  const getResponse = await handler(new Request('https://app.test/api/library/generated-id', {
    headers,
  }), { params: { id: 'generated-id' } });
  assert.deepEqual(await getResponse.json(), { item: saved.item });

  const deleteResponse = await handler(new Request('https://app.test/api/library/generated-id', {
    method: 'DELETE',
    headers,
  }), { params: { id: 'generated-id' } });
  assert.equal(deleteResponse.status, 204);
  assert.equal(store.values.size, 0);
});

test('rejects untrusted origins, missing keys, oversized envelopes and route/body id mismatch', async () => {
  const handler = createLibraryRequestHandler({
    getStore: () => new MemoryBlobStore(),
    now: () => '2026-09-02T01:02:03.000Z',
    createId: () => 'generated-id',
  });

  const forbidden = await handler(new Request('https://app.test/api/library', {
    headers: { origin: 'https://attacker.example', 'x-gemidi-library-key': LIBRARY_KEY },
  }), {});
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.headers.has('access-control-allow-origin'), false);

  const missingKey = await handler(new Request('https://app.test/api/library', {
    headers: { origin: 'http://localhost:3001' },
  }), {});
  assert.equal(missingKey.status, 401);

  const mismatch = await handler(new Request('https://app.test/api/library/route-id', {
    method: 'PUT',
    headers: {
      origin: 'http://localhost:3001',
      'content-type': 'application/json',
      'x-gemidi-library-key': LIBRARY_KEY,
    },
    body: JSON.stringify({
      id: 'body-id',
      name: 'Mismatch',
      kind: 'pattern',
      data: {},
    }),
  }), { params: { id: 'route-id' } });
  assert.equal(mismatch.status, 400);
});

function encodeJwt(payload: Record<string, unknown>): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.sig`;
}

test('lists public Pattern Plaza items anonymously and publishes with a verified identity', async () => {
  const store = new MemoryBlobStore();
  const handler = createLibraryRequestHandler({
    getStore: () => store,
    now: () => '2026-09-04T00:17:00.000Z',
    createId: () => 'public-generated',
  });
  const origin = 'http://localhost:3001';

  const anonymousList = await handler(new Request('https://app.test/api/library/public', {
    headers: { origin },
  }), { params: { id: 'public' } });
  assert.equal(anonymousList.status, 200);
  assert.deepEqual(await anonymousList.json(), { items: [] });

  const rejected = await handler(new Request('https://app.test/api/library/public', {
    method: 'POST',
    headers: {
      origin,
      'content-type': 'application/json',
      'x-gemidi-library-key': LIBRARY_KEY,
    },
    body: JSON.stringify({
      name: 'Shared pulse',
      kind: 'pattern',
      data: { ok: true },
    }),
  }), { params: { id: 'public' } });
  assert.equal(rejected.status, 401);

  const published = await handler(new Request('https://app.test/api/library/public', {
    method: 'POST',
    headers: {
      origin,
      'content-type': 'application/json',
      authorization: 'Bearer verified-by-netlify',
    },
    body: JSON.stringify({
      id: 'shared-pulse',
      name: 'Shared pulse',
      kind: 'pattern',
      data: { ok: true },
    }),
  }), {
    params: { id: 'public' },
    verifiedUser: {
      id: 'user-uuid-12345678',
      email: 'ada@example.com',
    },
  });
  assert.equal(published.status, 201);
  const body = await published.json() as { item: Record<string, unknown> };
  assert.equal(body.item.id, 'public-generated');
  assert.deepEqual(body.item.metadata, {
    author: 'ada@example.com',
    publishedAt: '2026-09-04T00:17:00.000Z',
  });
  assert.equal([...store.values.keys()][0], 'public/items/public-generated.json');
  assert.deepEqual(
    (store.values.get('public/items/public-generated.json') as { metadata: unknown }).metadata,
    {
      author: 'ada@example.com',
      publishedAt: '2026-09-04T00:17:00.000Z',
      publisherId: 'user-uuid-12345678',
    },
  );

  const listed = await handler(new Request('https://app.test/api/library/public', {
    headers: { origin },
  }), { params: { id: 'public' } });
  assert.equal(listed.status, 200);
  assert.deepEqual(await listed.json(), { items: [body.item] });
});

test('rejects an unverified Bearer token instead of trusting its decoded claims', async () => {
  const handler = createLibraryRequestHandler({
    getStore: () => new MemoryBlobStore(),
  });
  const forgedToken = encodeJwt({
    sub: 'attacker-user-12345678',
    email: 'attacker@example.com',
  });

  const response = await handler(new Request('https://app.test/api/library', {
    headers: {
      authorization: `Bearer ${forgedToken}`,
      'x-gemidi-library-key': LIBRARY_KEY,
    },
  }), {});

  assert.equal(response.status, 401);
});

test('rejects an unverified Bearer token even on the anonymous public route', async () => {
  const handler = createLibraryRequestHandler({
    getStore: () => new MemoryBlobStore(),
  });

  const response = await handler(new Request('https://app.test/api/library/public', {
    headers: { authorization: `Bearer ${encodeJwt({ sub: 'forged-public-user' })}` },
  }), { params: { id: 'public' } });

  assert.equal(response.status, 401);
});

test('generates a collision-free public id without overwriting an existing item', async () => {
  const store = new MemoryBlobStore();
  const existing = {
    schemaVersion: 1,
    id: 'already-used',
    name: 'Original',
    kind: 'pattern',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    data: { original: true },
  };
  store.values.set('public/items/already-used.json', existing);
  const ids = ['already-used', 'collision-free'];
  const handler = createLibraryRequestHandler({
    getStore: () => store,
    now: () => '2026-09-04T00:17:00.000Z',
    createId: () => ids.shift() ?? 'collision-free',
  });

  const response = await handler(new Request('https://app.test/api/library/public', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer verified-by-netlify',
    },
    body: JSON.stringify({
      id: 'already-used',
      name: 'New publication',
      kind: 'pattern',
      data: { original: false },
    }),
  }), {
    params: { id: 'public' },
    verifiedUser: { id: 'publisher-user-12345678' },
  });

  assert.equal(response.status, 201);
  const body = await response.json() as { item: { id: string } };
  assert.equal(body.item.id, 'collision-free');
  assert.deepEqual(store.values.get('public/items/already-used.json'), existing);
  assert.equal(store.values.has('public/items/collision-free.json'), true);
});

test('Netlify entry resolves a verified user and passes it to the library handler', async () => {
  const libraryEntry = await import('../netlify/functions/library.ts');
  assert.equal(typeof libraryEntry.createNetlifyLibraryHandler, 'function');

  const store = new MemoryBlobStore();
  let getUserCalls = 0;
  const handler = libraryEntry.createNetlifyLibraryHandler({
    getStore: () => store,
    getUser: async () => {
      getUserCalls += 1;
      return { id: 'verified-entry-user', email: 'entry@example.com' };
    },
  });
  const response = await handler(new Request('https://app.test/api/library/public', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer opaque-token',
    },
    body: JSON.stringify({ name: 'Entry verified', kind: 'pattern', data: {} }),
  }), { params: { id: 'public' } });

  assert.equal(getUserCalls, 1);
  assert.equal(response.status, 201);
});

test('Netlify entry skips Identity lookup for Library Key requests', async () => {
  const { createNetlifyLibraryHandler } = await import('../netlify/functions/library.ts');
  let getUserCalls = 0;
  const handler = createNetlifyLibraryHandler({
    getStore: () => new MemoryBlobStore(),
    getUser: async () => {
      getUserCalls += 1;
      return null;
    },
  });

  const response = await handler(new Request('https://app.test/api/library', {
    headers: { 'x-gemidi-library-key': LIBRARY_KEY },
  }), { params: {} });

  assert.equal(response.status, 200);
  assert.equal(getUserCalls, 0);
});
