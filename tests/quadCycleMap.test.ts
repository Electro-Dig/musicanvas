import assert from 'node:assert/strict';
import test from 'node:test';

import type { LilyCycleCompilation, LilyCycleCompiledNode, QuadLilyPad } from '../quad/core.ts';

function node(
  nodeId: string,
  parentId: string | null,
  status: LilyCycleCompiledNode['status'],
  offsetMs: number | null,
  depth: number | null,
  scaleStep: number,
): LilyCycleCompiledNode {
  return {
    nodeId,
    parentId,
    status,
    offsetMs,
    phase: offsetMs === null ? null : offsetMs / 800,
    depth,
    order: offsetMs === null ? null : offsetMs / 200,
    wave: offsetMs === null ? null : offsetMs / 200,
    scaleStep,
    isCenter: nodeId === 'center',
    x: 0.5,
    y: 0.5,
    range: 0.2,
  };
}

function compilation(
  nodes: LilyCycleCompiledNode[],
  edges: Array<{ fromId: string; toId: string }>,
): LilyCycleCompilation {
  return {
    kind: 'gemidi.lily-cycle-compilation',
    version: 1,
    padId: 'A',
    intervalMs: 800,
    propagationStepMs: 200,
    nodes,
    edges: edges.map((edge) => ({ ...edge, distance: 0.1, sourceRange: 0.2, orderWithinParent: 0 })),
    waves: [],
    events: [],
  };
}

test('buildCycleMapModel overlays next-cycle changes on one current topology', async () => {
  const module = await import('../quad/cycleTraceModel.ts').catch(() => ({}));
  const buildCycleMapModel = (module as {
    buildCycleMapModel?: (
      current: LilyCycleCompilation,
      next: LilyCycleCompilation,
    ) => {
      nodes: Array<{ nodeId: string; change: string; x: number; y: number }>;
      edges: Array<{ fromId: string; toId: string; layer: string }>;
    };
  }).buildCycleMapModel;

  assert.equal(typeof buildCycleMapModel, 'function', '应提供合并 CURRENT/NEXT 的纯视图模型');

  const current = compilation([
    node('center', null, 'active', 0, 0, 0),
    node('a', 'center', 'active', 200, 1, 1),
    node('b', 'center', 'active', 400, 1, 3),
    node('leaving', 'a', 'active', 400, 2, -2),
    node('quiet', null, 'unreachable', null, null, 8),
  ], [
    { fromId: 'center', toId: 'a' },
    { fromId: 'center', toId: 'b' },
    { fromId: 'a', toId: 'leaving' },
  ]);
  const next = compilation([
    node('center', null, 'active', 0, 0, 0),
    node('a', 'center', 'active', 200, 1, 1),
    node('b', 'a', 'active', 400, 2, 3),
    node('leaving', null, 'unreachable', null, null, -2),
    node('quiet', null, 'unreachable', null, null, 8),
    node('entering', 'center', 'active', 600, 1, 5),
  ], [
    { fromId: 'center', toId: 'a' },
    { fromId: 'a', toId: 'b' },
    { fromId: 'center', toId: 'entering' },
  ]);

  const graph = buildCycleMapModel!(current, next);
  const changes = Object.fromEntries(graph.nodes.map(item => [item.nodeId, item.change]));

  assert.deepEqual(changes, {
    center: 'stable',
    a: 'stable',
    b: 'rewired',
    leaving: 'leaving',
    quiet: 'silent',
    entering: 'entering',
  });
  assert.deepEqual(graph.edges.map(edge => `${edge.layer}:${edge.fromId}->${edge.toId}`).sort(), [
    'current:a->leaving',
    'current:center->b',
    'next:a->b',
    'next:center->entering',
    'stable:center->a',
  ]);
  graph.nodes.forEach(item => {
    assert.ok(item.x >= 0 && item.x <= 100);
    assert.ok(item.y >= 0 && item.y <= 100);
  });
});

