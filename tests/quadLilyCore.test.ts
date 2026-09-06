import assert from 'node:assert/strict';
import test from 'node:test';

test('creates four isolated Lily Pads whose musical settings can change independently', async () => {
  const { createQuadLilyWorkspace, updateLilyPad } = await import('../quad/core.ts');

  const workspace = createQuadLilyWorkspace();

  assert.deepEqual(Object.keys(workspace.pads), ['A', 'B', 'C', 'D']);
  assert.equal(workspace.masterPlaying, false);
  assert.equal(workspace.fm1Tone, 'follow');

  for (const padId of ['A', 'B', 'C', 'D'] as const) {
    const pad = workspace.pads[padId];
    assert.equal(pad.id, padId);
    assert.equal(pad.intervalMs, 600);
    assert.equal(pad.playing, false);
    assert.equal(pad.loop, true);
    assert.equal(pad.locked, false);
    assert.equal(pad.velocity, 100 / 127);
    assert.equal(pad.rememberedTone, 'follow');
    assert.equal(pad.rootMidi, 60);
    assert.equal(pad.scaleKey, 'majorPentatonic');
    assert.equal(pad.octaveTranspose, 0);
    assert.equal(pad.midiChannel, ({ A: 1, B: 2, C: 3, D: 4 } as const)[padId]);
    assert.deepEqual(pad.formations, []);
    assert.deepEqual(pad.nodes, [{
      id: 'center',
      x: 0.5,
      y: 0.5,
      range: 0.225,
      scaleStep: 0,
      isCenter: true,
    }]);
  }
  assert.notEqual(workspace.pads.A.nodes, workspace.pads.B.nodes);

  const changed = updateLilyPad(workspace, 'A', {
    rootMidi: 67,
    scaleKey: 'minorPentatonic',
    octaveTranspose: -1,
    velocity: 0.55,
  });

  assert.deepEqual({
    rootMidi: changed.pads.A.rootMidi,
    scaleKey: changed.pads.A.scaleKey,
    octaveTranspose: changed.pads.A.octaveTranspose,
    velocity: changed.pads.A.velocity,
  }, {
    rootMidi: 67,
    scaleKey: 'minorPentatonic',
    octaveTranspose: -1,
    velocity: 0.55,
  });
  assert.deepEqual({
    rootMidi: changed.pads.B.rootMidi,
    scaleKey: changed.pads.B.scaleKey,
    octaveTranspose: changed.pads.B.octaveTranspose,
    velocity: changed.pads.B.velocity,
  }, {
    rootMidi: 60,
    scaleKey: 'majorPentatonic',
    octaveTranspose: 0,
    velocity: 100 / 127,
  });
  assert.equal(workspace.pads.A.rootMidi, 60);
});

test('adds, moves, updates and deletes nodes immutably while preserving wide-canvas geometry', async () => {
  const {
    addLilyNode,
    createQuadLilyWorkspace,
    deleteLilyNode,
    moveLilyNode,
    updateLilyNode,
  } = await import('../quad/core.ts');
  const original = createQuadLilyWorkspace();

  const added = addLilyNode(original, 'A', {
    id: 'lead',
    x: -0.4,
    y: 1.4,
    range: 3,
    scaleStep: 4,
  });
  assert.deepEqual(added.pads.A.nodes[1], {
    id: 'lead',
    x: -0.4,
    y: 1.4,
    range: 1,
    scaleStep: 4,
    isCenter: false,
  });
  assert.equal(original.pads.A.nodes.length, 1);
  assert.deepEqual(added.pads.B, original.pads.B);

  const moved = moveLilyNode(added, 'A', 'lead', { x: 0.25, y: 0.75 });
  assert.deepEqual(
    { x: moved.pads.A.nodes[1].x, y: moved.pads.A.nodes[1].y },
    { x: 0.25, y: 0.75 },
  );
  assert.deepEqual(
    { x: added.pads.A.nodes[1].x, y: added.pads.A.nodes[1].y },
    { x: -0.4, y: 1.4 },
  );

  const updated = updateLilyNode(moved, 'A', 'lead', { range: -2, scaleStep: -3 });
  assert.equal(updated.pads.A.nodes[1].range, 0);
  assert.equal(updated.pads.A.nodes[1].scaleStep, -3);

  const withoutCenter = deleteLilyNode(updated, 'A', 'center');
  assert.equal(withoutCenter.pads.A.nodes.some((node) => node.isCenter), true);
  const deleted = deleteLilyNode(updated, 'A', 'lead');
  assert.deepEqual(deleted.pads.A.nodes.map(({ id }) => id), ['center']);
});

