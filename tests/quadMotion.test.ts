import assert from 'node:assert/strict';
import test from 'node:test';

test('off motion returns a safe copy without rewriting the base point', async () => {
  const { resolveMotionPosition } = await import('../quad/motion.ts');
  const base = { x: 0.35, y: 0.65 };

  const position = resolveMotionPosition(base, { mode: 'off' }, 19.75);

  assert.deepEqual(position, { x: 0.35, y: 0.65 });
  assert.notEqual(position, base);
  assert.deepEqual(base, { x: 0.35, y: 0.65 });
});

test('orbit circles the base once over the requested number of Pad cycles', async () => {
  const { resolveMotionPosition } = await import('../quad/motion.ts');
  const base = { x: 0.5, y: 0.5 };
  const motion = {
    mode: 'orbit' as const,
    amount: 0.2,
    rateCycles: 2,
    phaseOffset: 0,
    direction: 1 as const,
  };

  assertPointClose(resolveMotionPosition(base, motion, 0), { x: 0.7, y: 0.5 });
  assertPointClose(resolveMotionPosition(base, motion, 0.5), { x: 0.5, y: 0.7 });
  assertPointClose(resolveMotionPosition(base, motion, 1), { x: 0.3, y: 0.5 });
  assertPointClose(resolveMotionPosition(base, motion, 2), { x: 0.7, y: 0.5 });
  assert.deepEqual(base, { x: 0.5, y: 0.5 });
});

test('phase offset and reverse direction shift motion without resetting at later cycles', async () => {
  const { resolveMotionPosition } = await import('../quad/motion.ts');
  const motion = {
    mode: 'orbit' as const,
    amount: 0.2,
    rateCycles: 2,
    phaseOffset: 0.25,
    direction: -1 as const,
  };

  assertPointClose(resolveMotionPosition({ x: 0.5, y: 0.5 }, motion, 0), {
    x: 0.5,
    y: 0.7,
  });
  assertPointClose(resolveMotionPosition({ x: 0.5, y: 0.5 }, motion, 0.5), {
    x: 0.7,
    y: 0.5,
  });
  assertPointClose(resolveMotionPosition({ x: 0.5, y: 0.5 }, motion, 2), {
    x: 0.5,
    y: 0.7,
  });
});

test('pendulum travels out and back along its configured angle', async () => {
  const { resolveMotionPosition } = await import('../quad/motion.ts');
  const motion = {
    mode: 'pendulum' as const,
    amount: 0.2,
    angleDegrees: 90,
    rateCycles: 1,
    phaseOffset: 0,
    direction: 1 as const,
  };

  assertPointClose(resolveMotionPosition({ x: 0.5, y: 0.5 }, motion, 0), {
    x: 0.5,
    y: 0.5,
  });
  assertPointClose(resolveMotionPosition({ x: 0.5, y: 0.5 }, motion, 0.25), {
    x: 0.5,
    y: 0.7,
  });
  assertPointClose(resolveMotionPosition({ x: 0.5, y: 0.5 }, motion, 0.5), {
    x: 0.5,
    y: 0.5,
  });
  assertPointClose(resolveMotionPosition({ x: 0.5, y: 0.5 }, motion, 0.75), {
    x: 0.5,
    y: 0.3,
  });
});

test('draw linearly interpolates its open path without inventing a closing segment', async () => {
  const { resolveMotionPosition } = await import('../quad/motion.ts');
  const motion = {
    mode: 'draw' as const,
    rateCycles: 1,
    phaseOffset: 0,
    direction: 1 as const,
    path: [
      { phase: 0, dx: 0, dy: 0 },
      { phase: 0.25, dx: 0.2, dy: 0 },
      { phase: 0.75, dx: 0, dy: 0.2 },
    ],
  };
  const base = { x: 0.4, y: 0.4 };

  assertPointClose(resolveMotionPosition(base, motion, 0.125), { x: 0.5, y: 0.4 });
  assertPointClose(resolveMotionPosition(base, motion, 0.5), { x: 0.5, y: 0.5 });
  assertPointClose(resolveMotionPosition(base, motion, 0.875), { x: 0.4, y: 0.6 });
  assertPointClose(resolveMotionPosition(base, motion, 1.125), { x: 0.5, y: 0.4 });
  assert.deepEqual(base, { x: 0.4, y: 0.4 });
});