test('buildCycleMapModel exposes pitch-only edits and connects a retimed NEXT branch', async () => {
  const { buildCycleMapModel } = await import('../quad/cycleTraceModel.ts');
  const current = compilation([
    node('center', null, 'active', 0, 0, 0),
    node('pitch', 'center', 'active', 200, 1, 1),
    node('timed', 'center', 'active', 200, 1, 3),
  ], [
    { fromId: 'center', toId: 'pitch' },
    { fromId: 'center', toId: 'timed' },
  ]);
  const next = compilation([
    node('center', null, 'active', 0, 0, 0),
    node('pitch', 'center', 'active', 200, 1, 5),
    node('timed', 'center', 'active', 600, 1, 3),
  ], [
    { fromId: 'center', toId: 'pitch' },
    { fromId: 'center', toId: 'timed' },
  ]);

  const graph = buildCycleMapModel(current, next);
  const changes = Object.fromEntries(graph.nodes.map(item => [item.nodeId, item.change]));

  assert.equal(changes.pitch, 'repitched', '只改变 STEP 也必须出现在 NEXT 差异层');
  assert.equal(changes.timed, 'retimed');
  assert.deepEqual(
    graph.edges
      .filter(edge => edge.toId === 'timed')
      .map(edge => edge.layer)
      .sort(),
    ['current', 'next'],
    '同一父节点下改时后，当前连线与通向预测 ghost 的 NEXT 连线都应存在',
  );
});

test('buildCycleMapModel keeps stable nodes anchored when NEXT adds a same-wave sibling', async () => {
  const { buildCycleMapModel } = await import('../quad/cycleTraceModel.ts');
  const current = compilation([
    node('center', null, 'active', 0, 0, 0),
    node('parent', 'center', 'active', 200, 1, 1),
    node('stable', 'parent', 'active', 400, 2, 2),
  ], [
    { fromId: 'center', toId: 'parent' },
    { fromId: 'parent', toId: 'stable' },
  ]);
  const next = compilation([
    node('center', null, 'active', 0, 0, 0),
    node('parent', 'center', 'active', 200, 1, 1),
    node('stable', 'parent', 'active', 400, 2, 2),
    node('new', 'parent', 'active', 400, 2, 4),
  ], [
    { fromId: 'center', toId: 'parent' },
    { fromId: 'parent', toId: 'stable' },
    { fromId: 'parent', toId: 'new' },
  ]);

  const graph = buildCycleMapModel(current, next);
  const stable = graph.nodes.find(item => item.nodeId === 'stable');

  assert.ok(stable);
  assert.equal(stable.change, 'stable');
  assert.equal(stable.nextX, stable.currentX);
  assert.equal(stable.nextY, stable.currentY,
    '新增同 wave 分支不得让 stable 节点的 NEXT 连线指向一个没有节点的空位');
  assert.deepEqual(
    graph.edges.filter(edge => edge.toId === 'stable').map(edge => edge.layer),
    ['stable'],
  );
});

test('buildCycleMapModel gives two stable nodes and one entering sibling unique shared-lane slots', async () => {
  const { buildCycleMapModel } = await import('../quad/cycleTraceModel.ts');
  const current = compilation([
    node('center', null, 'active', 0, 0, 0),
    node('parent', 'center', 'active', 200, 1, 1),
    node('a', 'parent', 'active', 400, 2, 2),
    node('b', 'parent', 'active', 400, 2, 3),
  ], [
    { fromId: 'center', toId: 'parent' },
    { fromId: 'parent', toId: 'a' },
    { fromId: 'parent', toId: 'b' },
  ]);
  const next = compilation([
    node('center', null, 'active', 0, 0, 0),
    node('parent', 'center', 'active', 200, 1, 1),
    node('a', 'parent', 'active', 400, 2, 2),
    node('b', 'parent', 'active', 400, 2, 3),
    node('c', 'parent', 'active', 400, 2, 4),
  ], [
    { fromId: 'center', toId: 'parent' },
    { fromId: 'parent', toId: 'a' },
    { fromId: 'parent', toId: 'b' },
    { fromId: 'parent', toId: 'c' },
  ]);

  const graph = buildCycleMapModel(current, next);
  const lane = graph.nodes.filter(item => ['a', 'b', 'c'].includes(item.nodeId));
  const nextSlots = lane.map(item => item.nextY);

  assert.equal(new Set(nextSlots).size, 3, 'shared lane 中每个可见节点必须占据唯一槽位');
  lane.filter(item => item.change === 'stable').forEach(item => {
    assert.equal(item.currentY, item.nextY, `${item.nodeId} 的 CURRENT/NEXT 必须共用一个槽位`);
  });
});

