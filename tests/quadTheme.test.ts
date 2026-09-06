import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Quad Lily theme restoration defaults to lotus and accepts three supported themes', async () => {
  const module = await import('../quad/theme.ts').catch(() => ({}));
  const restoreQuadTheme = (module as {
    restoreQuadTheme?: (value: unknown) => string;
  }).restoreQuadTheme;

  assert.equal(typeof restoreQuadTheme, 'function');
  assert.equal(restoreQuadTheme!(null), 'lotus');
  assert.equal(restoreQuadTheme!('lotus'), 'lotus');
  assert.equal(restoreQuadTheme!('ink'), 'ink');
  assert.equal(restoreQuadTheme!('dark'), 'dark');
  assert.equal(restoreQuadTheme!('ember'), 'lotus');
  assert.equal(restoreQuadTheme!('sepia'), 'lotus');
});

test('Quad Lily theme toggle cycles through three supported themes', async () => {
  const module = await import('../quad/theme.ts').catch(() => ({}));
  const toggleQuadTheme = (module as {
    toggleQuadTheme?: (theme: 'lotus' | 'ink' | 'dark') => string;
  }).toggleQuadTheme;

  assert.equal(typeof toggleQuadTheme, 'function');
  assert.equal(toggleQuadTheme!('lotus'), 'ink');
  assert.equal(toggleQuadTheme!('ink'), 'dark');
  assert.equal(toggleQuadTheme!('dark'), 'lotus');
});

test('legacy dark form rules explicitly leave the independently themed Quad workbench alone', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../quad/quad.css', import.meta.url), 'utf8');

  assert.match(html, /html\.dark button:not\(\.quad-workbench button\)/,
    '全局深色按钮规则不得覆盖 LOTUS 工作台的透明、弱化与选中态');
  assert.match(html, /html\.dark button:disabled:not\(\.quad-workbench button\)/,
    '全局 disabled 规则也必须避开独立主题工作台');
  assert.match(html, /html\.dark select:not\(\.quad-workbench select\)/,
    '全局白色 select 箭头不得进入浅色工作台');
  assert.match(css, /\.quad-workbench\[data-theme="lotus"\] select[\s\S]*background-image:/,
    'LOTUS 必须明确提供适合浅底的下拉箭头');
  assert.match(css, /\.quad-workbench\[data-theme="dark"\] select[\s\S]*background-image:/,
    'DARK 必须明确提供适合深底的下拉箭头');
  assert.match(css, /\.quad-workbench\[data-theme="ink"\]/,
    'INK 主题必须存在');
});