test('flash stays home in the first half-cycle then jumps to the relative target', async () => {
  const { resolveMotionPosition } = await import('../quad/motion.ts');
  const base = { x: 0.4, y: 0.5 };
  const motion = {
    mode: 'flash' as const,
    targetDx: 0.2,
    targetDy: -0.1,
    rateCycles: 2,
  };

  assertPointClose(resolveMotionPosition(base, motion, 0), { x: 0.4, y: 0.5 });
  assertPointClose(resolveMotionPosition(base, motion, 0.5), { x: 0.4, y: 0.5 });
  assertPointClose(resolveMotionPosition(base, motion, 1), { x: 0.6, y: 0.4 });
  assertPointClose(resolveMotionPosition(base, motion, 1.5), { x: 0.6, y: 0.4 });
  assertPointClose(resolveMotionPosition(base, motion, 2), { x: 0.4, y: 0.5 });
});

test('draw orders keyframes by phase instead of trusting capture insertion order', async () => {
  const { resolveMotionPosition } = await import('../quad/motion.ts');
  const motion = {
    mode: 'draw' as const,
    path: [
      { phase: 0.25, dx: 0.2, dy: 0 },
      { phase: 0.75, dx: 0, dy: 0.2 },
      { phase: 0, dx: 0, dy: 0 },
    ],
  };

  assertPointClose(resolveMotionPosition({ x: 0.4, y: 0.4 }, motion, 0.5), {
    x: 0.5,
    y: 0.5,
  });
});

test('an unknown motion mode safely behaves as off instead of inventing movement', async () => {
  const { resolveMotionPosition } = await import('../quad/motion.ts');
  const base = { x: 0.2, y: 0.8 };

  const position = resolveMotionPosition(
    base,
    { mode: 'teleport', amount: 1 } as never,
    0.25,
  );

  assert.deepEqual(position, base);
  assert.notEqual(position, base);
});

test('draw wraps out-of-range phases and ignores non-finite captured keyframes', async () => {
  const { resolveMotionPosition } = await import('../quad/motion.ts');
  const motion = {
    mode: 'draw' as const,
    path: [
      { phase: -0.25, dx: 0.2, dy: 0 },
      { phase: 1.25, dx: 0, dy: 0.2 },
      { phase: Number.NaN, dx: Number.POSITIVE_INFINITY, dy: 1 },
    ],
  };

  assertPointClose(resolveMotionPosition({ x: 0.4, y: 0.4 }, motion, 0.875), {
    x: 0.6,
    y: 0.4,
  });
});

test('motion output stays inside the editable zero-to-one plane', async () => {
  const { resolveMotionPosition } = await import('../quad/motion.ts');
  const base = { x: 0.9, y: 0.1 };

  const position = resolveMotionPosition(base, {
    mode: 'orbit',
    amount: 0.4,
    rateCycles: 1,
  }, 0);

  assertPointClose(position, { x: 1, y: 0.1 });
  assert.deepEqual(base, { x: 0.9, y: 0.1 });
});

test('invalid timing inputs fall back to one forward cycle at zero phase', async () => {
  const { resolveMotionPosition } = await import('../quad/motion.ts');

  const position = resolveMotionPosition({ x: 0.5, y: 0.5 }, {
    mode: 'orbit',
    amount: 0.2,
    rateCycles: 0,
    phaseOffset: Number.NaN,
    direction: 0 as never,
  }, 0.25);

  assertPointClose(position, { x: 0.5, y: 0.7 });
});

test('compiles timestamped absolute drag samples into a sorted relative DRAW path', async () => {
  const { compileDrawPath } = await import('../quad/motion.ts');
  const base = { x: 0.5, y: 0.5 };
  const samples = [
    { timeMs: 300, x: 0.875, y: 0.25 },
    { timeMs: 100, x: 0.75, y: 0.5 },
    { timeMs: 200, x: 0.5, y: 0.75 },
  ];

  const path = compileDrawPath(base, samples, 400);

  assert.deepEqual(path, [
    { phase: 0, dx: 0.25, dy: 0 },
    { phase: 0.25, dx: 0, dy: 0.25 },
    { phase: 0.5, dx: 0.375, dy: -0.25 },
  ]);
  assert.deepEqual(base, { x: 0.5, y: 0.5 });
  assert.deepEqual(samples, [
    { timeMs: 300, x: 0.875, y: 0.25 },
    { timeMs: 100, x: 0.75, y: 0.5 },
    { timeMs: 200, x: 0.5, y: 0.75 },
  ]);
});