test('buildCycleTracePair previews cycle zero after a paused Pad is restarted', async () => {
  const { buildCycleTracePair, resolveVisibleCycleState } = await import('../quad/cycleTraceModel.ts');
  const movingPad: QuadLilyPad = {
    id: 'A',
    phraseSteps: 4,
    intervalMs: 800,
    playing: false,
    loop: true,
    locked: false,
    velocity: 0.8,
    rememberedTone: 'follow',
    rootMidi: 60,
    scaleKey: 'majorPentatonic',
    octaveTranspose: 0,
    midiChannel: 1,
    nodes: [
      { id: 'center', x: 0.5, y: 0.5, range: 0.3, scaleStep: 0, isCenter: true },
      {
        id: 'moving', x: 0.6, y: 0.5, range: 0.2, scaleStep: 2, isCenter: false,
        motion: { mode: 'orbit', amount: 0.12, rateCycles: 3, phaseOffset: 0, direction: 1 },
      },
    ],
  };
  const stale = compilation([
    node('center', null, 'active', 0, 0, 0),
  ], []);

  const trace = buildCycleTracePair(movingPad, 7, stale);
  const visible = resolveVisibleCycleState(movingPad, 7, 0.72);

  assert.equal(trace.currentCycle, 0);
  assert.equal(trace.nextCycle, 1);
  assert.equal(visible.phase, 0);
  assert.equal(visible.position, 0,
    '暂停时左画布的 Motion 位置与右图 playhead 都应回到真实重播起点');
  assert.notEqual(trace.current, stale, '暂停后的旧 compilation 不得冒充重新播放的 cycle 0');
});

test('an intentionally paused Pad can preserve its frozen cycle and compilation for resume', async () => {
  const { buildCycleTracePair, resolveVisibleCycleState } = await import('../quad/cycleTraceModel.ts');
  const pausedPad: QuadLilyPad = {
    id: 'A',
    phraseSteps: 4, intervalMs: 800, playing: false, loop: true, locked: false,
    velocity: 0.8, rememberedTone: 'follow', rootMidi: 60,
    scaleKey: 'majorPentatonic', octaveTranspose: 0,
    midiChannel: 1,
    nodes: [{ id: 'center', x: 0.5, y: 0.5, range: 0.3, scaleStep: 0, isCenter: true }],
  };
  const captured = compilation([node('center', null, 'active', 0, 0, 0)], []);

  const trace = buildCycleTracePair(pausedPad, 7, captured, true);
  const visible = resolveVisibleCycleState(pausedPad, 7, 0.72, true);

  assert.equal(trace.currentCycle, 7);
  assert.equal(trace.nextCycle, 8);
  assert.equal(trace.current, captured);
  assert.deepEqual(visible, { cycle: 7, phase: 0.72, position: 7.72 });
});

