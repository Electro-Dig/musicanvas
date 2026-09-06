const MAX_LIBRARY_BODY_BYTES = 512 * 1024;
const LIBRARY_KEY_PATTERN = /^gml_[a-f0-9]{64}$/;
const LIBRARY_NAMESPACE_PATTERN = /^[a-f0-9]{64}$/;
const LIBRARY_ITEM_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const LIBRARY_ITEM_KINDS = ['pattern', 'scene', 'template'] as const;
/** 图案广场公共条目的固定 Blobs 前缀（无需 64 位 hex namespace）。 */
export const PUBLIC_LIBRARY_PREFIX = 'public/items/';
const PUBLIC_LIBRARY_ROUTE_ID = 'public';
const ALLOWED_LIBRARY_ORIGINS = new Set([
  'https://musicanvas.art',
  'https://www.musicanvas.art',
  'https://quadlily.netlify.app',
  'https://gemidi-quad-lily-20260901.netlify.app',
  'https://quad-lily.netlify.app',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
]);

type CloudLibraryItemKind = typeof LIBRARY_ITEM_KINDS[number];

interface CloudLibraryPublishMetadata {
  author?: string;
  publishedAt?: string;
  publisherId?: string;
}

interface CloudLibraryItem {
  schemaVersion: 1;
  id: string;
  name: string;
  kind: CloudLibraryItemKind;
  createdAt: string;
  updatedAt: string;
  data: unknown;
  metadata?: CloudLibraryPublishMetadata;
}

export interface LibraryBlobStore {
  list(options: { prefix: string }): Promise<{ blobs: Array<{ key: string }> }>;
  get(key: string, options?: { type: 'json' }): Promise<unknown | null>;
  setJSON(key: string, value: unknown): Promise<unknown>;
  delete(key: string): Promise<unknown>;
}

export interface LibraryRequestContext {
  params?: Record<string, string | undefined>;
  verifiedUser?: VerifiedLibraryUser | null;
}

export interface VerifiedLibraryUser {
  id: string;
  email?: string;
  name?: string;
}

export interface LibraryHandlerDependencies {
  getStore(): LibraryBlobStore | Promise<LibraryBlobStore>;
  now?(): string;
  createId?(): string;
}

export class LibraryApiError extends Error {
  readonly status: number;

  constructor(
    message: string,
    status: number,
  ) {
    super(message);
    this.status = status;
  }
}

export function isAllowedLibraryOrigin(origin: string): boolean {
  return ALLOWED_LIBRARY_ORIGINS.has(origin);
}

export async function hashLibraryKey(value: string): Promise<string> {
  if (!LIBRARY_KEY_PATTERN.test(value)) {
    throw new LibraryApiError('Library Key 格式无效。', 401);
  }
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function hasBearerAuthorization(request: Request): boolean {
  const authHeader = request.headers.get('authorization') ?? '';
  return /^\s*Bearer(?:\s|$)/i.test(authHeader);
}

function requireVerifiedUser(context: LibraryRequestContext): VerifiedLibraryUser {
  const user = context.verifiedUser;
  if (!user || typeof user.id !== 'string' || user.id.length < 8) {
    throw new LibraryApiError('Sign in required to publish.', 401);
  }
  return user;
}

/**
 * 从请求头中解析用户命名空间（namespace）：
 *  1. 优先使用 Netlify Function 入口传入的已验证 Identity user
 *  2. fallback：读取 x-gemidi-library-key 并 SHA-256 哈希
 */
export async function resolveUserNamespace(
  request: Request,
  verifiedUser?: VerifiedLibraryUser | null,
): Promise<string> {
  if (verifiedUser && typeof verifiedUser.id === 'string' && verifiedUser.id.length >= 8) {
    const digest = await globalThis.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`jwt:${verifiedUser.id}`),
    );
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  }
  if (hasBearerAuthorization(request)) {
    throw new LibraryApiError('Invalid authorization token.', 401);
  }

  const libraryKey = request.headers.get('x-gemidi-library-key') ?? '';
  return hashLibraryKey(libraryKey);
}

export function blobKeyForItem(namespace: string, id: string): string {
  if (!LIBRARY_NAMESPACE_PATTERN.test(namespace)) {
    throw new LibraryApiError('Library namespace 格式无效。', 500);
  }
  if (!LIBRARY_ITEM_ID_PATTERN.test(id)) {
    throw new LibraryApiError('Library 条目 ID 格式无效。', 400);
  }
  return `${namespace}/items/${id}.json`;
}

