import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));

async function loadControls() {
  const vite = await createServer({
    root: projectRoot,
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });
  const module = await vite.ssrLoadModule('/quad/NodeMotionControls.tsx');
  return { vite, NodeMotionControls: module.NodeMotionControls };
}

const noop = () => undefined;

test('renders four persistent mode buttons and compact ORBIT controls', async () => {
  const { vite, NodeMotionControls } = await loadControls();
  try {
    const markup = renderToStaticMarkup(React.createElement(NodeMotionControls, {
      motion: { mode: 'orbit', amount: 0.12, rateCycles: 5, direction: -1 },
      locked: false,
      drawStatus: 'ready',
      onMotionChange: noop,
      onArmDraw: noop,
      onCancelDraw: noop,
    }));

    for (const mode of ['OFF', 'ORBIT', 'PENDULUM', 'DRAW']) {
      assert.match(markup, new RegExp(`aria-label="Motion ${mode}"`));
    }
    assert.match(markup, /aria-label="Motion ORBIT"[^>]*aria-pressed="true"/);
    assert.match(markup, /aria-label="ORBIT 移动幅度"/);
    assert.match(markup, /aria-label="ORBIT 周期"/);
    assert.match(markup, /aria-label="ORBIT 方向"/);
    for (const rate of [2, 3, 5, 8]) {
      assert.match(markup, new RegExp(`<option value="${rate}"`));
    }
    assert.doesNotMatch(markup, /PENDULUM 角度|开始 DRAW 轨迹录制/);
  } finally {
    await vite.close();
  }
});

test('PENDULUM exposes angle and disables every editor while locked', async () => {
  const { vite, NodeMotionControls } = await loadControls();
  try {
    const markup = renderToStaticMarkup(React.createElement(NodeMotionControls, {
      motion: { mode: 'pendulum', amount: 0.08, rateCycles: 3, direction: 1, angleDegrees: 135 },
      locked: true,
      drawStatus: 'ready',
      onMotionChange: noop,
      onArmDraw: noop,
      onCancelDraw: noop,
    }));

    assert.match(markup, /aria-label="PENDULUM 角度"/);
    const editors = markup.match(/<(?:button|input|select)\b[^>]*>/g) ?? [];
    assert.ok(editors.length >= 7);
    for (const editor of editors) assert.match(editor, /disabled=""/);
  } finally {
    await vite.close();
  }
});

test('DRAW reports ready, armed and recording states and routes its action', async () => {
  const { vite, NodeMotionControls } = await loadControls();
  try {
    for (const [status, copy] of [
      ['ready', 'DRAW READY'],
      ['armed', 'DRAW ARMED'],
      ['recording', 'DRAW RECORDING'],
    ] as const) {
      const markup = renderToStaticMarkup(React.createElement(NodeMotionControls, {
        motion: { mode: 'draw', path: [], rateCycles: 8, direction: 1 },
        locked: false,
        drawStatus: status,
        onMotionChange: noop,
        onArmDraw: noop,
        onCancelDraw: noop,
      }));
      assert.match(markup, new RegExp(copy));
      assert.match(markup, /aria-label="DRAW 周期"/);
      assert.match(markup, /aria-label="DRAW 方向"/);
      assert.match(markup, new RegExp(status === 'ready'
        ? 'aria-label="开始 DRAW 轨迹录制"'
        : 'aria-label="取消 DRAW 轨迹录制"'));
    }

    let armed = 0;
    let cancelled = 0;
    const readyTree = NodeMotionControls({
      motion: { mode: 'draw', path: [], rateCycles: 3, direction: 1 },
      locked: false,
      drawStatus: 'ready',
      onMotionChange: noop,
      onArmDraw: () => { armed += 1; },
      onCancelDraw: () => { cancelled += 1; },
    });
    findElementByAriaLabel(readyTree, '开始 DRAW 轨迹录制').props.onClick();

    const armedTree = NodeMotionControls({
      motion: { mode: 'draw', path: [], rateCycles: 3, direction: 1 },
      locked: false,
      drawStatus: 'armed',
      onMotionChange: noop,
      onArmDraw: () => { armed += 1; },
      onCancelDraw: () => { cancelled += 1; },
    });
    findElementByAriaLabel(armedTree, '取消 DRAW 轨迹录制').props.onClick();

    assert.equal(armed, 1);
    assert.equal(cancelled, 1);
  } finally {
    await vite.close();
  }
});

function findElementByAriaLabel(node: React.ReactNode, label: string): React.ReactElement<any> {
  if (React.isValidElement(node)) {
    if (node.props['aria-label'] === label) return node as React.ReactElement<any>;
    const children = React.Children.toArray(node.props.children);
    for (const child of children) {
      try {
        return findElementByAriaLabel(child, label);
      } catch {
        // Keep searching sibling branches.
      }
    }
  }
  throw new Error(`No element with aria-label "${label}"`);
}