test('advanceCyclePhases preserves record identity when no visible playhead changes', async () => {
  const module = await import('../quad/cycleTraceModel.ts').catch(() => ({}));
  const advanceCyclePhases = (module as {
    advanceCyclePhases?: (
      previous: Record<'A' | 'B' | 'C' | 'D', number>,
      pads: Record<'A' | 'B' | 'C' | 'D', { playing: boolean }>,
      startedAt: Record<'A' | 'B' | 'C' | 'D', number>,
      durations: Record<'A' | 'B' | 'C' | 'D', number>,
      now: number,
    ) => Record<'A' | 'B' | 'C' | 'D', number>;
  }).advanceCyclePhases;

  assert.equal(typeof advanceCyclePhases, 'function',
    'RAF 更新器必须能在全部暂停时复用 previous record，避免无意义重渲染');

  const previous = { A: 0, B: 0.25, C: 0, D: 0 };
  const pads = {
    A: { playing: false },
    B: { playing: false },
    C: { playing: false },
    D: { playing: false },
  };
  const startedAt = { A: 0, B: 100, C: 0, D: 0 };
  const durations = { A: 700, B: 800, C: 700, D: 700 };

  const idle = advanceCyclePhases!(previous, pads, startedAt, durations, 500);
  assert.equal(idle, previous, '没有 phase 变化时必须返回同一个对象引用');

  const running = advanceCyclePhases!(
    previous,
    { ...pads, B: { playing: true } },
    startedAt,
    durations,
    500,
  );
  assert.notEqual(running, previous);
  assert.equal(running.B, 0.5);
  assert.equal(running.A, previous.A);
});

test('buildCycleFlowModel renders every audible identity once while preserving branch changes', async () => {
  const module = await import('../quad/cycleTraceModel.ts');
  const buildCycleFlowModel = (module as {
    buildCycleFlowModel?: (graph: ReturnType<typeof module.buildCycleMapModel>) => {
      nodes: Array<{ nodeId: string; flowX: number; flowY: number; flowDepth: number }>;
      edges: Array<{ fromId: string; toId: string; layer: string }>;
    };
  }).buildCycleFlowModel;

  assert.equal(typeof buildCycleFlowModel, 'function',
    '一图流需要独立的单节点关系布局，而不是复用 CURRENT/NEXT 两套坐标');

  const current = compilation([
    node('center', null, 'active', 0, 0, 0),
    node('left', 'center', 'active', 200, 1, -2),
    node('right', 'center', 'active', 200, 1, 3),
    node('child', 'left', 'active', 400, 2, 5),
    node('quiet', null, 'unreachable', null, null, 8),
  ], [
    { fromId: 'center', toId: 'left' },
    { fromId: 'center', toId: 'right' },
    { fromId: 'left', toId: 'child' },
  ]);
  const next = compilation([
    node('center', null, 'active', 0, 0, 0),
    node('left', 'center', 'active', 600, 1, -2),
    node('right', 'center', 'active', 200, 1, 3),
    node('child', 'right', 'active', 400, 2, 5),
    node('quiet', null, 'unreachable', null, null, 8),
  ], [
    { fromId: 'center', toId: 'left' },
    { fromId: 'center', toId: 'right' },
    { fromId: 'right', toId: 'child' },
  ]);

  const flow = buildCycleFlowModel!(module.buildCycleMapModel(current, next));
  assert.deepEqual(flow.nodes.map(item => item.nodeId).sort(), ['center', 'child', 'left', 'quiet', 'right']);
  assert.equal(new Set(flow.nodes.map(item => item.nodeId)).size, flow.nodes.length,
    'CURRENT/NEXT 必须共享同一个音符节点');

  const byId = Object.fromEntries(flow.nodes.map(item => [item.nodeId, item]));
  assert.ok(byId.center.flowX < byId.left.flowX);
  assert.ok(byId.left.flowX < byId.child.flowX);
  assert.notEqual(byId.left.flowY, byId.right.flowY, '同一深度的分支不能重叠');
  assert.equal(byId.quiet.flowDepth, -1, '未触达节点仍需留在同一张图的独立区域');
  assert.deepEqual(
    flow.edges.map(edge => `${edge.layer}:${edge.fromId}->${edge.toId}`).sort(),
    [
      'current:left->child',
      'next:right->child',
      'stable:center->left',
      'stable:center->right',
    ],
    '仅时间变化的同一条边应合并，真正改线的旧/新父边应同时保留',
  );
});