test('a locked Pad rejects geometry edits while still allowing a node pitch update', async () => {
  const {
    addLilyNode,
    createQuadLilyWorkspace,
    deleteLilyNode,
    moveLilyNode,
    updateLilyNode,
    updateLilyPad,
  } = await import('../quad/core.ts');
  const withNode = addLilyNode(createQuadLilyWorkspace(), 'A', {
    id: 'stable',
    x: 0.2,
    y: 0.3,
    range: 0.4,
    scaleStep: 2,
  });
  const locked = updateLilyPad(withNode, 'A', { locked: true });

  const afterAdd = addLilyNode(locked, 'A', {
    id: 'blocked',
    x: 0.9,
    y: 0.9,
    range: 0.2,
    scaleStep: 8,
  });
  const afterMove = moveLilyNode(afterAdd, 'A', 'stable', { x: 0.8, y: 0.9 });
  const afterUpdate = updateLilyNode(afterMove, 'A', 'stable', {
    x: 0.7,
    y: 0.6,
    range: 0.9,
    scaleStep: 7,
  });
  const afterDelete = deleteLilyNode(afterUpdate, 'A', 'stable');

  assert.deepEqual(afterDelete.pads.A.nodes, [
    locked.pads.A.nodes[0],
    { ...locked.pads.A.nodes[1], scaleStep: 7 },
  ]);
});

test('stores node Motion immutably and a locked Pad rejects Motion edits', async () => {
  const { createQuadLilyWorkspace, updateLilyNode, updateLilyPad } = await import('../quad/core.ts');
  const original = createQuadLilyWorkspace();
  const withMotion = updateLilyNode(original, 'A', 'center', {
    motion: {
      mode: 'orbit',
      amount: 0.18,
      rateCycles: 3,
      phaseOffset: 0.25,
      direction: -1,
    },
  });

  assert.deepEqual(withMotion.pads.A.nodes[0].motion, {
    mode: 'orbit',
    amount: 0.18,
    rateCycles: 3,
    phaseOffset: 0.25,
    direction: -1,
  });
  assert.equal(original.pads.A.nodes[0].motion, undefined);

  const locked = updateLilyPad(withMotion, 'A', { locked: true });
  const rejected = updateLilyNode(locked, 'A', 'center', { motion: { mode: 'off' } });
  assert.deepEqual(rejected.pads.A.nodes[0].motion, withMotion.pads.A.nodes[0].motion);
});

test('stores and restores an optional integer endpoint B pitch while rejecting fractional updates', async () => {
  const { createQuadLilyWorkspace, parseQuadLilyWorkspace, updateLilyNode } = await import('../quad/core.ts');
  const original = createQuadLilyWorkspace();
  const updated = updateLilyNode(original, 'A', 'center', {
    endpointPitch: { bStep: 7 },
  } as never);
  assert.deepEqual((updated.pads.A.nodes[0] as typeof updated.pads.A.nodes[0] & {
    endpointPitch?: { bStep: number };
  }).endpointPitch, { bStep: 7 });
  assert.equal((original.pads.A.nodes[0] as typeof original.pads.A.nodes[0] & {
    endpointPitch?: { bStep: number };
  }).endpointPitch, undefined);

  const rejected = updateLilyNode(updated, 'A', 'center', {
    endpointPitch: { bStep: 2.5 },
  } as never);
  assert.deepEqual((rejected.pads.A.nodes[0] as typeof rejected.pads.A.nodes[0] & {
    endpointPitch?: { bStep: number };
  }).endpointPitch, { bStep: 7 });

  const parsed = parseQuadLilyWorkspace(JSON.stringify(updated));
  assert.deepEqual((parsed.pads.A.nodes[0] as typeof parsed.pads.A.nodes[0] & {
    endpointPitch?: { bStep: number };
  }).endpointPitch, { bStep: 7 });
});

test('plans one no-feedback cycle from the center using source range and distance order', async () => {
  const {
    addLilyNode,
    createQuadLilyWorkspace,
    planLilyCycle,
    updateLilyPad,
  } = await import('../quad/core.ts');
  let workspace = updateLilyPad(createQuadLilyWorkspace(), 'A', { intervalMs: 800 });
  workspace = addLilyNode(workspace, 'A', {
    id: 'near', x: 0.6, y: 0.5, range: 0.3, scaleStep: 1,
  });
  workspace = addLilyNode(workspace, 'A', {
    id: 'far', x: 0.5, y: 0.7, range: 0.4, scaleStep: 2,
  });
  workspace = addLilyNode(workspace, 'A', {
    id: 'shared', x: 0.8, y: 0.5, range: 0.2, scaleStep: 3,
  });
  workspace = addLilyNode(workspace, 'A', {
    id: 'disconnected', x: 0, y: 0, range: 0.1, scaleStep: 9,
  });

  const events = planLilyCycle(workspace.pads.A);

  assert.deepEqual(events, [
    { nodeId: 'center', delayMs: 0, depth: 0, scaleStep: 0 },
    { nodeId: 'near', delayMs: 200, depth: 1, scaleStep: 1 },
    { nodeId: 'far', delayMs: 400, depth: 1, scaleStep: 2 },
    { nodeId: 'shared', delayMs: 400, depth: 2, scaleStep: 3 },
  ]);
  assert.equal(new Set(events.map(({ nodeId }) => nodeId)).size, events.length);
});

