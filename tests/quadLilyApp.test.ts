import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createQuadLilyAppView } from '../quad/appModel.ts';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));

test('INFO visibility hides only canvas badges while Cycle Map keeps its identity labels', async () => {
  const { resolveNodeLabelVisibility } = await import('../quad/nodeLabels.ts');

  assert.deepEqual(resolveNodeLabelVisibility(true), { canvas: true, cycleMap: true });
  assert.deepEqual(resolveNodeLabelVisibility(false), { canvas: false, cycleMap: true });
});

test('the four-pad instrument keeps only shared FM-1 and essential live controls', () => {
  const view = createQuadLilyAppView();
  const copy = [
    view.title,
    view.subtitle,
    view.fm1StatusLabel,
    ...view.masterActions.map(action => action.label),
    ...view.editorFields.map(field => field.label),
    ...view.voiceActions.map(action => action.label),
  ].join(' ');

  assert.match(copy, /MUSICANVAS/);
  assert.match(copy, /全部播放/);
  assert.match(copy, /全部暂停/);
  assert.match(copy, /同步重启/);
  assert.match(copy, /FM-1 当前音色/);
  assert.match(copy, /4 PAD 共享/);
  assert.match(copy, /根音/);
  assert.match(copy, /音阶/);
  assert.match(copy, /八度/);
  assert.match(copy, /Interval/);
  assert.match(copy, /记住当前 Voice/);
  assert.doesNotMatch(copy, /MELODIC|DRUMS|INBOX|SCENES/);
});

test('defaults to a single-pad workspace with an explicit one/four Pad view switch', async () => {
  const vite = await createServer({
    root: projectRoot,
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });

  try {
    const { default: QuadLilyApp } = await vite.ssrLoadModule('/quad/QuadLilyApp.tsx');
    const markup = renderToStaticMarkup(React.createElement(QuadLilyApp));

    assert.match(markup, /data-view-mode="single"/);
    assert.match(markup, /data-theme="lotus"/);
    assert.match(markup, /aria-label="切换到深色主题"/);
    assert.match(markup, /aria-label="Lily Pad 显示模式"/);
    assert.match(markup, /aria-label="单个 Lily Pad" aria-pressed="true"/);
    assert.match(markup, /aria-label="四个 Lily Pad" aria-pressed="false"/);
    assert.match(markup, /aria-label="隐藏画布节点编号和音名" aria-pressed="true"/);
    assert.match(markup, /class="quad-main-stage"/);
    assert.match(markup, /data-layout="single"/);
    assert.match(markup, /aria-label="Pad A 周期关系图"/);
    assert.match(markup, /aria-label="Pad A · 已暂停" aria-pressed="true"/);
    assert.match(markup, /aria-label="Pad B · 已暂停" aria-pressed="false"/);
    assert.match(markup, /aria-label="播放 Pad A"/,
      '单 Pad 顶栏运输键应直接控制当前 Pad，而不是显示语义模糊的全部暂停');
    assert.match(markup, /class="quad-control-rail__primary"/);
    assert.match(markup, /class="quad-control-rail__secondary"/);
    assert.match(markup, /<details class="quad-utility-menu"/);
    assert.match(markup, /<summary>更多<\/summary>/);
    assert.match(markup, /aria-label="记住当前 Voice"[^>]*>记住<\/button>/);
    assert.match(markup, /aria-label="召回 Voice"[^>]*>召回<\/button>/);
    assert.doesNotMatch(markup, /Cycle Atlas|ATLAS ↗/,
      'Quad-only UI must not expose the removed Cycle Lab application');
    assert.equal((markup.match(/data-pad-id="[A-D]"/g) ?? []).length, 4,
      'single 是无损视图，四个 Pad 仍保留在同一工作区');
  } finally {
    await vite.close();
  }
});

