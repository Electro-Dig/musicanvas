import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

import { compileLilyCycle, type QuadLilyPad } from '../quad/core.ts';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));

function pad(nodes: QuadLilyPad['nodes']): QuadLilyPad {
  return {
    id: 'A',
    phraseSteps: 4,
    nodes,
    intervalMs: 800,
    playing: true,
    loop: true,
    locked: false,
    velocity: 0.8,
    rememberedTone: 'follow',
    rootMidi: 60,
    scaleKey: 'majorPentatonic',
    octaveTranspose: 0,
    midiChannel: 1,
  };
}

test('renders current and next as one selectable propagation map without claiming tree keyboard semantics', async () => {
  const vite = await createServer({
    root: projectRoot,
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });

  try {
    const { CycleTrace } = await vite.ssrLoadModule('/quad/CycleTrace.tsx');
    const current = compileLilyCycle(pad([
      { id: 'center', x: 0.5, y: 0.5, range: 0.14, scaleStep: 0, isCenter: true },
      { id: 'left', x: 0.58, y: 0.48, range: 0.08, scaleStep: -2, isCenter: false },
      { id: 'right', x: 0.58, y: 0.52, range: 0.08, scaleStep: 3, isCenter: false },
    ]));
    const next = compileLilyCycle(pad([
      { id: 'center', x: 0.5, y: 0.5, range: 0.14, scaleStep: 0, isCenter: true },
      { id: 'left', x: 0.7, y: 0.48, range: 0.08, scaleStep: -2, isCenter: false },
      { id: 'right', x: 0.58, y: 0.52, range: 0.08, scaleStep: 3, isCenter: false },
    ]));
    const markup = renderToStaticMarkup(React.createElement(CycleTrace, {
      padId: 'A',
      current,
      next,
      cyclePhase: 0.25,
      selectedNodeId: 'center',
      nodePresentations: new Map([
        ['center', { shortId: 'ROOT', noteName: 'C4', midiNote: 60 }],
        ['left', { shortId: 'N1', noteName: 'A3', midiNote: 57 }],
        ['right', { shortId: 'N2', noteName: 'G4', midiNote: 67 }],
      ]),
      showNodeLabels: true,
      onSelectNode: () => undefined,
    }));

    assert.match(markup, /aria-label="Pad A 周期关系图"/);
    assert.match(markup, /aria-label="周期图显示模式"/);
    assert.match(markup, /aria-label="一图流" aria-pressed="true"/);
    assert.match(markup, /aria-label="时间结构" aria-pressed="false"/);
    assert.match(markup, /data-trace-view="flow"/);
    assert.equal((markup.match(/role="group"/g) ?? []).length, 1);
    assert.doesNotMatch(markup, /role="tree(item)?"/);
    assert.equal((markup.match(/<svg/g) ?? []).length, 1);
    assert.match(markup, /<button[^>]*aria-label="N1，音符 A3/);
    assert.match(markup, /STEP 0/);
    assert.match(markup, /0 ms/);
    assert.match(markup, /N1 · A3/);
    assert.match(markup, /N2 · G4/);
  } finally {
    await vite.close();
  }
});

test('a rewired node names both its current and NEXT parent for assistive technology', async () => {
  const vite = await createServer({
    root: projectRoot,
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });

  try {
    const { CycleTrace } = await vite.ssrLoadModule('/quad/CycleTrace.tsx');
    const current = compileLilyCycle(pad([
      { id: 'center', x: 0.5, y: 0.5, range: 0.1, scaleStep: 0, isCenter: true },
      { id: 'parent', x: 0.58, y: 0.5, range: 0.12, scaleStep: 1, isCenter: false },
      { id: 'child', x: 0.66, y: 0.5, range: 0.08, scaleStep: 2, isCenter: false },
    ]));
    const next = {
      ...current,
      nodes: current.nodes.map(node => node.nodeId === 'child'
        ? { ...node, parentId: 'center' }
        : node),
      edges: current.edges
        .filter(edge => edge.toId !== 'child')
        .concat({ fromId: 'center', toId: 'child', distance: 0.16, sourceRange: 0.3, orderWithinParent: 1 }),
    };
    const markup = renderToStaticMarkup(React.createElement(CycleTrace, {
      padId: 'A',
      current,
      next,
      cyclePhase: 0.25,
      selectedNodeId: null,
      onSelectNode: () => undefined,
    }));

    assert.match(markup, /父节点从 parent 变为 center/);
  } finally {
    await vite.close();
  }
});

test('a NEXT-only node keeps the same stable number and note label as the editable canvas', async () => {
  const vite = await createServer({
    root: projectRoot,
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });

  try {
    const { CycleTrace } = await vite.ssrLoadModule('/quad/CycleTrace.tsx');
    const current = compileLilyCycle(pad([
      { id: 'center', x: 0.5, y: 0.5, range: 0.1, scaleStep: 0, isCenter: true },
    ]));
    const next = compileLilyCycle(pad([
      { id: 'center', x: 0.5, y: 0.5, range: 0.2, scaleStep: 0, isCenter: true },
      { id: 'node-5', x: 0.58, y: 0.5, range: 0.08, scaleStep: 3, isCenter: false },
    ]));
    const markup = renderToStaticMarkup(React.createElement(CycleTrace, {
      padId: 'A',
      current,
      next,
      cyclePhase: 0.25,
      selectedNodeId: null,
      nodePresentations: new Map([
        ['center', { shortId: 'ROOT', noteName: 'C4', midiNote: 60 }],
      ]),
      nextNodePresentations: new Map([
        ['center', { shortId: 'ROOT', noteName: 'C4', midiNote: 60 }],
        ['node-5', { shortId: 'N5', noteName: 'G4', midiNote: 67 }],
      ]),
      showNodeLabels: true,
      onSelectNode: () => undefined,
    }));

    assert.match(markup, /N5 · G4/);
    assert.match(markup, /aria-label="N5，音符 G4/);
  } finally {
    await vite.close();
  }
});
