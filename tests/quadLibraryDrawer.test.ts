import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

import { createQuadLilyWorkspace } from '../quad/core.ts';
import { createUserPadAsset, serializeLibraryAsset } from '../quad/library/core.ts';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));

async function loadDrawer() {
  const vite = await createServer({
    root: projectRoot,
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });
  try {
    const module = await vite.ssrLoadModule('/quad/library/LibraryDrawer.tsx');
    return {
      LibraryDrawer: module.LibraryDrawer as React.ComponentType<{
        open: boolean;
        workspace: ReturnType<typeof createQuadLilyWorkspace>;
        selectedPadId: 'A';
        onClose(): void;
        onLoadAsset(asset: unknown): void;
        onStatus(message: string): void;
        isAuthenticated?: boolean;
        identityEmail?: string;
        isDirty?: boolean;
      }>,
      createLibraryAssetId: module.createLibraryAssetId as (
        type: 'pad' | 'workspace',
        now: number,
        random: string,
      ) => string,
      persistLibraryAssetLocalFirst: module.persistLibraryAssetLocalFirst as (
        asset: ReturnType<typeof createUserPadAsset>,
        ports: {
          saveLocal(asset: ReturnType<typeof createUserPadAsset>): ReturnType<typeof createUserPadAsset>;
          saveCloud(asset: ReturnType<typeof createUserPadAsset>): Promise<void>;
        },
      ) => Promise<{ asset: ReturnType<typeof createUserPadAsset>; cloudStatus: 'synced' | 'failed'; error?: unknown }>,
      persistLibraryAssetWithKeyLocalFirst: module.persistLibraryAssetWithKeyLocalFirst as (
        asset: ReturnType<typeof createUserPadAsset>,
        ports: {
          saveLocal(asset: ReturnType<typeof createUserPadAsset>): ReturnType<typeof createUserPadAsset>;
          getCloudKey(): string;
          saveCloud(asset: ReturnType<typeof createUserPadAsset>, key: string): Promise<void>;
        },
      ) => Promise<{
        asset: ReturnType<typeof createUserPadAsset>;
        cloudStatus: 'synced' | 'failed';
        cloudKey?: string;
        error?: unknown;
      }>,
      reconcileCloudMutation: module.reconcileCloudMutation as (
        assets: ReturnType<typeof createUserPadAsset>[],
        mutation: { type: 'upsert'; asset: ReturnType<typeof createUserPadAsset> } | { type: 'delete'; assetId: string },
        operationKey: string,
        currentKey: string,
      ) => ReturnType<typeof createUserPadAsset>[],
      parseCloudAssets: module.parseCloudAssets as (items: unknown[]) => ReturnType<typeof createUserPadAsset>[],
      close: () => vite.close(),
    };
  } catch (error) {
    await vite.close();
    throw error;
  }
}

test('renders the accessible SEED BANK shell and its three library workflows', async () => {
  const { LibraryDrawer, close } = await loadDrawer();
  try {
    const markup = renderToStaticMarkup(React.createElement(LibraryDrawer, {
      open: true,
      workspace: createQuadLilyWorkspace(),
      selectedPadId: 'A',
      onClose: () => undefined,
      onLoadAsset: () => undefined,
      onStatus: () => undefined,
    }));

    assert.match(markup, /role="dialog"/);
    assert.match(markup, /aria-modal="true"/);
    assert.match(markup, /SEED BANK/);
    assert.match(markup, /aria-label="关闭 Library"/);
    assert.match(markup, /role="tab"[^>]*>我的素材</);
    assert.match(markup, /role="tab"[^>]*>图案广场</);
    assert.match(markup, /role="tab"[^>]*>常用模板</);
    assert.match(markup, /aria-label="素材名称"/);
    assert.match(markup, />保存</);
    assert.match(markup, />保存全部</);
    assert.match(markup, />导入</);
    assert.match(markup, />导出 ▾</);
    assert.match(markup, /Switch to 3-column grid/);
    assert.doesNotMatch(markup, /LOCAL FIRST/);
    assert.doesNotMatch(markup, /公共 Pattern/);
    assert.doesNotMatch(markup, /编曲配方/);
    assert.match(markup, /个人库凭证/);
    assert.match(markup, /换设备粘贴即可/);
    assert.match(markup, /请勿公开/);
    assert.match(markup, /aria-label="复制 Library Key"/);
    assert.match(markup, /aria-label="替换 Library Key"/);
  } finally {
    await close();
  }
});

test('hides the Library Key when the session is authenticated', async () => {
  const { LibraryDrawer, close } = await loadDrawer();
  try {
    const markup = renderToStaticMarkup(React.createElement(LibraryDrawer, {
      open: true,
      workspace: createQuadLilyWorkspace(),
      selectedPadId: 'A',
      isAuthenticated: true,
      identityEmail: 'ada@example.com',
      onClose: () => undefined,
      onLoadAsset: () => undefined,
      onStatus: () => undefined,
    }));

    assert.doesNotMatch(markup, /LIBRARY KEY/);
    assert.doesNotMatch(markup, /个人库凭证/);
    assert.match(markup, />图案广场</);
  } finally {
    await close();
  }
});