export function publicBlobKeyForItem(id: string): string {
  if (!LIBRARY_ITEM_ID_PATTERN.test(id)) {
    throw new LibraryApiError('Library 条目 ID 格式无效。', 400);
  }
  return `${PUBLIC_LIBRARY_PREFIX}${id}.json`;
}

export async function parseLibraryJsonBody(request: Request): Promise<unknown> {
  const declaredSize = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_LIBRARY_BODY_BYTES) {
    throw new LibraryApiError('Library 条目超过 512 KiB。', 413);
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_LIBRARY_BODY_BYTES) {
    throw new LibraryApiError('Library 条目超过 512 KiB。', 413);
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new LibraryApiError('请求体不是有效 JSON。', 400);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCloudLibraryItem(value: unknown): value is CloudLibraryItem {
  return isRecord(value)
    && value.schemaVersion === 1
    && typeof value.id === 'string'
    && LIBRARY_ITEM_ID_PATTERN.test(value.id)
    && typeof value.name === 'string'
    && value.name.length >= 1
    && value.name.length <= 120
    && LIBRARY_ITEM_KINDS.includes(value.kind as CloudLibraryItemKind)
    && typeof value.createdAt === 'string'
    && typeof value.updatedAt === 'string'
    && Object.hasOwn(value, 'data');
}

function normalizeLibraryItem(
  value: unknown,
  options: { id: string; now: string; existing?: unknown; ignoreInputId?: boolean },
): CloudLibraryItem {
  if (!isRecord(value)) throw new LibraryApiError('Library 条目格式无效。', 400);
  if (!options.ignoreInputId && value.id !== undefined && value.id !== options.id) {
    throw new LibraryApiError('请求路径与条目 ID 不一致。', 400);
  }
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  if (name.length < 1 || name.length > 120) {
    throw new LibraryApiError('Library 条目名称必须为 1–120 个字符。', 400);
  }
  if (!LIBRARY_ITEM_KINDS.includes(value.kind as CloudLibraryItemKind)) {
    throw new LibraryApiError('Library 条目 kind 无效。', 400);
  }
  if (!Object.hasOwn(value, 'data')) {
    throw new LibraryApiError('Library 条目缺少 data。', 400);
  }
  const existing = isCloudLibraryItem(options.existing) ? options.existing : undefined;
  return {
    schemaVersion: 1,
    id: options.id,
    name,
    kind: value.kind as CloudLibraryItemKind,
    createdAt: existing?.createdAt ?? options.now,
    updatedAt: options.now,
    data: value.data,
  };
}

function toPublicLibraryItem(item: CloudLibraryItem): CloudLibraryItem {
  const metadata = item.metadata
    ? {
        author: item.metadata.author,
        publishedAt: item.metadata.publishedAt,
      }
    : undefined;
  return { ...item, metadata };
}

async function createAvailablePublicId(
  store: LibraryBlobStore,
  createId: () => string,
): Promise<string> {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const id = createId();
    const key = publicBlobKeyForItem(id);
    if (await store.get(key, { type: 'json' }) === null) return id;
  }
  throw new LibraryApiError('无法生成不冲突的公共 Library 条目 ID。', 503);
}

function corsHeaders(origin: string | null): Headers {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    vary: 'Origin',
  });
  if (origin && isAllowedLibraryOrigin(origin)) {
    headers.set('access-control-allow-origin', origin);
    headers.set('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS');
    headers.set('access-control-allow-headers', 'content-type, x-gemidi-library-key, authorization');
  }
  return headers;
}

