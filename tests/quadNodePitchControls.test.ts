import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));

test('endpoint pitch editor keeps A visible and makes the experimental A/B state explicit', async () => {
  const vite = await createServer({ root: projectRoot, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  try {
    const { NodePitchControls } = await vite.ssrLoadModule('/quad/NodePitchControls.tsx');
    const markup = renderToStaticMarkup(React.createElement(NodePitchControls, {
      aStep: 2,
      bStep: 6,
      aNoteName: 'E4',
      bNoteName: 'A5',
      motionEnabled: true,
      locked: false,
      onChangeAStep: () => undefined,
      onChangeBStep: () => undefined,
      onToggleEndpointPitch: () => undefined,
    }));

    assert.match(markup, /class="node-pitch/);
    assert.match(markup, /aria-label="启用运动端点双音" aria-pressed="true"/);
    assert.match(markup, /A STEP/);
    assert.match(markup, /B STEP/);
    assert.match(markup, /E4/);
    assert.match(markup, /A5/);
    assert.match(markup, /下周期生效/);
  } finally {
    await vite.close();
  }
});

test('endpoint pitch editor explains that motion is required when A/B is disabled', async () => {
  const vite = await createServer({ root: projectRoot, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  try {
    const { NodePitchControls } = await vite.ssrLoadModule('/quad/NodePitchControls.tsx');
    const markup = renderToStaticMarkup(React.createElement(NodePitchControls, {
      aStep: 0,
      bStep: null,
      aNoteName: 'C4',
      bNoteName: null,
      motionEnabled: false,
      locked: false,
      onChangeAStep: () => undefined,
      onChangeBStep: () => undefined,
      onToggleEndpointPitch: () => undefined,
    }));

    assert.match(markup, /aria-label="启用运动端点双音" aria-pressed="false"/);
    assert.match(markup, /先开启 Motion/);
    assert.doesNotMatch(markup, /B STEP/);
  } finally {
    await vite.close();
  }
});