test('buildCycleFlowModel keeps outside-cycle nodes in the topology and only shelves unreachable nodes', async () => {
  const { buildCycleFlowModel, buildCycleMapModel } = await import('../quad/cycleTraceModel.ts');
  const current = compilation([
    node('center', null, 'active', 0, 0, 0),
    node('late', 'center', 'outside-cycle', 1000, 1, 4),
    node('quiet', null, 'unreachable', null, null, 8),
  ], [{ fromId: 'center', toId: 'late' }]);
  const next = compilation([
    node('center', null, 'active', 0, 0, 0),
    node('late', 'center', 'outside-cycle', 1000, 1, 4),
    node('quiet', null, 'unreachable', null, null, 8),
  ], [{ fromId: 'center', toId: 'late' }]);

  const flow = buildCycleFlowModel(buildCycleMapModel(current, next));
  const byId = Object.fromEntries(flow.nodes.map(item => [item.nodeId, item]));

  assert.equal(byId.late.flowDepth, 1, '跨周期节点仍是已调度的结构节点');
  assert.equal(byId.quiet.flowDepth, -1, '只有真正未触达的节点进入安静层');
  assert.deepEqual(flow.edges.map(edge => `${edge.layer}:${edge.fromId}->${edge.toId}`), [
    'stable:center->late',
  ]);
});

test('buildCycleFlowModel keeps sibling positions stable when only event order changes', async () => {
  const { buildCycleFlowModel, buildCycleMapModel } = await import('../quad/cycleTraceModel.ts');
  const first = compilation([
    node('center', null, 'active', 0, 0, 0),
    node('alpha', 'center', 'active', 200, 1, 2),
    node('beta', 'center', 'active', 600, 1, 4),
  ], [
    { fromId: 'center', toId: 'alpha' },
    { fromId: 'center', toId: 'beta' },
  ]);
  const reordered = compilation([
    node('center', null, 'active', 0, 0, 0),
    node('alpha', 'center', 'active', 600, 1, 2),
    node('beta', 'center', 'active', 200, 1, 4),
  ], [
    { fromId: 'center', toId: 'alpha' },
    { fromId: 'center', toId: 'beta' },
  ]);

  const before = buildCycleFlowModel(buildCycleMapModel(first, first));
  const after = buildCycleFlowModel(buildCycleMapModel(reordered, reordered));
  const positions = (flow: typeof before) => Object.fromEntries(
    flow.nodes.map(item => [item.nodeId, [item.flowX, item.flowY]]),
  );

  assert.deepEqual(positions(after), positions(before),
    '同一拓扑不能因为自动化改变触发先后而上下跳位');
});

test('buildCycleFlowModel exposes a compact collision-safe layout for deep chains', async () => {
  const { buildCycleFlowModel, buildCycleMapModel } = await import('../quad/cycleTraceModel.ts');
  const nodes = Array.from({ length: 10 }, (_, depth) => node(
    depth === 0 ? 'center' : `depth-${depth}`,
    depth === 0 ? null : depth === 1 ? 'center' : `depth-${depth - 1}`,
    'active',
    depth * 80,
    depth,
    depth,
  ));
  const edges = nodes.slice(1).map((item, index) => ({
    fromId: index === 0 ? 'center' : `depth-${index}`,
    toId: item.nodeId,
  }));
  const compiled = compilation(nodes, edges);

  const flow = buildCycleFlowModel(buildCycleMapModel(compiled, compiled));
  const ordered = [...flow.nodes].sort((left, right) => left.flowDepth - right.flowDepth);
  const minimumGap = Math.min(...ordered.slice(1).map((item, index) => item.flowX - ordered[index].flowX));

  assert.equal(flow.compact, true);
  assert.ok(flow.nodeWidthPct < minimumGap,
    '深链节点宽度必须小于相邻深度列间距，才能在同一画面完整展示');
  assert.ok(flow.nodeWidthPct > 0 && flow.nodeHeightPct > 0);
});
