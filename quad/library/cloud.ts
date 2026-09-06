export const LIBRARY_KEY_STORAGE_KEY = 'gemidi.cloud-library-key.v1';
export const DEPLOYED_LIBRARY_API_ORIGIN = 'https://musicanvas.art';

const LIBRARY_KEY_PATTERN = /^gml_[a-f0-9]{64}$/;
const LIBRARY_ITEM_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const LIBRARY_ITEM_KINDS = ['pattern', 'scene', 'template'] as const;

export type CloudLibraryItemKind = typeof LIBRARY_ITEM_KINDS[number];

export interface CloudLibraryPublishMetadata {
  author?: string;
  publishedAt?: string;
  publisherId?: string;
}

export interface CloudLibraryItem<T = unknown> {
  schemaVersion: 1;
  id: string;
  name: string;
  kind: CloudLibraryItemKind;
  createdAt: string;
  updatedAt: string;
  data: T;
  metadata?: CloudLibraryPublishMetadata;
}

export interface SaveCloudLibraryItemInput<T = unknown> {
  id?: string;
  name: string;
  kind: CloudLibraryItemKind;
  data: T;
  metadata?: CloudLibraryPublishMetadata;
}

export interface LibraryKeyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface LibraryCloudOptions {
  libraryKey?: string;
  /** 已登录用户的 JWT access token。若提供则优先使用 Bearer 认证，忽略 libraryKey。 */
  jwtToken?: string;
  apiBaseUrl?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export interface LibraryLocation {
  hostname: string;
  origin: string;
}

export function isValidLibraryKey(value: unknown): value is string {
  return typeof value === 'string' && LIBRARY_KEY_PATTERN.test(value);
}

function browserStorage(): LibraryKeyStorage {
  if (typeof window === 'undefined' || !window.localStorage) {
    throw new Error('Library Key 需要浏览器 localStorage，或由调用方显式传入 storage。');
  }
  return window.localStorage;
}

function createRandomLibraryKey(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return `gml_${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

export function getOrCreateLibraryKey(
  storage: LibraryKeyStorage = browserStorage(),
): string {
  const saved = storage.getItem(LIBRARY_KEY_STORAGE_KEY);
  if (isValidLibraryKey(saved)) return saved;

  const generated = createRandomLibraryKey();
  storage.setItem(LIBRARY_KEY_STORAGE_KEY, generated);
  return generated;
}

export function setLibraryKey(
  value: string,
  storage: LibraryKeyStorage = browserStorage(),
): string {
  const normalized = value.trim().toLowerCase();
  if (!isValidLibraryKey(normalized)) {
    throw new Error('Library Key 格式无效。');
  }
  storage.setItem(LIBRARY_KEY_STORAGE_KEY, normalized);
  return normalized;
}

export function resolveLibraryApiBaseUrl(location: LibraryLocation): string {
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    return DEPLOYED_LIBRARY_API_ORIGIN;
  }
  return '';
}

function defaultApiBaseUrl(): string {
  if (typeof window === 'undefined') return DEPLOYED_LIBRARY_API_ORIGIN;
  return resolveLibraryApiBaseUrl(window.location);
}

function normalizeApiBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function assertLibraryItemId(value: string): void {
  if (!LIBRARY_ITEM_ID_PATTERN.test(value)) {
    throw new Error('Library 条目 ID 格式无效。');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseCloudLibraryItem(value: unknown): CloudLibraryItem {
  if (!isRecord(value)
    || value.schemaVersion !== 1
    || typeof value.id !== 'string'
    || !LIBRARY_ITEM_ID_PATTERN.test(value.id)
    || typeof value.name !== 'string'
    || value.name.length < 1
    || !LIBRARY_ITEM_KINDS.includes(value.kind as CloudLibraryItemKind)
    || typeof value.createdAt !== 'string'
    || typeof value.updatedAt !== 'string'
    || !Object.hasOwn(value, 'data')) {
    throw new Error('Library API 返回了无效条目。');
  }
  return value as unknown as CloudLibraryItem;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: unknown };
    if (typeof body.error === 'string' && body.error.trim()) return body.error;
  } catch {
    // Fall through to the stable client-side message.
  }
  return `Library 请求失败（HTTP ${response.status}）。`;
}

/**
 * 获取当前 Netlify Identity JWT access token。
 * @netlify/identity 的 User 对象不含 token 字段；浏览器端 JWT 存在 nf_jwt cookie。
 */
async function tryGetJwtToken(): Promise<string | null> {
  try {
    if (typeof document !== 'undefined') {
      const match = document.cookie.match(/(?:^|; )nf_jwt=([^;]*)/);
      if (match?.[1]) {
        const token = decodeURIComponent(match[1]);
        if (token) return token;
      }
    }
    // 兜底：确认已登录（会触发 hydrate），再读一次 cookie
    const { getUser } = await import('@netlify/identity');
    const user = await getUser();
    if (!user || typeof document === 'undefined') return null;
    const retry = document.cookie.match(/(?:^|; )nf_jwt=([^;]*)/);
    return retry?.[1] ? decodeURIComponent(retry[1]) : null;
  } catch {
    return null;
  }
}

async function libraryRequest(
  path: string,
  init: RequestInit,
  options: LibraryCloudOptions,
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set('content-type', 'application/json');

  // 优先使用 JWT（已登录用户），fallback 到 Library Key（匿名用户）
  const jwtToken = options.jwtToken ?? await tryGetJwtToken();
  if (jwtToken) {
    headers.set('authorization', `Bearer ${jwtToken}`);
  } else {
    const libraryKey = options.libraryKey ?? getOrCreateLibraryKey();
    if (!isValidLibraryKey(libraryKey)) throw new Error('Library Key 格式无效。');
    headers.set('x-gemidi-library-key', libraryKey);
  }

  const response = await (options.fetchImpl ?? fetch)(
    `${normalizeApiBaseUrl(options.apiBaseUrl ?? defaultApiBaseUrl())}${path}`,
    { ...init, headers, signal: options.signal },
  );
  if (!response.ok) throw new Error(await readError(response));
  return response;
}

async function publicLibraryRequest(
  path: string,
  init: RequestInit,
  options: LibraryCloudOptions,
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set('content-type', 'application/json');

  const method = (init.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const jwtToken = options.jwtToken ?? await tryGetJwtToken();
    if (!jwtToken) throw new Error('Sign in to publish to Pattern Plaza.');
    headers.set('authorization', `Bearer ${jwtToken}`);
  }

  const response = await (options.fetchImpl ?? fetch)(
    `${normalizeApiBaseUrl(options.apiBaseUrl ?? defaultApiBaseUrl())}${path}`,
    { ...init, headers, signal: options.signal },
  );
  if (!response.ok) throw new Error(await readError(response));
  return response;
}

export async function listLibraryItems(
  options: LibraryCloudOptions = {},
): Promise<CloudLibraryItem[]> {
  const response = await libraryRequest('/api/library', { method: 'GET' }, options);
  const body = await response.json() as { items?: unknown };
  if (!Array.isArray(body.items)) throw new Error('Library API 返回了无效列表。');
  return body.items.map(parseCloudLibraryItem);
}

export async function saveLibraryItem<T>(
  input: SaveCloudLibraryItemInput<T>,
  options: LibraryCloudOptions = {},
): Promise<CloudLibraryItem<T>> {
  if (input.id !== undefined) assertLibraryItemId(input.id);
  const path = input.id === undefined
    ? '/api/library'
    : `/api/library/${encodeURIComponent(input.id)}`;
  const response = await libraryRequest(path, {
    method: input.id === undefined ? 'POST' : 'PUT',
    body: JSON.stringify(input),
  }, options);
  const body = await response.json() as { item?: unknown };
  return parseCloudLibraryItem(body.item) as CloudLibraryItem<T>;
}

export async function deleteLibraryItem(
  id: string,
  options: LibraryCloudOptions = {},
): Promise<void> {
  assertLibraryItemId(id);
  await libraryRequest(`/api/library/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  }, options);
}

export async function listPublicLibraryItems(
  options: LibraryCloudOptions = {},
): Promise<CloudLibraryItem[]> {
  const response = await publicLibraryRequest('/api/library/public', { method: 'GET' }, options);
  const body = await response.json() as { items?: unknown };
  if (!Array.isArray(body.items)) throw new Error('Library API 返回了无效列表。');
  return body.items.map(parseCloudLibraryItem);
}

export async function publishLibraryItem<T>(
  input: SaveCloudLibraryItemInput<T>,
  options: LibraryCloudOptions = {},
): Promise<CloudLibraryItem<T>> {
  if (input.id !== undefined) assertLibraryItemId(input.id);
  const response = await publicLibraryRequest('/api/library/public', {
    method: 'POST',
    body: JSON.stringify(input),
  }, options);
  const body = await response.json() as { item?: unknown };
  return parseCloudLibraryItem(body.item) as CloudLibraryItem<T>;
}