test('load confirms only through the unsaved-changes English prompt', () => {
  const source = readFileSync(`${projectRoot}/quad/library/LibraryDrawer.tsx`, 'utf8');
  assert.match(source, /Load this pattern\? Unsaved changes to the current pad may be lost\./);
  assert.match(source, /isDirty/);
});

test('renders nothing while the Library is closed', async () => {
  const { LibraryDrawer, close } = await loadDrawer();
  try {
    const markup = renderToStaticMarkup(React.createElement(LibraryDrawer, {
      open: false,
      workspace: createQuadLilyWorkspace(),
      selectedPadId: 'A',
      onClose: () => undefined,
      onLoadAsset: () => undefined,
      onStatus: () => undefined,
    }));

    assert.equal(markup, '');
  } finally {
    await close();
  }
});

test('renders factory spatial specimens while recipes remain explicitly non-loadable', async () => {
  const { LibraryDrawer, close } = await loadDrawer();
  try {
    const markup = renderToStaticMarkup(React.createElement(LibraryDrawer, {
      open: true,
      workspace: createQuadLilyWorkspace(),
      selectedPadId: 'A',
      onClose: () => undefined,
      onLoadAsset: () => undefined,
      onStatus: () => undefined,
    }));

    assert.match(markup, />PLAZA</);
    assert.match(markup, />Factory</);
    assert.match(markup, /<svg[^>]*role="img"[^>]*aria-label="空间缩略图：/);
    assert.match(markup, /Fixed Spine/);
    assert.match(markup, /ABAC Form/);
    assert.match(markup, /仅参考/);
    assert.doesNotMatch(markup, /data-library-asset="recipe-abac-form"[^>]*data-action="load"/);
  } finally {
    await close();
  }
});

test('focus trap excludes every control nested inside an inactive hidden panel', () => {
  const source = readFileSync(`${projectRoot}/quad/library/LibraryDrawer.tsx`, 'utf8');
  assert.match(source, /!element\.closest\('\[hidden\]'\)/);
});

test('the roving Library tabs support Arrow, Home and End keyboard navigation', () => {
  const source = readFileSync(`${projectRoot}/quad/library/LibraryDrawer.tsx`, 'utf8');
  assert.match(source, /ArrowRight/);
  assert.match(source, /ArrowLeft/);
  assert.match(source, /Home/);
  assert.match(source, /End/);
});

test('Escape closes the Library without reaching the background DRAW shortcut', () => {
  const source = readFileSync(`${projectRoot}/quad/library/LibraryDrawer.tsx`, 'utf8');
  assert.match(source, /event\.key === 'Escape'[\s\S]{0,180}event\.stopPropagation\(\)[\s\S]{0,180}onCloseRef\.current\(\)/);
});

test('cloud mutations cannot commit component state after the Drawer unmounts', () => {
  const source = readFileSync(`${projectRoot}/quad/library/LibraryDrawer.tsx`, 'utf8');
  assert.match(source, /libraryMountedRef/);
  assert.ok((source.match(/if \(!libraryMountedRef\.current\) return/g) ?? []).length >= 3);
});

test('cloud refresh aborts the previous request and the active request on unmount', () => {
  const source = readFileSync(`${projectRoot}/quad/library/LibraryDrawer.tsx`, 'utf8');
  assert.match(source, /cloudAbortRef\.current\?\.abort\(\)/);
  assert.match(source, /return \(\) => cloudAbortRef\.current\?\.abort\(\)/);
});

test('creates cloud-compatible personal ids independently from long display names', async () => {
  const { createLibraryAssetId, close } = await loadDrawer();
  try {
    const padId = createLibraryAssetId('pad', 1_725_234_567_890, 'ABC.def/very-long-random-input');
    const workspaceId = createLibraryAssetId('workspace', 1_725_234_567_890, 'seed');

    assert.match(padId, /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);
    assert.match(workspaceId, /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);
    assert.ok(padId.length <= 64);
    assert.ok(workspaceId.length <= 64);
    assert.match(padId, /^user-pad-/);
    assert.match(workspaceId, /^user-scene-/);
  } finally {
    await close();
  }
});

test('saves locally before cloud sync and keeps the local asset when cloud fails', async () => {
  const { persistLibraryAssetLocalFirst, close } = await loadDrawer();
  try {
    const workspace = createQuadLilyWorkspace();
    const asset = createUserPadAsset({
      id: 'user-pad-test',
      name: 'Local first',
      pad: workspace.pads.A,
      now: '2026-09-02T10:00:00.000Z',
    });
    const calls: string[] = [];

    const result = await persistLibraryAssetLocalFirst(asset, {
      saveLocal(candidate) {
        calls.push(`local:${candidate.id}`);
        return candidate;
      },
      async saveCloud(candidate) {
        calls.push(`cloud:${candidate.id}`);
        throw new Error('offline');
      },
    });

    assert.deepEqual(calls, ['local:user-pad-test', 'cloud:user-pad-test']);
    assert.equal(result.asset.id, asset.id);
    assert.equal(result.cloudStatus, 'failed');
    assert.match(String(result.error), /offline/);
  } finally {
    await close();
  }
});

test('a Cloud Key initialization failure still leaves the asset saved locally', async () => {
  const { persistLibraryAssetWithKeyLocalFirst, close } = await loadDrawer();
  try {
    const workspace = createQuadLilyWorkspace();
    const asset = createUserPadAsset({
      id: 'user-pad-key-failure',
      name: 'Still local',
      pad: workspace.pads.A,
      now: '2026-09-02T10:00:00.000Z',
    });
    const calls: string[] = [];

    const result = await persistLibraryAssetWithKeyLocalFirst(asset, {
      saveLocal(candidate) {
        calls.push('local');
        return candidate;
      },
      getCloudKey() {
        calls.push('key');
        throw new Error('key storage unavailable');
      },
      async saveCloud() {
        calls.push('cloud');
      },
    });

    assert.deepEqual(calls, ['local', 'key']);
    assert.equal(result.asset.id, asset.id);
    assert.equal(result.cloudStatus, 'failed');
    assert.match(String(result.error), /key storage unavailable/);
  } finally {
    await close();
  }
});

test('a completed mutation cannot alter the visible cloud library after the Key changes', async () => {
  const { reconcileCloudMutation, close } = await loadDrawer();
  try {
    const workspace = createQuadLilyWorkspace();
    const oldAsset = createUserPadAsset({
      id: 'user-pad-old', name: 'Old', pad: workspace.pads.A, now: '2026-09-02T10:00:00.000Z',
    });
    const newAsset = createUserPadAsset({
      id: 'user-pad-new', name: 'New', pad: workspace.pads.A, now: '2026-09-02T10:01:00.000Z',
    });
    const current = [newAsset];

    assert.equal(reconcileCloudMutation(
      current, { type: 'upsert', asset: oldAsset }, 'gml_key_1', 'gml_key_2',
    ), current);
    assert.equal(reconcileCloudMutation(
      current, { type: 'delete', assetId: newAsset.id }, 'gml_key_1', 'gml_key_2',
    ), current);
    assert.deepEqual(reconcileCloudMutation(
      current, { type: 'upsert', asset: oldAsset }, 'gml_key_2', 'gml_key_2',
    ).map(asset => asset.id), [oldAsset.id, newAsset.id]);
  } finally {
    await close();
  }
});

test('local-only cards expose an explicit retry sync action', () => {
  const source = readFileSync(`${projectRoot}/quad/library/LibraryDrawer.tsx`, 'utf8');
  assert.match(source, />同步</);
  assert.match(source, /origins\.includes\('local'\)[\s\S]*!origins\.includes\('cloud'\)/);
});

test('the Key replacement warns that old cloud content will not merge while LOCAL assets remain', () => {
  const source = readFileSync(`${projectRoot}/quad/library/LibraryDrawer.tsx`, 'utf8');
  assert.match(source, /替换前请先复制旧 Key/);
  assert.match(source, /旧云库不会自动合并/);
  assert.match(source, /本地素材仍会保留/);
  assert.match(source, /window\.confirm/);
});

test('the Library surfaces an UNSYNCED state when a LOCAL asset has no cloud copy', () => {
  const source = readFileSync(`${projectRoot}/quad/library/LibraryDrawer.tsx`, 'utf8');
  assert.match(source, /hasLocalOnlyAssets/);
  assert.match(source, /UNSYNCED/);
});

test('short viewports scroll the complete Drawer and recipe steps remain legible', () => {
  const css = readFileSync(`${projectRoot}/quad/library/library.css`, 'utf8');
  assert.match(css, /@media \(max-height: 760px\)[\s\S]*\.library-drawer\s*\{[\s\S]*overflow-y:\s*auto/);
  assert.match(css, /\.library-card__recipe-steps li p\s*\{[\s\S]*font-size:\s*\.74rem/);
  assert.match(css, /\.library-card__recipe-steps li p\s*\{[\s\S]*line-height:\s*1\.5/);
});

test('validates cloud item data through the text-only Library parser', async () => {
  const { parseCloudAssets, close } = await loadDrawer();
  try {
    const workspace = createQuadLilyWorkspace();
    const asset = createUserPadAsset({
      id: 'user-pad-cloud',
      name: 'Cloud specimen',
      pad: workspace.pads.A,
      now: '2026-09-02T10:00:00.000Z',
    });
    const cloudItem = {
      schemaVersion: 1,
      id: asset.id,
      name: asset.name,
      kind: 'pattern',
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
      data: JSON.parse(serializeLibraryAsset(asset)),
    };

    assert.deepEqual(parseCloudAssets([cloudItem]).map(candidate => candidate.id), [asset.id]);
    assert.deepEqual(parseCloudAssets([{ ...cloudItem, data: { invalid: true } }]), []);
  } finally {
    await close();
  }
});