test('clear and reset affect only the selected Pad', async () => {
  const {
    addLilyNode,
    clearLilyPad,
    createQuadLilyWorkspace,
    moveLilyNode,
    resetLilyPad,
    updateLilyPad,
  } = await import('../quad/core.ts');
  let workspace = createQuadLilyWorkspace();
  workspace = updateLilyPad(workspace, 'A', {
    intervalMs: 930,
    rootMidi: 69,
    rememberedTone: 12,
  });
  workspace = moveLilyNode(workspace, 'A', 'center', { x: 0.35, y: 0.4 });
  workspace = addLilyNode(workspace, 'A', {
    id: 'temporary', x: 0.4, y: 0.4, range: 0.2, scaleStep: 5,
  });
  workspace = addLilyNode(workspace, 'B', {
    id: 'keep-me', x: 0.7, y: 0.2, range: 0.3, scaleStep: -2,
  });
  workspace = { ...workspace, masterPlaying: true, fm1Tone: 44 };
  const originalB = structuredClone(workspace.pads.B);

  const cleared = clearLilyPad(workspace, 'A');

  assert.deepEqual(cleared.pads.A.nodes, [{
    ...workspace.pads.A.nodes[0],
  }]);
  assert.equal(cleared.pads.A.intervalMs, 930);
  assert.equal(cleared.pads.A.rootMidi, 69);
  assert.equal(cleared.pads.A.rememberedTone, 12);
  assert.deepEqual(cleared.pads.B, originalB);
  assert.equal(cleared.masterPlaying, true);
  assert.equal(cleared.fm1Tone, 44);

  const reset = resetLilyPad(cleared, 'A');

  assert.deepEqual(reset.pads.A, createQuadLilyWorkspace().pads.A);
  assert.deepEqual(reset.pads.B, originalB);
  assert.equal(reset.masterPlaying, true);
  assert.equal(reset.fm1Tone, 44);
  assert.equal(workspace.pads.A.nodes.length, 2);
});

test('parses persisted workspace data and fills missing Pad fields with safe defaults', async () => {
  const { parseQuadLilyWorkspace } = await import('../quad/core.ts');
  const parsed = parseQuadLilyWorkspace(JSON.stringify({
    masterPlaying: true,
    fm1Tone: 24,
    pads: {
      A: {
        intervalMs: 920,
        playing: true,
        loop: false,
        locked: true,
        velocity: 0.45,
        rememberedTone: 9,
        rootMidi: 67,
        scaleKey: 'minorPentatonic',
        octaveTranspose: -1,
        nodes: [
          { id: 'center', x: -2, y: 3, range: 4, scaleStep: 0, isCenter: true },
          { id: 'edge', x: 0.2, y: 0.7, range: 0.35, scaleStep: -4, isCenter: false },
          { id: '', x: 0.1, y: 0.1, range: 0.2, scaleStep: 2, isCenter: false },
        ],
      },
      B: { rootMidi: 65 },
    },
  }));

  assert.equal(parsed.kind, 'gemidi.quad-lily-workspace');
  assert.equal(parsed.version, 1);
  assert.equal(parsed.masterPlaying, true);
  assert.equal(parsed.fm1Tone, 24);
  assert.deepEqual(parsed.pads.A, {
    id: 'A',
    intervalMs: 920,
    phraseSteps: 4,
    phraseMode: 'fixed',
    playing: true,
    loop: false,
    locked: true,
    velocity: 0.45,
    rememberedTone: 9,
    rootMidi: 67,
    scaleKey: 'minorPentatonic',
    octaveTranspose: -1,
    midiChannel: 1,
    formations: [],
    nodes: [
      { id: 'center', x: -2, y: 3, range: 1, scaleStep: 0, isCenter: true },
      { id: 'edge', x: 0.2, y: 0.7, range: 0.35, scaleStep: -4, isCenter: false },
    ],
  });
  assert.equal(parsed.pads.B.rootMidi, 65);
  assert.equal(parsed.pads.B.intervalMs, 600);
  assert.deepEqual(parsed.pads.B.nodes, [{
    id: 'center', x: 0.5, y: 0.5, range: 0.225, scaleStep: 0, isCenter: true,
  }]);
  assert.deepEqual(parsed.pads.C, {
    ...parsed.pads.D,
    id: 'C',
    midiChannel: 3,
  });
  assert.notEqual(parsed.pads.B.nodes, parsed.pads.C.nodes);
});