test('DRAW compilation filters unusable samples, clips absolute positions, and rejects a bad duration', async () => {
  const { compileDrawPath } = await import('../quad/motion.ts');
  const samples = [
    { timeMs: 500, x: 0.2, y: 0.2 },
    { timeMs: 100, x: -1, y: 2 },
    { timeMs: Number.NaN, x: 0.4, y: 0.4 },
    { timeMs: 200, x: Number.POSITIVE_INFINITY, y: 0.5 },
    { timeMs: 250, x: 0.75, y: 0.25 },
  ];

  assert.deepEqual(compileDrawPath({ x: 0.5, y: 0.5 }, samples, 300), [
    { phase: 0, dx: -0.5, dy: 0.5 },
    { phase: 0.5, dx: 0.25, dy: -0.25 },
  ]);
  assert.deepEqual(compileDrawPath({ x: 0.5, y: 0.5 }, samples, 0), []);
});

test('motion endpoint pitch picks the nearest physical A/B extreme with deterministic direction ties', async () => {
  const module = await import('../quad/motion.ts');
  const resolveMotionPitchStep = (module as {
    resolveMotionPitchStep?: (
      baseStep: number,
      motion: Parameters<typeof module.resolveMotionPosition>[1],
      endpointPitch: { bStep: number } | undefined,
      cyclePosition: number,
    ) => number;
  }).resolveMotionPitchStep;
  assert.equal(typeof resolveMotionPitchStep, 'function', '需要把运动端点编译成离散的 A/B 音高');

  const orbit = { mode: 'orbit' as const, amount: 0.2, rateCycles: 1, direction: 1 };
  assert.equal(resolveMotionPitchStep!(0, orbit, { bStep: 7 }, 0.25), 7);
  assert.equal(resolveMotionPitchStep!(0, orbit, { bStep: 7 }, 0.75), 0);
  assert.equal(resolveMotionPitchStep!(0, { ...orbit, direction: -1 }, { bStep: 7 }, 0.25), 7);

  const pendulum = { mode: 'pendulum' as const, amount: 0.2, rateCycles: 1, direction: 1 };
  assert.equal(resolveMotionPitchStep!(2, pendulum, { bStep: -3 }, 0), 2);
  assert.equal(resolveMotionPitchStep!(2, { ...pendulum, direction: -1 }, { bStep: -3 }, 0), -3);
  assert.equal(resolveMotionPitchStep!(2, { ...pendulum, direction: -1 }, { bStep: -3 }, 0.1), -3,
    '反向运动的音高区域必须跟随画面中的实际相位');
  assert.equal(resolveMotionPitchStep!(2, { mode: 'off' }, { bStep: -3 }, 99), 2);
  assert.equal(resolveMotionPitchStep!(2, { mode: 'orbit', amount: 0 }, { bStep: -3 }, 0.25), 2,
    '没有实际位移时必须保持 A 音高');
  assert.equal(resolveMotionPitchStep!(2, orbit, undefined, 0.25), 2);
});

test('DRAW endpoint pitch uses its first and last valid captured phases and falls back to A for one frame', async () => {
  const module = await import('../quad/motion.ts');
  const resolveMotionPitchStep = (module as {
    resolveMotionPitchStep?: (baseStep: number, motion: never, endpointPitch: { bStep: number }, cyclePosition: number) => number;
  }).resolveMotionPitchStep;
  assert.equal(typeof resolveMotionPitchStep, 'function');

  const draw = {
    mode: 'draw',
    path: [
      { phase: 0.2, dx: 0, dy: 0 },
      { phase: 0.8, dx: 0.2, dy: -0.1 },
    ],
  } as const;
  assert.equal(resolveMotionPitchStep!(1, draw as never, { bStep: 5 }, 0.2), 1);
  assert.equal(resolveMotionPitchStep!(1, draw as never, { bStep: 5 }, 0.8), 5);
  assert.equal(resolveMotionPitchStep!(1, {
    mode: 'draw', path: [{ phase: 0.4, dx: 0, dy: 0 }],
  } as never, { bStep: 5 }, 0.9), 1);
});

function assertPointClose(
  actual: { x: number; y: number },
  expected: { x: number; y: number },
): void {
  assert.ok(Math.abs(actual.x - expected.x) < 1e-10, `expected x=${expected.x}, got ${actual.x}`);
  assert.ok(Math.abs(actual.y - expected.y) < 1e-10, `expected y=${expected.y}, got ${actual.y}`);
}