function jsonResponse(body: unknown, status: number, headers: Headers): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function pathId(request: Request, context: LibraryRequestContext): string | undefined {
  const fromContext = context.params?.id;
  if (fromContext) return fromContext;
  const match = new URL(request.url).pathname.match(/^\/api\/library\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

function errorResponse(error: unknown, headers: Headers): Response {
  if (error instanceof LibraryApiError) {
    return jsonResponse({ error: error.message }, error.status, headers);
  }
  console.error('Library API failed', error);
  return jsonResponse({ error: 'Library 服务暂时不可用。' }, 500, headers);
}

export function createLibraryRequestHandler(dependencies: LibraryHandlerDependencies) {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const createId = dependencies.createId ?? (() => globalThis.crypto.randomUUID());

  return async (request: Request, context: LibraryRequestContext): Promise<Response> => {
    const origin = request.headers.get('origin');
    const headers = corsHeaders(origin);
    if (origin && !isAllowedLibraryOrigin(origin)) {
      return jsonResponse({ error: 'Origin 不允许访问 Library。' }, 403, headers);
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    try {
      const id = pathId(request, context);
      if (id !== undefined && id !== PUBLIC_LIBRARY_ROUTE_ID && !LIBRARY_ITEM_ID_PATTERN.test(id)) {
        throw new LibraryApiError('Library 条目 ID 格式无效。', 400);
      }
      if (hasBearerAuthorization(request)
        && (!context.verifiedUser
          || typeof context.verifiedUser.id !== 'string'
          || context.verifiedUser.id.length < 8)) {
        throw new LibraryApiError('Invalid authorization token.', 401);
      }
      const store = await dependencies.getStore();

      if (id === PUBLIC_LIBRARY_ROUTE_ID) {
        if (request.method === 'GET') {
          const { blobs } = await store.list({ prefix: PUBLIC_LIBRARY_PREFIX });
          const entries = await Promise.all(blobs.map(blob => store.get(blob.key, { type: 'json' })));
          const items = entries.filter(isCloudLibraryItem).sort((left, right) => (
            (right.metadata?.publishedAt ?? right.updatedAt)
              .localeCompare(left.metadata?.publishedAt ?? left.updatedAt)
          )).map(toPublicLibraryItem);
          return jsonResponse({ items }, 200, headers);
        }

        if (request.method === 'POST') {
          const identity = requireVerifiedUser(context);
          const timestamp = now();
          const value = await parseLibraryJsonBody(request);
          const generatedId = await createAvailablePublicId(store, createId);
          const item = normalizeLibraryItem(value, {
            id: generatedId,
            now: timestamp,
            ignoreInputId: true,
          });
          // 昵称优先：body.metadata.author → JWT user_metadata → email
          const bodyAuthor = isRecord(value)
            && isRecord(value.metadata)
            && typeof value.metadata.author === 'string'
            ? value.metadata.author.trim().slice(0, 40)
            : '';
          const author = bodyAuthor || identity.name || identity.email || 'Anonymous';
          const published: CloudLibraryItem = {
            ...item,
            metadata: {
              author,
              publishedAt: timestamp,
              publisherId: identity.id,
            },
          };
          await store.setJSON(publicBlobKeyForItem(generatedId), published);
          return jsonResponse({ item: toPublicLibraryItem(published) }, 201, headers);
        }

        return jsonResponse({ error: 'Method not allowed.' }, 405, headers);
      }

      const namespace = await resolveUserNamespace(request, context.verifiedUser);
      const prefix = `${namespace}/items/`;

      if (request.method === 'GET' && id === undefined) {
        const { blobs } = await store.list({ prefix });
        const entries = await Promise.all(blobs.map(blob => store.get(blob.key, { type: 'json' })));
        const items = entries.filter(isCloudLibraryItem).sort((left, right) => (
          right.updatedAt.localeCompare(left.updatedAt)
        ));
        return jsonResponse({ items }, 200, headers);
      }

      if (request.method === 'GET' && id !== undefined) {
        const item = await store.get(blobKeyForItem(namespace, id), { type: 'json' });
        if (!isCloudLibraryItem(item)) throw new LibraryApiError('Library 条目不存在。', 404);
        return jsonResponse({ item }, 200, headers);
      }

      if (request.method === 'POST' && id === undefined) {
        const value = await parseLibraryJsonBody(request);
        const requestedId = isRecord(value) && typeof value.id === 'string' ? value.id : createId();
        const key = blobKeyForItem(namespace, requestedId);
        const item = normalizeLibraryItem(value, { id: requestedId, now: now() });
        await store.setJSON(key, item);
        return jsonResponse({ item }, 201, headers);
      }

      if (request.method === 'PUT' && id !== undefined) {
        const value = await parseLibraryJsonBody(request);
        const key = blobKeyForItem(namespace, id);
        const existing = await store.get(key, { type: 'json' });
        const item = normalizeLibraryItem(value, { id, now: now(), existing });
        await store.setJSON(key, item);
        return jsonResponse({ item }, 200, headers);
      }

      if (request.method === 'DELETE' && id !== undefined) {
        await store.delete(blobKeyForItem(namespace, id));
        return new Response(null, { status: 204, headers });
      }

      return jsonResponse({ error: 'Method not allowed.' }, 405, headers);
    } catch (error) {
      return errorResponse(error, headers);
    }
  };
}