test('restores persisted ORBIT, PENDULUM and DRAW node Motion safely', async () => {
  const { parseQuadLilyWorkspace } = await import('../quad/core.ts');
  const parsed = parseQuadLilyWorkspace(JSON.stringify({
    pads: {
      A: {
        nodes: [
          {
            id: 'center', x: 0.5, y: 0.5, range: 0.225, scaleStep: 0, isCenter: true,
            motion: { mode: 'orbit', amount: 0.18, rateCycles: 3, phaseOffset: 0.25, direction: -1 },
          },
          {
            id: 'pend', x: 0.3, y: 0.4, range: 0.2, scaleStep: 2, isCenter: false,
            motion: { mode: 'pendulum', amount: 0.2, rateCycles: 5, phaseOffset: 0, direction: 1, angleDegrees: 45 },
          },
          {
            id: 'draw', x: 0.6, y: 0.4, range: 0.2, scaleStep: 4, isCenter: false,
            motion: {
              mode: 'draw', rateCycles: 8, phaseOffset: 0.1, direction: 1,
              path: [{ phase: 0, dx: 0, dy: 0 }, { phase: 0.5, dx: 0.2, dy: -0.1 }],
            },
          },
        ],
      },
    },
  }));

  assert.deepEqual(parsed.pads.A.nodes.map(node => node.motion), [
    { mode: 'orbit', amount: 0.18, rateCycles: 3, phaseOffset: 0.25, direction: -1 },
    { mode: 'pendulum', amount: 0.2, rateCycles: 5, phaseOffset: 0, direction: 1, angleDegrees: 45 },
    {
      mode: 'draw', rateCycles: 8, phaseOffset: 0.1, direction: 1,
      path: [{ phase: 0, dx: 0, dy: 0 }, { phase: 0.5, dx: 0.2, dy: -0.1 }],
    },
  ]);

  const malformed = parseQuadLilyWorkspace(JSON.stringify({
    pads: {
      B: {
        nodes: [{
          id: 'center', x: 0.5, y: 0.5, range: 0.225, scaleStep: 0, isCenter: true,
          motion: { mode: 'teleport', amount: 'loud' },
        }],
      },
    },
  }));
  assert.equal(malformed.pads.B.nodes[0].motion, undefined);
});

test('bounds, sorts and de-duplicates an oversized persisted DRAW path', async () => {
  const { parseQuadLilyWorkspace } = await import('../quad/core.ts');
  const path = Array.from({ length: 320 }, (_, index) => ({
    phase: index % 2 === 0 ? index / 320 : (index - 1) / 320,
    dx: index / 100,
    dy: -index / 100,
  }));
  const parsed = parseQuadLilyWorkspace(JSON.stringify({
    pads: {
      A: {
        nodes: [{
          id: 'center', x: 0.5, y: 0.5, range: 0.225, scaleStep: 0, isCenter: true,
          motion: { mode: 'draw', path },
        }],
      },
    },
  }));
  const motion = parsed.pads.A.nodes[0].motion;
  assert.equal(motion?.mode, 'draw');
  if (motion?.mode !== 'draw') return;
  assert.ok((motion.path?.length ?? 0) <= 256);
  assert.deepEqual(
    motion.path?.map(frame => frame.phase),
    [...new Set(motion.path?.map(frame => frame.phase))].sort((left, right) => left - right),
  );
  assert.ok(motion.path?.every(frame => Math.abs(frame.dx) <= 1 && Math.abs(frame.dy) <= 1));
});

test('malformed persisted text cannot execute code and falls back to a new workspace', async () => {
  const { createQuadLilyWorkspace, parseQuadLilyWorkspace } = await import('../quad/core.ts');
  const marker = '__quadLilyParserExecuted';
  const runtime = globalThis as typeof globalThis & Record<string, unknown>;
  runtime[marker] = 0;

  const parsed = parseQuadLilyWorkspace(
    `{"pads":{}}; globalThis.${marker} = 1`,
  );

  assert.deepEqual(parsed, createQuadLilyWorkspace());
  assert.equal(runtime[marker], 0);
  delete runtime[marker];
});
