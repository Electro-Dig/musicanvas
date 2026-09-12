import { useUiText } from '../uiLocale';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Grid3x3, LayoutGrid } from 'lucide-react';

import { QUAD_PAD_IDS, type QuadLilyPad, type QuadLilyWorkspace, type QuadPadId } from '../core.ts';
import {
  deleteLibraryItem,
  getOrCreateLibraryKey,
  isValidLibraryKey,
  listLibraryItems,
  listPublicLibraryItems,
  publishLibraryItem,
  saveLibraryItem,
  setLibraryKey,
  type CloudLibraryItem,
  type CloudLibraryItemKind,
} from './cloud.ts';
import {
  createUserPadAsset,
  createUserWorkspaceAsset,
  parseLibraryAsset,
  serializeLibraryAsset,
  type LibraryAsset,
} from './core.ts';
import { buildPadLibraryPreviewModel } from './preview.ts';
import { CanvasDecorationLayer } from '../CanvasDecorationLayer.tsx';
import { CanonStudyCards } from './CanonStudyCards.tsx';
import { LocalStorageLibraryRepository } from './localStorage.ts';
import {
  PUBLIC_PAD_TEMPLATES,
  PUBLIC_RECIPE_TEMPLATES,
  PUBLIC_WORKSPACE_TEMPLATES,
} from './templates.ts';
import './library.css';

export interface LibraryDrawerProps {
  open: boolean;
  workspace: QuadLilyWorkspace;
  selectedPadId: QuadPadId;
  onClose(): void;
  onLoadAsset(asset: LibraryAsset): void;
  onStatus(message: string): void;
  /** 已登录时完全隐藏 LIBRARY KEY；默认 false。 */
  isAuthenticated?: boolean;
  /** 用于个人卡片作者名（邮箱前缀）；缺省显示 You。 */
  identityEmail?: string;
  /** 发布作者昵称；优先于邮箱前缀。 */
  identityNickname?: string;
  /** 无昵称时点击发布会回调，便于父级打开昵称弹窗。 */
  onRequireNickname?(): void;
  /** 当前 Pad 相对上次保存/载入已改动时，载入前 confirm。 */
  isDirty?: boolean;
  /** 本地捕获保存成功后通知父组件刷新 dirty 指纹。 */
  onCaptureSaved?(): void;
}

const LIBRARY_GRID_COLS_KEY = 'gemidi.library-grid-cols.v1';
const LOAD_UNSAVED_CONFIRM = 'Load this pattern? Unsaved changes to the current pad may be lost.';

export interface LibraryPersistencePorts {
  saveLocal(asset: LibraryAsset): LibraryAsset;
  saveCloud(asset: LibraryAsset): Promise<void>;
}

export interface LibraryPersistenceResult {
  asset: LibraryAsset;
  cloudStatus: 'synced' | 'failed';
  error?: unknown;
}

export interface KeyedLibraryPersistencePorts {
  saveLocal(asset: LibraryAsset): LibraryAsset;
  getCloudKey(): string;
  saveCloud(asset: LibraryAsset, key: string): Promise<void>;
}

export interface KeyedLibraryPersistenceResult extends LibraryPersistenceResult {
  cloudKey?: string;
}

export type CloudLibraryMutation =
  | { type: 'upsert'; asset: LibraryAsset }
  | { type: 'delete'; assetId: string };

type LibraryTab = 'mine' | 'patterns' | 'recipes';
type LibraryOrigin = 'local' | 'cloud' | 'factory' | 'public';
type CloudState = 'idle' | 'loading' | 'ready' | 'error';
type LibraryGridCols = 2 | 3;

interface LibraryEntry {
  asset: LibraryAsset;
  origins: LibraryOrigin[];
  author?: string;
  publishedAt?: string;
}

const CLOUD_KIND_BY_ASSET_TYPE: Record<LibraryAsset['type'], CloudLibraryItemKind> = {
  pad: 'pattern',
  workspace: 'scene',
  recipe: 'template',
};
const LIBRARY_TABS: readonly LibraryTab[] = ['mine', 'patterns', 'recipes'];

export function createLibraryAssetId(
  type: 'pad' | 'workspace',
  now = Date.now(),
  random = randomIdSegment(),
): string {
  const prefix = type === 'pad' ? 'user-pad' : 'user-scene';
  const time = Math.max(0, Math.trunc(now)).toString(36);
  const safeRandom = random
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 16) || 'seed';
  return `${prefix}-${time}-${safeRandom}`.slice(0, 64);
}