test('Desk transport uses true pause and Space resumes the frozen cycle cursor', () => {
  const source = readFileSync(new URL('../quad/QuadLilyApp.tsx', import.meta.url), 'utf8');

  assert.match(source, /shouldToggleTransport/);
  assert.match(source, /\.pausePad\(/);
  assert.match(source, /\.resumePad\(/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.doesNotMatch(
    source.slice(source.indexOf('const togglePadPlaying'), source.indexOf('const togglePadLocked')),
    /stopPad\(/,
    '单 Pad 暂停必须冻结游标，不能销毁当前 cycle',
  );
});

test('the desktop grid reserves the hidden Pad-tab row without collapsing the main stage', () => {
  const css = readFileSync(new URL('../quad/quad.css', import.meta.url), 'utf8');

  assert.match(css, /\.quad-pad-tabs\s*\{[^}]*grid-row:\s*3\b/s);
  assert.match(css, /\.quad-main-stage\s*\{[^}]*grid-row:\s*4\b/s);
  assert.match(css, /\.quad-control-rail\s*\{[^}]*grid-row:\s*5\b/s);
  assert.match(css, /\.quad-workbench\[data-view-mode="single"\] \.quad-master-actions\s*\{[^}]*display:\s*flex\b/s,
    'single 模式也必须保留一个可见的全局停止入口');
});

test('desktop controls fit the viewport without horizontal scrolling and expose clear button hierarchy', () => {
  const css = readFileSync(new URL('../quad/quad.css', import.meta.url), 'utf8');

  assert.match(css, /\.quad-control-rail\s*\{[^}]*display:\s*grid\b/s);
  assert.doesNotMatch(css, /\.quad-control-rail\s*\{[^}]*overflow-x:\s*auto\b/s);
  assert.match(css, /\.quad-action--primary\s*\{/);
  assert.match(css, /\.quad-action--danger\s*\{/);
  assert.match(css, /\.quad-action--tertiary\s*\{/);
  assert.match(css, /\.quad-lily-pad button\.quad-action--primary\s*\{[^}]*var\(--quad-pad-color\)/s,
    '四宫格中的主播放键必须使用各自 Pad 的颜色');
  assert.match(css, /@media \(max-width:\s*1064px\)[\s\S]*?\.quad-workbench\s*\{[^}]*overflow:\s*visible/s,
    '窄桌面必须在顶栏发生裁切前进入可滚动重排');
  assert.doesNotMatch(css, /\.quad-action--tertiary\s*\{[^}]*opacity:\s*\.(?:8|[0-7])/s,
    '小字 tertiary 操作不能靠透明度降低到 4.5:1 以下');
  assert.match(
    css,
    /\.quad-workbench\[data-view-mode="single"\] \.quad-control-rail__utility\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s,
    '单 Pad 窄桌面的三个 utility 操作必须能在各自网格轨道内收缩，不能制造横向滚动',
  );
  assert.match(
    css,
    /\.quad-workbench\[data-view-mode="single"\] \.node-motion__field\s*\{[^}]*min-width:\s*0/s,
    '单 Pad 的 PENDULUM 四参数必须能在 1100px 附近收缩，不能被参数容器裁切',
  );
});

test('Studio sidebar labels and the canvas HUD share the compact typography baseline', () => {
  const css = readFileSync(new URL('../quad/variants/variants.css', import.meta.url), 'utf8');

  assert.match(
    css,
    /\.quad-pro-field__sublabel\s*\{[^}]*font-size:\s*var\(--studio-fs-label,\s*10px\)/s,
    '组合音符的小标题不应继承外层的大字号',
  );
  assert.match(
    css,
    /\.quad-lily-pad__hud\s*\{[^}]*align-items:\s*baseline[^}]*line-height:\s*1\b/s,
    '画布左下角运行参数应共享同一文字基线',
  );
  assert.match(
    css,
    /\.quad-lily-pad__hud-item b\s*\{[^}]*line-height:\s*1\b/s,
    'HUD 数值不能携带不同的默认行高',
  );
});

test('phone-sized Studio starts with a collapsed parameter tower and preserves the canvas viewport', () => {
  const source = readFileSync(new URL('../quad/variants/StudioLayout.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../quad/variants/variants.css', import.meta.url), 'utf8');

  assert.match(source, /matchMedia\('\(max-width:\s*720px\)'\)\.matches/,
    '手机首次打开时应默认收起参数塔，不能把完整桌面侧栏堆到画布上方');
  assert.match(css, /@media \(max-width:\s*720px\)[\s\S]*?grid-template-areas:\s*"brand tools"\s*"controls controls"/,
    '手机顶栏应明确重排为两行，而不是任意换行');
  assert.match(css, /@media \(max-width:\s*720px\)[\s\S]*?\.quad-studio-stage\s*\{[^}]*min-height:\s*0[^}]*flex:\s*1\s+1\s+0/s,
    '手机画布应占据工具栏与折叠参数条以外的剩余可视高度');
  assert.match(css, /@media \(max-width:\s*720px\)[\s\S]*?\.quad-studio-left-cluster\s*>\s*\.quad-studio-left-group:first-child\s*\{[^}]*display:\s*flex/s,
    '手机保留视图切换，避免从四画布布局缩窄后无法返回单画布');
});

test('current-cycle labels use the same frozen pitch context as the sounding MIDI snapshot', () => {
  const source = readFileSync(new URL('../quad/QuadLilyApp.tsx', import.meta.url), 'utf8');

  assert.match(source, /currentTracePresentations[\s\S]*?buildNodePresentations\([\s\S]*?selectedCycleSnapshot\s*,\s*\)/,
    '当前 Cycle Map 音名应读取当前周期快照的根音、音阶和八度');
  assert.match(source, /const presentationPad = basePad\.playing \|\| isPaused[\s\S]*?cycleSnapshots\[padId\] \?\? basePad/,
    '画布音名应在播放与暂停期间读取同一周期快照');
  assert.match(source, /nodePresentations:\s*buildNodePresentations\(nodes, presentationPad\)/);
});

test('paused Pad cycle-zero compilations are memoized outside the animation-frame view derivation', () => {
  const source = readFileSync(new URL('../quad/QuadLilyApp.tsx', import.meta.url), 'utf8');
  const padViewsStart = source.indexOf('const padViews = QUAD_PAD_IDS.map');
  const padViewsEnd = source.indexOf('\n  return (', padViewsStart);
  const padViewsSource = source.slice(padViewsStart, padViewsEnd);

  assert.match(source, /const restingPadSnapshots = useMemo\(/,
    '暂停 Pad 的 cycle-0 Motion 快照应跨 RAF 重渲染复用');
  assert.match(source, /const restingCycleCompilations = useMemo\(/,
    '暂停 Pad 的 cycle-0 编译结果应跨 RAF 重渲染复用');
  assert.match(padViewsSource, /restingCycleCompilations\[padId\]/);
  assert.doesNotMatch(padViewsSource, /compileLilyCycle\(/,
    '任一 Pad 播放导致的每帧 render 不得重新编译其他暂停 Pad');
});
