import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));

test('quad toolbars are opt-in while single-pad controls remain available', async () => {
  const vite = await createServer({ root: projectRoot, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  try {
    const { QuadLilyCanvas } = await vite.ssrLoadModule('/quad/QuadLilyCanvas.tsx');
    const noop = () => undefined;
    const props = {
      pads: ['A', 'B', 'C', 'D'].map((id, index) => ({
        id, intervalMs: 750, playing: false, locked: id === 'D', selected: id === 'A',
        cyclePhase: 0, midiChannel: index + 1, nodes: [],
      })),
      onSelectPad: noop, onAddNode: noop, onNodePointerDown: noop, onDeleteNode: noop,
      onTogglePlaying: noop, onToggleLocked: noop, onSavePad: noop, onClearPad: noop,
      onSetSoundPreset: noop, onSetPadMidiChannel: noop, onToggleInfo: noop,
    };
    const render = (extra = {}) => renderToStaticMarkup(React.createElement(QuadLilyCanvas, { ...props, ...extra }));
    const original = render();
    assert.doesNotMatch(original, /role="toolbar"/);
    assert.doesNotMatch(original, /aria-label="保存 Pad/);
    const expanded = render({ showQuadToolbar: true });
    assert.equal((expanded.match(/role="toolbar"/g) ?? []).length, 4);
    assert.match(expanded, /data-quad-toolbar="true"/);
    for (const id of ['A', 'B', 'C', 'D']) {
      for (const action of ['播放', '保存', '清空']) assert.match(expanded, new RegExp(`aria-label="${action} Pad ${id}"`));
      assert.match(expanded, new RegExp(`aria-label="Pad ${id} Sound preset"`));
      assert.match(expanded, new RegExp(`aria-label="Pad ${id} MIDI channel"`));
    }
    assert.match(expanded, /aria-label="清空 Pad D"[^>]*disabled/);
    assert.doesNotMatch(expanded, /class="quad-lily-pad__hud"/);
    const single = render({ layout: 'single', showQuadToolbar: false });
    assert.match(single, /role="toolbar"/);
    assert.doesNotMatch(single, /data-quad-toolbar="true"/);
  } finally { await vite.close(); }
});

test('renders four directly editable Lily Pad quadrants with local play and lock controls', async () => {
  const vite = await createServer({
    root: projectRoot,
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });

  try {
    const { QuadLilyCanvas } = await vite.ssrLoadModule('/quad/QuadLilyCanvas.tsx');
    const padIds = ['A', 'B', 'C', 'D'] as const;
    const pads = padIds.map((id, index) => ({
      id,
      intervalMs: 700 + index * 100,
      playing: index % 2 === 0,
      locked: id === 'D',
      selected: id === 'A',
      cyclePhase: index / 4,
      activeNodeIds: index === 0 ? ['center'] : [],
      selectedNodeId: index === 0 ? 'node-1' : null,
      nodePresentations: index === 0 ? new Map([
        ['center', { shortId: 'ROOT', noteName: 'C4', midiNote: 60 }],
        ['node-1', { shortId: 'N1', noteName: 'E4', midiNote: 64 }],
      ]) : undefined,
      motionRenderStates: index === 0 ? [{
        nodeId: 'node-1',
        mode: 'orbit' as const,
        base: { x: 0.7, y: 0.4 },
        current: { x: 0.8, y: 0.4 },
        trail: [{ x: 0.8, y: 0.4 }, { x: 0.7, y: 0.5 }, { x: 0.6, y: 0.4 }],
        drawStatus: 'idle' as const,
      }] : [],
      nodes: [
        { id: 'center', x: 0.5, y: 0.5, range: 0.225, scaleStep: 0, isCenter: true },
        { id: 'node-1', x: 0.7, y: 0.4, range: 0.225, scaleStep: index + 1, isCenter: false },
      ],
    }));

    const markup = renderToStaticMarkup(React.createElement(QuadLilyCanvas, {
      pads,
      mobilePadId: 'A',
      showNodeLabels: true,
      onSelectPad: () => undefined,
      onAddNode: () => undefined,
      onNodePointerDown: () => undefined,
      onDeleteNode: () => undefined,
      onTogglePlaying: () => undefined,
      onToggleLocked: () => undefined,
    }));

    assert.match(markup, /class="quad-lily-canvas/);
    assert.match(markup, /aria-label="四组 Lily Pad 舞台"/);
    assert.equal((markup.match(/data-pad-id="[A-D]"/g) ?? []).length, 4);
    assert.equal((markup.match(/<svg/g) ?? []).length, 4);
    assert.match(markup, /class="quad-lily-motion__trail"/);
    assert.match(markup, /class="quad-lily-motion__anchor"/);
    assert.match(markup, /class="quad-lily-motion__tether"/);
    assert.match(markup, /data-motion-mode="orbit"/);
    assert.match(markup, /class="quad-lily-node__badge-id"[^>]*>1<\/tspan>/);
    assert.match(markup, /class="quad-lily-node__badge-note"[^>]*>E4<\/tspan>/);

    for (const id of padIds) {
      assert.match(markup, new RegExp(`data-pad-id="${id}"`));
      assert.match(markup, new RegExp(`aria-label="选择 Pad ${id}"`));
      assert.match(markup, new RegExp(`aria-label="${id === 'A' || id === 'C' ? '暂停' : '播放'} Pad ${id}"`));
      assert.match(markup, new RegExp(`aria-label="${id === 'D' ? '解锁' : '锁定'} Pad ${id}"`));
      assert.match(markup, new RegExp(`aria-label="编辑 Pad ${id} 的 Lily Pad"`));
    }
  } finally {
    await vite.close();
  }
});

test('can hide visual node labels without removing their accessible identity', async () => {
  const vite = await createServer({
    root: projectRoot,
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });

  try {
    const { QuadLilyCanvas } = await vite.ssrLoadModule('/quad/QuadLilyCanvas.tsx');
    const markup = renderToStaticMarkup(React.createElement(QuadLilyCanvas, {
      pads: [{
        id: 'A', intervalMs: 700, playing: false, locked: false, selected: true, cyclePhase: 0,
        selectedNodeId: 'node-1',
        nodePresentations: new Map([['node-1', { shortId: 'N1', noteName: 'E4', midiNote: 64 }]]),
        nodes: [{ id: 'node-1', x: 0.5, y: 0.5, range: 0.2, scaleStep: 2, isCenter: false }],
      }],
      showNodeLabels: false,
      mobilePadId: 'A',
      onSelectPad: () => undefined,
      onAddNode: () => undefined,
      onNodePointerDown: () => undefined,
      onDeleteNode: () => undefined,
      onTogglePlaying: () => undefined,
      onToggleLocked: () => undefined,
    }));

    assert.doesNotMatch(markup, /class="quad-lily-node__badge-label"/);
    assert.match(markup, /aria-label="A N1，音符 E4/);
  } finally {
    await vite.close();
  }
});

test('single-pad node identity is embedded inside the square badge instead of floating beside it', async () => {
  const vite = await createServer({
    root: projectRoot,
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });

  try {
    const { QuadLilyCanvas } = await vite.ssrLoadModule('/quad/QuadLilyCanvas.tsx');
    const markup = renderToStaticMarkup(React.createElement(QuadLilyCanvas, {
      pads: [{
        id: 'A', intervalMs: 700, playing: false, locked: false, selected: true, cyclePhase: 0,
        selectedNodeId: 'node-1',
        nodePresentations: new Map([
          ['center', { shortId: 'ROOT', noteName: 'C4', midiNote: 60 }],
          ['node-1', { shortId: 'N1', noteName: 'E4', midiNote: 64 }],
        ]),
        nodes: [
          { id: 'center', x: 0.4, y: 0.5, range: 0.2, scaleStep: 0, isCenter: true },
          { id: 'node-1', x: 0.6, y: 0.5, range: 0.2, scaleStep: 2, isCenter: false },
        ],
      }],
      layout: 'single',
      showNodeLabels: true,
      mobilePadId: 'A',
      onSelectPad: () => undefined,
      onAddNode: () => undefined,
      onNodePointerDown: () => undefined,
      onDeleteNode: () => undefined,
      onTogglePlaying: () => undefined,
      onToggleLocked: () => undefined,
    }));

    assert.match(markup, /data-label-density="detail"/);
    assert.match(markup, /class="quad-lily-node__badge"/);
    assert.match(markup, /class="quad-lily-node__badge-id"[^>]*>N1<\/tspan>/);
    assert.match(markup, /class="quad-lily-node__badge-note"[^>]*>E4<\/tspan>/);
    assert.match(markup, /class="quad-lily-node__badge-id"[^>]*>ROOT<\/tspan>/);
    assert.match(markup, /class="quad-lily-node__badge-note"[^>]*>C4<\/tspan>/);
    assert.doesNotMatch(markup, /class="quad-lily-node__label"[^>]*x="4\.7"[^>]*y="-4\.8"/,
      '编号和音名不能继续漂浮在节点外侧');
  } finally {
    await vite.close();
  }
});

test('draws only the directed propagation edges supplied by the shared cycle compilation', async () => {
  const vite = await createServer({
    root: projectRoot,
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });

  try {
    const { QuadLilyCanvas } = await vite.ssrLoadModule('/quad/QuadLilyCanvas.tsx');
    const markup = renderToStaticMarkup(React.createElement(QuadLilyCanvas, {
      pads: [{
        id: 'A',
        intervalMs: 800,
        playing: true,
        locked: false,
        selected: true,
        cyclePhase: 0.25,
        activeNodeIds: [],
        selectedNodeId: 'center',
        nodes: [
          { id: 'center', x: 0.5, y: 0.5, range: 0.05, scaleStep: 0, isCenter: true },
          { id: 'reachable', x: 0.54, y: 0.5, range: 0.05, scaleStep: 1, isCenter: false },
          { id: 'misleading', x: 0.75, y: 0.5, range: 0.3, scaleStep: 2, isCenter: false },
        ],
        cycleCompilation: {
          edges: [{ fromId: 'center', toId: 'reachable' }],
        },
      }],
      mobilePadId: 'A',
      onSelectPad: () => undefined,
      onAddNode: () => undefined,
      onNodePointerDown: () => undefined,
      onDeleteNode: () => undefined,
      onTogglePlaying: () => undefined,
      onToggleLocked: () => undefined,
    }));

    assert.match(markup, /data-from-node-id="center"/);
    assert.match(markup, /data-to-node-id="reachable"/);
    assert.doesNotMatch(markup, /data-to-node-id="misleading"/);
  } finally {
    await vite.close();
  }
});

test('exposes muted / hidden node state and the selected canvas background to CSS', async () => {
  const vite = await createServer({
    root: projectRoot,
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });

  try {
    const { QuadLilyCanvas } = await vite.ssrLoadModule('/quad/QuadLilyCanvas.tsx');
    const markup = renderToStaticMarkup(React.createElement(QuadLilyCanvas, {
      pads: [{
        id: 'A',
        intervalMs: 700,
        playing: false,
        locked: false,
        selected: true,
        cyclePhase: 0,
        selectedNodeId: 'muted-node',
        nodes: [
          { id: 'center', x: 0.5, y: 0.5, range: 0.2, scaleStep: 0, isCenter: true },
          { id: 'muted-node', x: 0.7, y: 0.4, range: 0.2, scaleStep: 2, isCenter: false, muted: true },
          { id: 'hidden-node', x: 0.3, y: 0.6, range: 0.2, scaleStep: -2, isCenter: false, hidden: true },
        ],
      }],
      layout: 'single',
      mobilePadId: 'A',
      canvasBackgroundPattern: 'pond2',
      showNodeLabels: false,
      onSelectPad: () => undefined,
      onAddNode: () => undefined,
      onNodePointerDown: () => undefined,
      onDeleteNode: () => undefined,
      onTogglePlaying: () => undefined,
      onToggleLocked: () => undefined,
      onPatchNode: () => undefined,
    }));

    // 背景图案与缩放视口：CSS 靠这两个钩子挂样式
    assert.match(markup, /data-canvas-bg="pond2"/);
    assert.match(markup, /class="quad-lily-pad__viewport"/);
    assert.match(markup, /data-zoom="1\.00"/);

    // 节点与传播圆都要带上静音 / 隐藏标记
    assert.match(markup, /data-node-id="muted-node"[^>]*data-muted="true"/);
    assert.match(markup, /data-node-id="hidden-node"[^>]*data-hidden="true"/);
    assert.equal((markup.match(/data-muted="true"/g) ?? []).length, 2, 'muted 节点与其传播圆各一处');
    assert.equal((markup.match(/data-hidden="true"/g) ?? []).length, 2, 'hidden 节点与其传播圆各一处');

    // 隐藏 / 静音状态要能被读屏软件念出来，且仍然可聚焦编辑
    assert.match(markup, /aria-label="A 节点 muted-node，音阶步进 \+2，已静音"/);
    assert.match(markup, /aria-label="A 节点 hidden-node，音阶步进 -2，已隐藏（不参与传播）"/);
    assert.doesNotMatch(markup, /data-hidden="true"[^>]*tabindex="-1"/);
  } finally {
    await vite.close();
  }
});