export function downloadJsonFile(filename: string, content: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function parseImportedJsonText(jsonText: string): LibraryAsset[] {
  let decoded: unknown;
  try {
    decoded = JSON.parse(jsonText) as unknown;
  } catch {
    throw new Error('不是有效的 JSON 格式。');
  }

  if (Array.isArray(decoded)) {
    const assets: LibraryAsset[] = [];
    for (const item of decoded) {
      const asset = parseLibraryAsset(JSON.stringify(item));
      if (asset) assets.push(asset);
    }
    if (assets.length === 0) throw new Error('未在数组中识别到有效素材。');
    return assets;
  }

  if (isRecord(decoded)) {
    if (decoded.kind === 'gemidi.quad-lily-library-bundle' && Array.isArray(decoded.assets)) {
      const assets: LibraryAsset[] = [];
      for (const item of decoded.assets) {
        const asset = parseLibraryAsset(JSON.stringify(item));
        if (asset) assets.push(asset);
      }
      if (assets.length === 0) throw new Error('备份包中未识别到有效素材。');
      return assets;
    }

    const single = parseLibraryAsset(JSON.stringify(decoded));
    if (single) return [single];

    if (Array.isArray(decoded.nodes) && typeof decoded.intervalMs === 'number') {
      const id = createLibraryAssetId('pad');
      const name = typeof decoded.name === 'string' && decoded.name.trim() ? decoded.name.trim() : '导入的 Pad 图案';
      return [createUserPadAsset({ id, name, pad: decoded as unknown as QuadLilyPad })];
    }

    if (decoded.kind === 'gemidi.quad-lily-workspace' && typeof decoded.pads === 'object') {
      const id = createLibraryAssetId('workspace');
      const name = '导入的组合场景';
      return [createUserWorkspaceAsset({ id, name, workspace: decoded as unknown as QuadLilyWorkspace })];
    }
  }

  throw new Error('文件不包含有效的 Lily Pad 或工作区数据。');
}

export async function persistLibraryAssetLocalFirst(
  asset: LibraryAsset,
  ports: LibraryPersistencePorts,
): Promise<LibraryPersistenceResult> {
  const saved = ports.saveLocal(asset);
  try {
    await ports.saveCloud(saved);
    return { asset: saved, cloudStatus: 'synced' };
  } catch (error) {
    return { asset: saved, cloudStatus: 'failed', error };
  }
}

export async function persistLibraryAssetWithKeyLocalFirst(
  asset: LibraryAsset,
  ports: KeyedLibraryPersistencePorts,
): Promise<KeyedLibraryPersistenceResult> {
  const saved = ports.saveLocal(asset);
  let cloudKey: string | undefined;
  try {
    cloudKey = ports.getCloudKey();
    await ports.saveCloud(saved, cloudKey);
    return { asset: saved, cloudStatus: 'synced', cloudKey };
  } catch (error) {
    return { asset: saved, cloudStatus: 'failed', cloudKey, error };
  }
}

export function reconcileCloudMutation(
  assets: LibraryAsset[],
  mutation: CloudLibraryMutation,
  operationKey: string,
  currentKey: string,
): LibraryAsset[] {
  if (operationKey !== currentKey) return assets;
  return mutation.type === 'upsert'
    ? upsertAsset(assets, mutation.asset)
    : assets.filter(asset => asset.id !== mutation.assetId);
}

export function parseCloudAssets(items: readonly unknown[]): LibraryAsset[] {
  return items.flatMap((item): LibraryAsset[] => {
    if (!isRecord(item)
      || typeof item.id !== 'string'
      || typeof item.kind !== 'string'
      || !Object.hasOwn(item, 'data')) return [];
    try {
      const asset = parseLibraryAsset(JSON.stringify(item.data));
      if (!asset
        || asset.id !== item.id
        || CLOUD_KIND_BY_ASSET_TYPE[asset.type] !== item.kind) return [];
      return [asset];
    } catch {
      return [];
    }
  });
}

async function saveAssetToCloud(asset: LibraryAsset, libraryKey: string): Promise<void> {
  await saveLibraryItem({
    id: asset.id,
    name: asset.name,
    kind: CLOUD_KIND_BY_ASSET_TYPE[asset.type],
    data: JSON.parse(serializeLibraryAsset(asset)) as unknown,
  }, { libraryKey });
}

export function LibraryDrawer({
  open,
  workspace,
  selectedPadId,
  onClose,
  onLoadAsset,
  onStatus,
  isAuthenticated = false,
  identityEmail,
  identityNickname,
  onRequireNickname,
  isDirty = false,
  onCaptureSaved,
}: LibraryDrawerProps) {
  const tr = useUiText();
  const [activeTab, setActiveTab] = useState<LibraryTab>('mine');
  const [assetName, setAssetName] = useState(() => defaultAssetName(selectedPadId));
  const [libraryKey, setCurrentLibraryKey] = useState('');
  const [libraryKeyDraft, setLibraryKeyDraft] = useState('');
  const [localAssets, setLocalAssets] = useState<LibraryAsset[]>([]);
  const [cloudAssets, setCloudAssets] = useState<LibraryAsset[]>([]);
  const [cloudState, setCloudState] = useState<CloudState>('idle');
  const [cloudError, setCloudError] = useState('');
  const [publicEntries, setPublicEntries] = useState<LibraryEntry[]>([]);
  const [publicState, setPublicState] = useState<CloudState>('idle');
  const [gridCols, setGridCols] = useState<LibraryGridCols>(2);
  const [saving, setSaving] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [drawerToast, setDrawerToast] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const repositoryRef = useRef<LocalStorageLibraryRepository | null>(null);
  const cloudRequestRef = useRef(0);
  const publicRequestRef = useRef(0);
  const cloudAbortRef = useRef<AbortController | null>(null);
  const libraryKeyRef = useRef('');
  const libraryMountedRef = useRef(true);
  const onCloseRef = useRef(onClose);
  const onStatusRef = useRef(onStatus);
  const onCaptureSavedRef = useRef(onCaptureSaved);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { onStatusRef.current = onStatus; }, [onStatus]);
  useEffect(() => { onCaptureSavedRef.current = onCaptureSaved; }, [onCaptureSaved]);
  useEffect(() => {
    libraryMountedRef.current = true;
    return () => { libraryMountedRef.current = false; };
  }, []);

  // 抽屉内短时 toast（Studio 不再显示底栏 midiStatus）
  useEffect(() => {
    if (!drawerToast) return;
    const timer = window.setTimeout(() => {
      if (libraryMountedRef.current) setDrawerToast(null);
    }, 3400);
    return () => window.clearTimeout(timer);
  }, [drawerToast]);

  const showDrawerToast = useCallback((text: string, tone: 'ok' | 'err' = 'ok') => {
    setDrawerToast({ text, tone });
    onStatusRef.current(text);
  }, []);

  const refreshCloud = useCallback(async (key: string) => {
    cloudAbortRef.current?.abort();
    const controller = new AbortController();
    cloudAbortRef.current = controller;
    const { signal } = controller;
    const requestId = ++cloudRequestRef.current;
    setCloudState('loading');
    setCloudError('');
    try {
      const items = await listLibraryItems({ libraryKey: key, signal });
      if (!libraryMountedRef.current || signal?.aborted || requestId !== cloudRequestRef.current) return;
      setCloudAssets(parseCloudAssets(items));
      setCloudState('ready');
    } catch (error) {
      if (!libraryMountedRef.current || signal?.aborted || requestId !== cloudRequestRef.current) return;
      const message = errorMessage(error);
      setCloudError(message);
      setCloudState('error');
      onStatusRef.current(tr("云端 Library 暂时不可用；本地素材不受影响。{0}", message));
    } finally {
      if (cloudAbortRef.current === controller) cloudAbortRef.current = null;
    }
  }, []);

  const refreshPublic = useCallback(async () => {
    const requestId = ++publicRequestRef.current;
    setPublicState('loading');
    try {
      const items = await listPublicLibraryItems();
      if (!libraryMountedRef.current || requestId !== publicRequestRef.current) return;
      setPublicEntries(parsePublicCloudEntries(items));
      setPublicState('ready');
    } catch (error) {
      if (!libraryMountedRef.current || requestId !== publicRequestRef.current) return;
      setPublicState('error');
      onStatusRef.current(`Pattern Plaza is temporarily unavailable. ${errorMessage(error)}`);
    }
  }, []);

  useEffect(() => {
    if (!open || typeof window === 'undefined') return undefined;
    try {
      setGridCols(readGridCols());
      const repository = new LocalStorageLibraryRepository(window.localStorage);
      repositoryRef.current = repository;
      setLocalAssets(repository.list());
      const key = getOrCreateLibraryKey(window.localStorage);
      libraryKeyRef.current = key;
      setCurrentLibraryKey(key);
      setLibraryKeyDraft(key);
      void refreshCloud(key);
      void refreshPublic();
    } catch (error) {
      setCloudState('error');
      setCloudError(tr(errorMessage(error)));
      onStatusRef.current(tr("无法打开个人素材库：{0}", tr(errorMessage(error))));
    }
    return () => cloudAbortRef.current?.abort();
  }, [open, refreshCloud, refreshPublic]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const drawer = drawerRef.current;
      if (!drawer) return;
      const focusable = (Array.from(drawer.querySelectorAll<HTMLElement>(
        'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([tabindex="-1"]), summary:not([tabindex="-1"]), [href]:not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])',
      )) as HTMLElement[]).filter(element => (
        !element.closest('[hidden]')
        && (!element.closest('details:not([open])') || element.matches('details:not([open]) > summary'))
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
      previouslyFocused?.focus();
    };
  }, [open]);

  const personalEntries = useMemo(
    () => mergePersonalEntries(localAssets, cloudAssets),
    [localAssets, cloudAssets],
  );
  const hasLocalOnlyAssets = personalEntries.some(isLocalOnlyEntry);
  const personalAuthor = identityNickname?.trim()
    || displayAuthorName(identityEmail);
  const plazaEntries = useMemo(
    () => [
      ...PUBLIC_PAD_TEMPLATES.map(asset => factoryEntry(asset)),
      ...PUBLIC_WORKSPACE_TEMPLATES.map(asset => factoryEntry(asset)),
      ...publicEntries,
    ],
    [publicEntries],
  );

  const toggleGridCols = useCallback(() => {
    setGridCols(current => {
      const next: LibraryGridCols = current === 2 ? 3 : 2;
      writeGridCols(next);
      return next;
    });
  }, []);

  const ensureLibraryKey = useCallback(() => {
    if (typeof window === 'undefined') throw new Error(tr("Library Key 需要浏览器环境。"));
    if (libraryKeyRef.current) return libraryKeyRef.current;
    const key = getOrCreateLibraryKey(window.localStorage);
    libraryKeyRef.current = key;
    setCurrentLibraryKey(key);
    setLibraryKeyDraft(key);
    return key;
  }, []);

  const saveAsset = useCallback(async (type: 'pad' | 'workspace') => {
    const name = assetName.trim();
    if (!name) {
      onStatusRef.current(tr("请先填写素材名称。"));
      return;
    }
    if (typeof window === 'undefined') return;
    setSaving(true);
    try {
      const repository = repositoryRef.current
        ?? new LocalStorageLibraryRepository(window.localStorage);
      repositoryRef.current = repository;
      const now = new Date().toISOString();
      const id = createLibraryAssetId(type);
      const asset = type === 'pad'
        ? createUserPadAsset({ id, name, now, pad: workspace.pads[selectedPadId] })
        : createUserWorkspaceAsset({ id, name, now, workspace });
      const result = await persistLibraryAssetWithKeyLocalFirst(asset, {
        saveLocal: candidate => {
          const saved = repository.save(candidate);
          setLocalAssets(repository.list());
          onStatusRef.current(tr("“{0}”已保存到本地，正在尝试云端同步。", saved.name));
          return saved;
        },
        getCloudKey: ensureLibraryKey,
        saveCloud: saveAssetToCloud,
      });
      if (!libraryMountedRef.current) return;

      setLocalAssets(upsertAsset(repository.list(), result.asset));
      if (result.cloudStatus === 'synced' && result.cloudKey) {
        setCloudAssets(current => reconcileCloudMutation(
          current,
          { type: 'upsert', asset: result.asset },
          result.cloudKey!,
          libraryKeyRef.current,
        ));
        if (result.cloudKey === libraryKeyRef.current) setCloudState('ready');
        onStatusRef.current(tr("“{0}”已保存到本地并同步云端。", result.asset.name));
        onCaptureSavedRef.current?.();
      } else {
        onStatusRef.current(tr("“{0}”已保存到本地；云端同步失败，本地素材不会丢失。", result.asset.name));
        onCaptureSavedRef.current?.();
      }
      setAssetName(defaultAssetName(selectedPadId));
    } catch (error) {
      if (!libraryMountedRef.current) return;
      onStatusRef.current(tr("保存失败：{0}", tr(errorMessage(error))));
    } finally {
      if (libraryMountedRef.current) setSaving(false);
    }
  }, [assetName, ensureLibraryKey, selectedPadId, workspace]);

  const replaceKey = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const normalizedDraft = libraryKeyDraft.trim().toLowerCase();
      if (!isValidLibraryKey(normalizedDraft)) throw new Error(tr("Library Key 格式无效。"));
      if (libraryKey && normalizedDraft !== libraryKey) {
        const confirmed = typeof window.confirm !== 'function'
          || window.confirm(tr("替换后旧云库不会自动合并；本地素材仍会保留。确认已复制旧 Key 并继续？"));
        if (!confirmed) return;
      }
      const nextKey = setLibraryKey(normalizedDraft, window.localStorage);
      libraryKeyRef.current = nextKey;
      setCurrentLibraryKey(nextKey);
      setLibraryKeyDraft(nextKey);
      setCloudAssets([]);
      onStatusRef.current(tr("Library Key 已替换，正在读取对应的个人库。"));
      void refreshCloud(nextKey);
    } catch (error) {
      onStatusRef.current(tr(errorMessage(error)));
    }
  }, [libraryKey, libraryKeyDraft, refreshCloud]);

  const copyKey = useCallback(async () => {
    if (!libraryKey || typeof navigator === 'undefined' || !navigator.clipboard) {
      onStatusRef.current(tr("当前环境无法自动复制，请手动选择 Library Key。"));
      return;
    }
    try {
      await navigator.clipboard.writeText(libraryKey);
      if (!libraryMountedRef.current) return;
      onStatusRef.current(tr("Library Key 已复制。请勿公开分享。"));
    } catch (error) {
      if (!libraryMountedRef.current) return;
      onStatusRef.current(tr("复制失败：{0}", tr(errorMessage(error))));
    }
  }, [libraryKey]);

  const loadAsset = useCallback((asset: LibraryAsset) => {
    if (asset.type === 'recipe') return;
    if (isDirty) {
      const confirmed = typeof window.confirm !== 'function'
        || window.confirm(LOAD_UNSAVED_CONFIRM);
      if (!confirmed) return;
    }
    onLoadAsset(asset);
    onCloseRef.current();
  }, [isDirty, onLoadAsset]);

  const publishPersonalAsset = useCallback(async (asset: LibraryAsset) => {
    if (asset.type === 'recipe') return;
    const author = identityNickname?.trim() ?? '';
    if (!author) {
      showDrawerToast(tr("请先设置昵称，再发布到图案广场。"), 'err');
      onRequireNickname?.();
      return;
    }
    setPublishingId(asset.id);
    try {
      // 判定：已登录 + JWT(nf_jwt) + POST /api/library/public → Blobs public/items/
      const published = await publishLibraryItem({
        id: asset.id,
        name: asset.name,
        kind: CLOUD_KIND_BY_ASSET_TYPE[asset.type],
        data: JSON.parse(serializeLibraryAsset(asset)) as unknown,
        metadata: { author },
      });
      if (!libraryMountedRef.current) return;
      setPublicEntries(current => upsertPublicEntry(current, published));
      setPublicState('ready');
      showDrawerToast(tr("「{0}」已发布到图案广场", asset.name), 'ok');
    } catch (error) {
      if (!libraryMountedRef.current) return;
      showDrawerToast(tr("发布失败：{0}", tr(errorMessage(error))), 'err');
    } finally {
      if (libraryMountedRef.current) setPublishingId(null);
    }
  }, [identityNickname, onRequireNickname, showDrawerToast]);

  const syncPersonalAsset = useCallback(async (asset: LibraryAsset) => {
    try {
      const operationKey = ensureLibraryKey();
      await saveAssetToCloud(asset, operationKey);
      if (!libraryMountedRef.current) return;
      setCloudAssets(current => reconcileCloudMutation(
        current,
        { type: 'upsert', asset },
        operationKey,
        libraryKeyRef.current,
      ));
      if (operationKey === libraryKeyRef.current) {
        setCloudState('ready');
        onStatusRef.current(tr("“{0}”已重新同步到云端。", asset.name));
      }
    } catch (error) {
      if (!libraryMountedRef.current) return;
      onStatusRef.current(tr("云端同步仍未完成；本地素材保持可用。{0}", tr(errorMessage(error))));
    }
  }, [ensureLibraryKey]);

  const removePersonalAsset = useCallback(async (entry: LibraryEntry) => {
    if (typeof window === 'undefined') return;
    const confirmed = typeof window.confirm !== 'function'
      || window.confirm(tr("从个人素材库删除“{0}”？", entry.asset.name));
    if (!confirmed) return;

    const repository = repositoryRef.current
      ?? new LocalStorageLibraryRepository(window.localStorage);
    repositoryRef.current = repository;
    if (entry.origins.includes('local')) {
      try {
        repository.remove(entry.asset.id);
        setLocalAssets(repository.list());
      } catch (error) {
        onStatusRef.current(tr("本地删除失败：{0}", tr(errorMessage(error))));
        return;
      }
    }
    if (entry.origins.includes('cloud')) {
      try {
        const operationKey = ensureLibraryKey();
        await deleteLibraryItem(entry.asset.id, { libraryKey: operationKey });
        if (!libraryMountedRef.current) return;
        setCloudAssets(current => reconcileCloudMutation(
          current,
          { type: 'delete', assetId: entry.asset.id },
          operationKey,
          libraryKeyRef.current,
        ));
      } catch (error) {
        if (!libraryMountedRef.current) return;
        onStatusRef.current(tr("本地副本已处理，但云端删除失败：{0}", tr(errorMessage(error))));
        return;
      }
    }
    if (libraryMountedRef.current) {
      onStatusRef.current(tr("“{0}”已从个人素材库删除。", entry.asset.name));
    }
  }, [ensureLibraryKey]);

  const exportAsset = useCallback((asset: LibraryAsset) => {
    try {
      const json = serializeLibraryAsset(asset);
      const safeName = asset.name.replace(/[^\w\u4e00-\u9fa5-]+/g, '_').slice(0, 30) || 'lily-asset';
      downloadJsonFile(`${safeName}-${asset.type}.json`, json);
      onStatusRef.current(tr("已导出“{0}”为 JSON 文件。", asset.name));
    } catch (error) {
      onStatusRef.current(tr("导出失败：{0}", tr(errorMessage(error))));
    }
  }, []);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((current) => (
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ));
  }, []);

  const exportCurrentPad = useCallback(() => {
    const name = assetName.trim() || `Pad ${selectedPadId} Pattern`;
    const id = createLibraryAssetId('pad');
    const asset = createUserPadAsset({ id, name, pad: workspace.pads[selectedPadId] });
    exportAsset(asset);
    setExportOpen(false);
  }, [assetName, exportAsset, selectedPadId, workspace.pads]);

  const exportCurrentWorkspace = useCallback(() => {
    const name = assetName.trim() || 'MusiCanvas Workspace';
    const id = createLibraryAssetId('workspace');
    const asset = createUserWorkspaceAsset({ id, name, workspace });
    exportAsset(asset);
    setExportOpen(false);
  }, [assetName, exportAsset, workspace]);

  const exportSelectedAssets = useCallback(() => {
    const chosen = personalEntries
      .map((entry) => entry.asset)
      .filter((asset) => selectedIds.includes(asset.id) && asset.type !== 'recipe');
    if (chosen.length === 0) {
      onStatusRef.current(tr("请先勾选要导出的素材。"));
      return;
    }
    if (chosen.length === 1) {
      exportAsset(chosen[0]);
      setExportOpen(false);
      return;
    }
    const bundle = {
      kind: 'gemidi.quad-lily-library-bundle',
      version: 1,
      exportedAt: new Date().toISOString(),
      totalCount: chosen.length,
      assets: chosen,
    };
    downloadJsonFile(`quad-lily-selected-${chosen.length}.json`, JSON.stringify(bundle, null, 2));
    onStatusRef.current(tr("已导出 {0} 个已选素材。", chosen.length));
    setExportOpen(false);
  }, [exportAsset, personalEntries, selectedIds]);

  const exportAllPersonalAssets = useCallback(() => {
    if (!localAssets.length) {
      onStatusRef.current(tr("当前素材库为空，没有可导出的素材。"));
      return;
    }
    const bundle = {
      kind: 'gemidi.quad-lily-library-bundle',
      version: 1,
      exportedAt: new Date().toISOString(),
      totalCount: localAssets.length,
      assets: localAssets,
    };
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadJsonFile(`quad-lily-library-backup-${dateStr}.json`, JSON.stringify(bundle, null, 2));
    onStatusRef.current(tr("已打包导出全部 {0} 个本地素材。", localAssets.length));
    setExportOpen(false);
  }, [localAssets]);

  const handleImportFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    // The file input is cleared immediately; preserve the live FileList before awaiting.
    const selectedFiles = Array.from(files);
    const repository = repositoryRef.current ?? new LocalStorageLibraryRepository(window.localStorage);
    repositoryRef.current = repository;

    let importedCount = 0;
    const errors: string[] = [];

    for (const file of selectedFiles) {
      try {
        const text = await file.text();
        const assets = parseImportedJsonText(text);
        for (const asset of assets) {
          repository.save(asset);
          importedCount++;
        }
      } catch (err) {
        errors.push(`${file.name}: ${errorMessage(err)}`);
      }
    }

    setLocalAssets(repository.list());
    if (importedCount > 0) {
      onStatusRef.current(tr("成功导入 {0} 个图案素材！已保存至本地素材库。", importedCount));
    }
    if (errors.length > 0) {
      onStatusRef.current(tr("部分文件导入失败：{0}", errors.join('; ')));
    }
  }, []);

  if (!open) return null;

  return (
    <div
      className="library-drawer-layer"
      onKeyDownCapture={event => {
        if (event.key === ' ') event.stopPropagation();
      }}
    >
      <button
        type="button"
        className="library-drawer-backdrop"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
      />
      <aside
        ref={drawerRef}
        className={`library-drawer ${isDraggingOver ? 'is-drag-over' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="library-drawer-title"
        aria-describedby="library-drawer-description"
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDraggingOver(false);
          void handleImportFiles(e.dataTransfer.files);
        }}
      >
        {drawerToast && (
          <div
            className={`library-toast library-toast--${drawerToast.tone}`}
            role="status"
            aria-live="polite"
          >
            {drawerToast.text}
          </div>
        )}
        <header className="library-drawer__header">
          <h2 id="library-drawer-title">SEED BANK</h2>
          <p id="library-drawer-description" className="library-visually-hidden">
            Save the current pad or the full set. Load patterns from your library or Pattern Plaza.
          </p>
          <div className="library-drawer__header-actions">
            <button
              type="button"
              className="library-action library-action--quiet library-density"
              aria-label={gridCols === 2 ? 'Switch to 3-column grid' : 'Switch to 2-column grid'}
              aria-pressed={gridCols === 3}
              onClick={toggleGridCols}
            >
              {gridCols === 2
                ? <LayoutGrid size={14} strokeWidth={2.2} aria-hidden />
                : <Grid3x3 size={14} strokeWidth={2.2} aria-hidden />}
            </button>
            <button
              ref={closeButtonRef}
              type="button"
              className="library-action library-action--quiet"
              aria-label={tr("关闭 Library")}
              onClick={onClose}
            >{tr("关闭")}</button>
          </div>
        </header>

        <section className="library-save" aria-label="Capture">
          <input
            aria-label={tr("素材名称")}
            value={assetName}
            maxLength={120}
            placeholder="Name"
            onChange={event => setAssetName(event.currentTarget.value)}
          />
          <div className="library-save__actions">
            <button
              type="button"
              className="library-action library-action--primary"
              disabled={saving}
              onClick={() => void saveAsset('pad')}
            >{tr("保存")}</button>
            <button
              type="button"
              className="library-action library-action--secondary"
              disabled={saving}
              onClick={() => void saveAsset('workspace')}
            >{tr("保存全部")}</button>
            <label className="library-action library-action--secondary library-import">
              <span>{tr("导入")}</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                multiple
                onChange={(e) => {
                  void handleImportFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
            <div className={`library-export ${exportOpen ? 'is-open' : ''}`}>
              <button
                type="button"
                className="library-action library-action--quiet"
                aria-expanded={exportOpen}
                aria-haspopup="menu"
                onClick={() => setExportOpen((openMenu) => !openMenu)}
              >{tr("导出 ▾")}</button>
              {exportOpen && (
                <div className="library-export__menu" role="menu">
                  <button type="button" role="menuitem" onClick={exportCurrentPad}>{tr("当前 Pad")}</button>
                  <button type="button" role="menuitem" onClick={exportCurrentWorkspace}>{tr("完整组合")}</button>
                  <button type="button" role="menuitem" onClick={exportSelectedAssets}>
                    {tr("已选")}{selectedIds.length ? ` (${selectedIds.length})` : ''}
                  </button>
                  <button type="button" role="menuitem" onClick={exportAllPersonalAssets}>{tr("全部备份")}</button>
                </div>
              )}
            </div>
          </div>
        </section>

        {!isAuthenticated && (
          <details className="library-key">
            <summary>
              <span className="library-section-label">LIBRARY KEY</span>
              <span>{cloudState === 'loading'
                ? 'SYNCING'
                : cloudState === 'error'
                  ? 'LOCAL ONLY'
                  : hasLocalOnlyAssets ? 'UNSYNCED' : 'READY'}</span>
            </summary>
            <p>{tr("它就是你的个人库凭证，换设备粘贴即可，请勿公开。替换前请先复制旧 Key；替换后旧云库不会自动合并，本地素材仍会保留。")}</p>
            <div className="library-key__controls">
              <input
                type="password"
                aria-label="Library Key"
                autoComplete="off"
                spellCheck={false}
                value={libraryKeyDraft}
                onChange={event => setLibraryKeyDraft(event.currentTarget.value)}
                placeholder="gml_…"
              />
              <button
                type="button"
                className="library-action library-action--secondary"
                aria-label={tr("复制 Library Key")}
                disabled={!libraryKey}
                onClick={() => void copyKey()}
              >{tr("复制")}</button>
              <button
                type="button"
                className="library-action library-action--secondary"
                aria-label={tr("替换 Library Key")}
                onClick={replaceKey}
              >{tr("替换")}</button>
            </div>
          </details>
        )}

        <nav className="library-tabs" role="tablist" aria-label={tr("素材库分类")}>
          <LibraryTabButton tab="mine" activeTab={activeTab} onSelect={setActiveTab}>{tr("我的素材")}</LibraryTabButton>
          <LibraryTabButton tab="patterns" activeTab={activeTab} onSelect={setActiveTab}>{tr("图案广场")}</LibraryTabButton>
          <LibraryTabButton tab="recipes" activeTab={activeTab} onSelect={setActiveTab}>{tr("常用模板")}</LibraryTabButton>
        </nav>

        <div className="library-drawer__body">
          <section
            id="library-panel-mine"
            role="tabpanel"
            aria-label={tr("我的素材")}
            hidden={activeTab !== 'mine'}
          >
            <PanelIntro
              label="MINE"
              text={tr("本地优先，离线可用。")}
            />

            <div className="library-mine-toolbar">
              <button
                type="button"
                className="library-action library-action--secondary"
                disabled={personalEntries.length === 0}
                onClick={exportAllPersonalAssets}
                title="Export all local assets as one JSON backup"
              >
                {tr("备份")}</button>
            </div>

            {cloudState === 'error' && (
              <div className="library-notice" role="status">
                <span>{tr("云端未连接：")}{tr(cloudError)}</span>
                <button type="button" onClick={() => void refreshCloud(libraryKey)}>{tr("重试")}</button>
              </div>
            )}
            {personalEntries.length > 0 ? (
              <div className="library-grid" style={{ '--library-grid-cols': String(gridCols) } as CSSProperties}>
                {personalEntries.map(entry => (
                  <LibraryAssetCard
                    key={`personal-${entry.asset.id}`}
                    entry={entry}
                    author={personalAuthor}
                    selectedPadId={selectedPadId}
                    selectable
                    selected={selectedIds.includes(entry.asset.id)}
                    onToggleSelect={() => toggleSelected(entry.asset.id)}
                    onLoad={loadAsset}
                    onSync={!isAuthenticated && isLocalOnlyEntry(entry)
                      ? () => void syncPersonalAsset(entry.asset)
                      : undefined}
                    onPublish={isAuthenticated && entry.asset.type !== 'recipe'
                      ? () => void publishPersonalAsset(entry.asset)
                      : undefined}
                    publishing={publishingId === entry.asset.id}
                    onDelete={() => void removePersonalAsset(entry)}
                  />
                ))}
              </div>
            ) : (
              <EmptyLibrary cloudState={cloudState} />
            )}
          </section>

          <section
            id="library-panel-patterns"
            role="tabpanel"
            aria-label={tr("图案广场")}
            hidden={activeTab !== 'patterns'}
          >
            <PanelIntro
              label="PLAZA"
              text="Factory templates and shared patterns."
            />
            {publicState === 'error' && (
              <div className="library-notice" role="status">
                <span>Pattern Plaza cloud feed is offline.</span>
                <button type="button" onClick={() => void refreshPublic()}>{tr("重试")}</button>
              </div>
            )}
            <div className="library-grid" style={{ '--library-grid-cols': String(gridCols) } as CSSProperties}>
              {open && activeTab === 'patterns' && <CanonStudyCards onLoad={loadAsset} onStatus={onStatus} />}
              {plazaEntries.map(entry => (
                <LibraryAssetCard
                  key={`${entry.origins[0]}-${entry.asset.id}`}
                  entry={entry}
                  author={entry.author ?? 'Factory'}
                  timestamp={entry.publishedAt ?? entry.asset.createdAt}
                  selectedPadId={selectedPadId}
                  onLoad={loadAsset}
                />
              ))}
            </div>
          </section>

          <section
            id="library-panel-recipes"
            role="tabpanel"
            aria-label={tr("常用模板")}
            hidden={activeTab !== 'recipes'}
          >
            <PanelIntro
              label="TEMPLATES"
              text="Arrangement recipes. Reference only."
            />
            <div className="library-grid" style={{ '--library-grid-cols': String(gridCols) } as CSSProperties}>
              {PUBLIC_RECIPE_TEMPLATES.map(asset => (
                <LibraryAssetCard
                  key={`factory-${asset.id}`}
                  entry={{ asset, origins: ['factory'], author: 'Factory' }}
                  author="Factory"
                  selectedPadId={selectedPadId}
                  onLoad={loadAsset}
                />
              ))}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

function LibraryTabButton({
  tab,
  activeTab,
  onSelect,
  children,
}: {
  tab: LibraryTab;
  activeTab: LibraryTab;
  onSelect(tab: LibraryTab): void;
  children: string;
}) {
  const moveFocus = (nextTab: LibraryTab) => {
    onSelect(nextTab);
    if (typeof document !== 'undefined') {
      document.getElementById(`library-tab-${nextTab}`)?.focus();
    }
  };

  return (
    <button
      type="button"
      role="tab"
      id={`library-tab-${tab}`}
      aria-controls={`library-panel-${tab}`}
      aria-selected={activeTab === tab}
      tabIndex={activeTab === tab ? 0 : -1}
      onClick={() => onSelect(tab)}
      onKeyDown={event => {
        const currentIndex = LIBRARY_TABS.indexOf(tab);
        let nextTab: LibraryTab | undefined;
        if (event.key === 'ArrowRight') {
          nextTab = LIBRARY_TABS[(currentIndex + 1) % LIBRARY_TABS.length];
        } else if (event.key === 'ArrowLeft') {
          nextTab = LIBRARY_TABS[(currentIndex - 1 + LIBRARY_TABS.length) % LIBRARY_TABS.length];
        } else if (event.key === 'Home') {
          nextTab = LIBRARY_TABS[0];
        } else if (event.key === 'End') {
          nextTab = LIBRARY_TABS[LIBRARY_TABS.length - 1];
        }
        if (!nextTab) return;
        event.preventDefault();
        moveFocus(nextTab);
      }}
    >{children}</button>
  );
}

function PanelIntro({ label, text }: { label: string; text: string }) {
  return (
    <div className="library-panel-intro">
      <span>{label}</span>
      <p>{text}</p>
    </div>
  );
}

function EmptyLibrary({ cloudState }: { cloudState: CloudState }) {
  const tr = useUiText();
  return (
    <div className="library-empty">
      <span aria-hidden="true">◇</span>
      <strong>{cloudState === 'loading' ? tr("读取中") : tr("还没有素材")}</strong>
      <p>{tr("命名后点保存，即可进入本地库。")}</p>
    </div>
  );
}

function LibraryAssetCard({
  entry,
  author,
  timestamp,
  selectedPadId,
  selectable,
  selected,
  onToggleSelect,
  onLoad,
  onSync,
  onPublish,
  publishing,
  onDelete,
}: {
  key?: string;
  entry: LibraryEntry;
  author?: string;
  timestamp?: string;
  selectedPadId: QuadPadId;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?(): void;
  onLoad(asset: LibraryAsset): void;
  onSync?(): void;
  onPublish?(): void;
  publishing?: boolean;
  onDelete?(): void;
}) {
  const tr = useUiText();
  const { asset } = entry;
  const typeLabel = asset.type === 'pad' ? 'PAD' : asset.type === 'workspace' ? 'SET' : 'TIP';
  const authorLabel = displayAuthorName(author ?? entry.author);
  const when = formatCardTimestamp(timestamp ?? entry.publishedAt ?? asset.updatedAt ?? asset.createdAt);
  const spec = asset.type === 'pad'
    ? `${asset.payload.pad.nodes.length}n · ${asset.payload.pad.intervalMs}ms`
    : asset.type === 'workspace'
      ? '4 PAD'
      : asset.payload.recipe.notation;
  return (
    <article
      className={`library-card${selected ? ' is-selected' : ''}`}
      data-library-asset={asset.id}
      data-asset-type={asset.type}
    >
      <header className="library-card__header">
        {selectable ? (
          <label className="library-card__check">
            <input
              type="checkbox"
              checked={Boolean(selected)}
              onChange={onToggleSelect}
              aria-label={tr("选择 {0}", asset.name)}
            />
          </label>
        ) : null}
        <span className="library-card__index">{typeLabel}</span>
        <span className="library-card__author" title={authorLabel}>{authorLabel}</span>
      </header>
      <LibrarySpatialPreview asset={asset} />
      <div className="library-card__copy">
        <h3>{entry.origins.includes('factory') ? tr(asset.name) : asset.name}</h3>
        <div className="library-card__meta">
          <span title={spec}>{spec}</span>
          {when ? <time className="library-card__when" dateTime={timestamp ?? asset.updatedAt}>{when}</time> : null}
        </div>
      </div>
      <footer className={`library-card__actions${onDelete ? ' library-card__actions--personal' : ''}`}>
        {asset.type === 'recipe' ? (
          <button type="button" disabled>{tr("仅参考")}</button>
        ) : (
          <button
            type="button"
            className="library-action library-action--primary"
            data-action="load"
            onClick={() => onLoad(asset)}
          >{asset.type === 'pad' ? tr("载入") : tr("载入全部")}</button>
        )}
        {onPublish && (
          <button
            type="button"
            className="library-action library-action--secondary"
            data-action="publish"
            disabled={publishing}
            onClick={onPublish}
          >{publishing ? tr("发布中…") : tr("发布")}</button>
        )}
        {onSync && (
          <button
            type="button"
            className="library-action library-action--secondary"
            onClick={onSync}
          >{tr("同步")}</button>
        )}
        {onDelete && (
          <button
            type="button"
            className="library-action library-action--danger"
            data-action="delete"
            onClick={onDelete}
          >{tr("删除")}</button>
        )}
      </footer>
    </article>
  );
}

function LibrarySpatialPreview({ asset }: { asset: LibraryAsset }) {
  const tr = useUiText();
  const label = tr("空间缩略图：{0}", asset.name);
  return (
    <svg
      className="library-card__preview"
      viewBox="0 0 100 68"
      role="img"
      aria-label={label}
      preserveAspectRatio="xMidYMid meet"
    >
      <title>{label}</title>
      <rect className="library-preview__frame" x="0.5" y="0.5" width="99" height="67" />
      {asset.type === 'pad' && <PadPreview pad={asset.payload.pad} />}
      {asset.type === 'workspace' && (
        <g className="library-preview__workspace">
          {QUAD_PAD_IDS.map((padId, index) => (
            <g
              key={padId}
              transform={`translate(${(index % 2) * 50} ${Math.floor(index / 2) * 34}) scale(.5)`}
            >
              <PadPreview pad={asset.payload.workspace.pads[padId]} />
            </g>
          ))}
          <line x1="50" y1="0" x2="50" y2="68" />
          <line x1="0" y1="34" x2="100" y2="34" />
        </g>
      )}
      {asset.type === 'recipe' && (
        <g className="library-preview__recipe">
          {asset.payload.recipe.steps.map((step, index) => {
            const width = 90 / Math.max(1, asset.payload.recipe.steps.length);
            return (
              <g key={step.id} transform={`translate(${5 + index * width} 15)`}>
                <rect x="1" y="1" width={Math.max(8, width - 4)} height={36} />
                <text x={width / 2 - 1} y="23" textAnchor="middle">{step.label.slice(0, 2)}</text>
              </g>
            );
          })}
          <text x="50" y="59" textAnchor="middle">{asset.payload.recipe.notation}</text>
        </g>
      )}
    </svg>
  );
}

function PadPreview({ pad }: { pad: QuadLilyPad }) {
  const model = buildPadLibraryPreviewModel(pad);
  return (
    <g className="library-preview__pad">
      <g transform="scale(1 .68)"><CanvasDecorationLayer decoration={pad.decoration} /></g>
      {model.formations.map((formation) => {
        const trailPoints = formation.trail.map((point) => `${point.x},${point.y}`).join(' ');
        const ringPoints = formation.memberRing.map((point) => `${point.x},${point.y}`).join(' ');
        return (
          <g
            key={formation.id}
            className="library-preview__formation"
            data-shape={formation.shape}
          >
            {formation.trail.length >= 2 ? (
              <polyline className="library-preview__formation-trail" points={trailPoints} />
            ) : null}
            {formation.memberRing.length >= 3 ? (
              <polyline className="library-preview__formation-ring" points={ringPoints} />
            ) : null}
            <g
              className="library-preview__hub"
              transform={`translate(${formation.center.x} ${formation.center.y})`}
            >
              <rect
                className="library-preview__hub-core"
                x="-1.5"
                y="-1.5"
                width="3"
                height="3"
                transform="rotate(45)"
              />
              <text className="library-preview__hub-label" y="0.9" textAnchor="middle">
                {formation.id}
              </text>
            </g>
          </g>
        );
      })}

      {model.freeEdges.map((edge, index) => (
        <line
          key={`free-edge-${index}`}
          className="library-preview__free-edge"
          x1={edge.from.x}
          y1={edge.from.y}
          x2={edge.to.x}
          y2={edge.to.y}
        />
      ))}

      {model.nodes.map((node) => (
        <g
          key={node.id}
          className="library-preview__node"
          data-center={node.isCenter || undefined}
          data-dual={node.dualNote || undefined}
          data-muted={node.muted || undefined}
          data-hidden={node.hidden || undefined}
        >
          <circle cx={node.x} cy={node.y} r={Math.max(2, node.range * 28)} />
          <rect
            x={node.x - (node.isCenter ? 2.4 : 1.6)}
            y={node.y - (node.isCenter ? 2.4 : 1.6)}
            width={node.isCenter ? 4.8 : 3.2}
            height={node.isCenter ? 4.8 : 3.2}
            data-center={node.isCenter || undefined}
          />
          {node.dualNote ? (
            <rect
              className="library-preview__dual"
              x={node.x + 1.1}
              y={node.y - 2.8}
              width="2.2"
              height="2.2"
            />
          ) : null}
        </g>
      ))}
    </g>
  );
}

function mergePersonalEntries(localAssets: LibraryAsset[], cloudAssets: LibraryAsset[]): LibraryEntry[] {
  const entries = new Map<string, LibraryEntry>();
  cloudAssets.forEach(asset => entries.set(asset.id, { asset, origins: ['cloud'] }));
  localAssets.forEach(asset => {
    const existing = entries.get(asset.id);
    entries.set(asset.id, {
      asset,
      origins: existing ? ['local', 'cloud'] : ['local'],
    });
  });
  return [...entries.values()].sort((left, right) => (
    right.asset.updatedAt.localeCompare(left.asset.updatedAt)
  ));
}

function factoryEntry(asset: LibraryAsset): LibraryEntry {
  return { asset, origins: ['factory'], author: 'Factory' };
}

function parsePublicCloudEntries(items: readonly CloudLibraryItem[]): LibraryEntry[] {
  return items.flatMap((item): LibraryEntry[] => {
    const assets = parseCloudAssets([item]);
    if (assets.length === 0) return [];
    const metadata = item.metadata;
    return [{
      asset: assets[0],
      origins: ['public'],
      author: metadata?.author,
      publishedAt: metadata?.publishedAt,
    }];
  });
}

function upsertPublicEntry(entries: LibraryEntry[], item: CloudLibraryItem): LibraryEntry[] {
  const parsed = parsePublicCloudEntries([item]);
  if (parsed.length === 0) return entries;
  const next = parsed[0];
  const without = entries.filter(entry => entry.asset.id !== next.asset.id);
  return [next, ...without];
}

function isLocalOnlyEntry({ origins }: LibraryEntry): boolean {
  return origins.includes('local') && !origins.includes('cloud');
}

function displayAuthorName(raw?: string): string {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) return 'You';
  if (trimmed.toLowerCase() === 'factory') return 'Factory';
  const at = trimmed.indexOf('@');
  return at > 0 ? trimmed.slice(0, at) : trimmed;
}

function formatCardTimestamp(iso?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${month}-${day} ${hour}:${minute}`;
}

function readGridCols(): LibraryGridCols {
  if (typeof window === 'undefined') return 2;
  try {
    return window.localStorage.getItem(LIBRARY_GRID_COLS_KEY) === '3' ? 3 : 2;
  } catch {
    return 2;
  }
}

function writeGridCols(cols: LibraryGridCols): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LIBRARY_GRID_COLS_KEY, String(cols));
  } catch {
    // 忽略配额或隐私模式
  }
}

function upsertAsset(assets: LibraryAsset[], asset: LibraryAsset): LibraryAsset[] {
  const existingIndex = assets.findIndex(candidate => candidate.id === asset.id);
  if (existingIndex < 0) return [asset, ...assets];
  return assets.map((candidate, index) => index === existingIndex ? asset : candidate);
}

function defaultAssetName(padId: QuadPadId, date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `Pad ${padId} · ${month}-${day} ${hour}:${minute}`;
}

function randomIdSegment(): string {
  const bytes = new Uint8Array(6);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(36).slice(2, 14);
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '未知错误。';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
