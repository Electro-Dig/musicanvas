import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));

test('Desk keeps the Library closed by default behind one explicit entry point', async () => {
  const vite = await createServer({
    root: projectRoot,
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });

  try {
    const { default: QuadLilyApp } = await vite.ssrLoadModule('/quad/QuadLilyApp.tsx');
    const markup = renderToStaticMarkup(React.createElement(QuadLilyApp));

    assert.match(markup, /aria-label="打开 Library 素材库"/);
    assert.doesNotMatch(markup, /role="dialog"/,
      '素材库关闭时不应继续占据 Desk 的画布或控制栏');
  } finally {
    await vite.close();
  }
});

test('Library entry remains visible at phone and compact Quad breakpoints', async () => {
  const css = await readFile(new URL('../quad/quad.css', import.meta.url), 'utf8');

  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.quad-display-tools\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*2fr\)\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media \(min-width: 721px\) and \(max-width: 1140px\)[\s\S]*?data-view-mode="quad"[^\n]*\.quad-topbar/);
});
