import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LIBRARY_ASSET_KIND,
  LIBRARY_ASSET_MAX_BYTES,
  LIBRARY_MAX_NODES_PER_PAD,
  createUserPadAsset,
  createUserWorkspaceAsset,
  isPlayableLibraryAsset,
  loadPadAssetIntoWorkspace,
  loadWorkspaceAsset,
  parseLibraryAsset,
  serializeLibraryAsset,
  type LibraryPadAsset,
} from '../quad/library/core.ts';
import {
  addLilyNode,
  createQuadLilyWorkspace,
  updateLilyNode,
  updateLilyPad,
} from '../quad/core.ts';

const FIXED_NOW = '2026-09-02T00:00:00.000Z';

test('creates and round-trips a strict user Pad asset without sharing mutable payload state', () => {
  let workspace = updateLilyPad(createQuadLilyWorkspace(), 'A', {
    intervalMs: 960,
    scaleKey: 'minorPentatonic',
    playing: true,
  });
  workspace = addLilyNode(workspace, 'A', {
    id: 'answer', x: 0.68, y: 0.5, range: 0.2, scaleStep: 3,
  });

  const asset = createUserPadAsset({
    id: 'user-call-response',
    name: 'Call / Response',
    description: 'A personal two-node phrase.',
    tags: ['personal', 'pendulum'],
    pad: workspace.pads.A,
    now: FIXED_NOW,
  });
  const restored = parseLibraryAsset(serializeLibraryAsset(asset));

  assert.equal(asset.kind, LIBRARY_ASSET_KIND);
  assert.equal(asset.version, 1);
  assert.equal(asset.type, 'pad');
  assert.equal(asset.capability, 'playable');
  assert.equal(asset.source, 'user');
  assert.equal(asset.createdAt, FIXED_NOW);
  assert.equal(asset.payload.pad.playing, true, 'capture preserves source state; loading applies transport safety');
  assert.deepEqual(restored, asset);
  assert.notEqual((restored as LibraryPadAsset).payload.pad, asset.payload.pad);
  assert.notEqual((restored as LibraryPadAsset).payload.pad.nodes, asset.payload.pad.nodes);
});

test('rejects wrong wrappers, unsupported versions and mismatched type/capability pairs', () => {
  const asset = createUserPadAsset({
    id: 'strict-wrapper', name: 'Strict Wrapper', pad: createQuadLilyWorkspace().pads.A, now: FIXED_NOW,
  });
  const valid = JSON.parse(serializeLibraryAsset(asset)) as Record<string, unknown>;
  const invalidDocuments = [
    { ...valid, kind: 'gemidi.some-other-document' },
    { ...valid, version: 2 },
    { ...valid, type: 'sample' },
    { ...valid, capability: 'recipe' },
    { ...valid, payload: null },
  ];

  invalidDocuments.forEach((document) => {
    assert.equal(parseLibraryAsset(JSON.stringify(document)), null);
  });
  assert.equal(parseLibraryAsset(valid), null, 'library documents cross the boundary as JSON text');
  assert.equal(parseLibraryAsset('{"kind":'), null);
});

test('enforces the 512 KiB UTF-8 document limit', () => {
  const asset = createUserPadAsset({
    id: 'size-limit', name: 'Size Limit', pad: createQuadLilyWorkspace().pads.A, now: FIXED_NOW,
  });
  const document = JSON.parse(serializeLibraryAsset(asset)) as Record<string, unknown>;
  document.description = '荷'.repeat(LIBRARY_ASSET_MAX_BYTES);

  assert.equal(parseLibraryAsset(JSON.stringify(document)), null);
});

test('rejects too many nodes, an unknown scaleKey and a Pad without exactly one center', () => {
  const asset = createUserPadAsset({
    id: 'guardrails', name: 'Guardrails', pad: createQuadLilyWorkspace().pads.A, now: FIXED_NOW,
  });
  const base = JSON.parse(serializeLibraryAsset(asset)) as {
    payload: { pad: { nodes: Array<Record<string, unknown>>; scaleKey: string } };
  };

  const tooMany = structuredClone(base);
  tooMany.payload.pad.nodes = [
    tooMany.payload.pad.nodes[0],
    ...Array.from({ length: LIBRARY_MAX_NODES_PER_PAD }, (_, index) => ({
      id: `node-${index}`, x: 0.5, y: 0.5, range: 0.1, scaleStep: index, isCenter: false,
    })),
  ];
  assert.equal(parseLibraryAsset(JSON.stringify(tooMany)), null);

  const badScale = structuredClone(base);
  badScale.payload.pad.scaleKey = 'unknown-scale';
  assert.equal(parseLibraryAsset(JSON.stringify(badScale)), null);

  const noCenter = structuredClone(base);
  noCenter.payload.pad.nodes[0].isCenter = false;
  assert.equal(parseLibraryAsset(JSON.stringify(noCenter)), null);

  const twoCenters = structuredClone(base);
  twoCenters.payload.pad.nodes.push({
    id: 'second-center', x: 0.4, y: 0.4, range: 0.2, scaleStep: 0, isCenter: true,
  });
  assert.equal(parseLibraryAsset(JSON.stringify(twoCenters)), null);
});

test('delegates DRAW path normalization to the existing workspace parser', () => {
  let workspace = createQuadLilyWorkspace();
  workspace = updateLilyNode(workspace, 'A', 'center', {
    motion: {
      mode: 'draw',
      path: [
        { phase: 1.4, dx: 2, dy: -2 },
        { phase: 0.25, dx: 0.1, dy: 0.2 },
      ],
    },
  });
  const asset = createUserPadAsset({
    id: 'draw-parser', name: 'Draw Parser', pad: workspace.pads.A, now: FIXED_NOW,
  });
  const restored = parseLibraryAsset(serializeLibraryAsset(asset)) as LibraryPadAsset;
  const motion = restored.payload.pad.nodes[0].motion;

  assert.equal(motion?.mode, 'draw');
  if (motion?.mode !== 'draw') return;
  assert.deepEqual(motion.path, [
    { phase: 0.25, dx: 0.1, dy: 0.2 },
    { phase: 1, dx: 1, dy: -1 },
  ]);
});

test('loads a Pad asset into any target Pad while preserving the other Pads', () => {
  let source = updateLilyPad(createQuadLilyWorkspace(), 'A', {
    playing: true,
    intervalMs: 840,
    rootMidi: 65,
  });
  source = addLilyNode(source, 'A', {
    id: 'motif', x: 0.65, y: 0.5, range: 0.18, scaleStep: 4,
  });
  source = updateLilyPad(source, 'A', { locked: true });
  const asset = createUserPadAsset({
    id: 'remap-me', name: 'Remap Me', pad: source.pads.A, now: FIXED_NOW,
  });
  const target = createQuadLilyWorkspace();
  const originalA = structuredClone(target.pads.A);

  const loaded = loadPadAssetIntoWorkspace(target, asset, 'C');

  assert.deepEqual(loaded.pads.A, originalA);
  assert.equal(loaded.pads.C.id, 'C');
  assert.equal(loaded.pads.C.intervalMs, 840);
  assert.equal(loaded.pads.C.rootMidi, 65);
  assert.equal(loaded.pads.C.playing, false);
  assert.equal(loaded.pads.C.locked, true);
  assert.deepEqual(loaded.pads.C.nodes.map(node => node.id), ['center', 'motif']);
  assert.notEqual(loaded.pads.C.nodes, asset.payload.pad.nodes);
});

test('loads a Workspace asset with master and all Pad transports stopped', () => {
  const playing = createQuadLilyWorkspace();
  playing.masterPlaying = true;
  Object.values(playing.pads).forEach((pad) => { pad.playing = true; });
  const asset = createUserWorkspaceAsset({
    id: 'whole-scene', name: 'Whole Scene', workspace: playing, now: FIXED_NOW,
  });

  const loaded = loadWorkspaceAsset(asset);

  assert.equal(loaded.masterPlaying, false);
  assert.equal(Object.values(loaded.pads).some(pad => pad.playing), false);
  assert.equal(asset.payload.workspace.masterPlaying, true, 'loading must not mutate the saved asset');
  assert.equal(Object.values(asset.payload.workspace.pads).every(pad => pad.playing), true);
});

test('marks only playable Pad and Workspace assets as loadable', async () => {
  const { PUBLIC_RECIPE_TEMPLATES } = await import('../quad/library/templates.ts');
  const pad = createUserPadAsset({
    id: 'playable', name: 'Playable', pad: createQuadLilyWorkspace().pads.A, now: FIXED_NOW,
  });

  assert.equal(isPlayableLibraryAsset(pad), true);
  assert.equal(isPlayableLibraryAsset(PUBLIC_RECIPE_TEMPLATES[0]), false);
  assert.throws(
    () => loadPadAssetIntoWorkspace(createQuadLilyWorkspace(), PUBLIC_RECIPE_TEMPLATES[0] as never, 'A'),
    /playable Pad asset/,
  );
});

test('round-trips formations and dual-note endpointPitch inside Pad assets', () => {
  let workspace = addLilyNode(createQuadLilyWorkspace(), 'A', {
    id: 'orbit-a', x: 0.62, y: 0.5, range: 0.16, scaleStep: 2,
  });
  workspace = updateLilyNode(workspace, 'A', 'orbit-a', {
    endpointPitch: { bStep: 5 },
  });
  workspace = updateLilyPad(workspace, 'A', {
    formations: [{
      id: 'G1',
      nodeIds: ['center', 'orbit-a'],
      shape: 'circle',
      centerX: 0.5,
      centerY: 0.5,
      radius: 0.14,
      rateCycles: 4,
      phaseOffset: 0,
      direction: 1,
    }],
  });

  const asset = createUserPadAsset({
    id: 'formation-dual',
    name: 'Formation Dual',
    pad: workspace.pads.A,
    now: FIXED_NOW,
  });
  const restored = parseLibraryAsset(serializeLibraryAsset(asset)) as LibraryPadAsset;

  assert.equal(restored.payload.pad.formations?.length, 1);
  assert.equal(restored.payload.pad.formations?.[0]?.id, 'G1');
  assert.equal(restored.payload.pad.formations?.[0]?.shape, 'circle');
  const dualNode = restored.payload.pad.nodes.find((node) => node.id === 'orbit-a');
  assert.equal(dualNode?.endpointPitch?.bStep, 5);
});
