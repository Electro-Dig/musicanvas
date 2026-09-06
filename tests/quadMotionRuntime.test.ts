import assert from 'node:assert/strict';
import test from 'node:test';

import { createQuadLilyWorkspace, updateLilyNode } from '../quad/core.ts';

test('materializes a Pad from node Motion without rewriting its stored base geometry', async () => {
  const { materializePadMotion } = await import('../quad/motionRuntime.ts');
  const original = updateLilyNode(createQuadLilyWorkspace(), 'A', 'center', {
    motion: {
      mode: 'orbit',
      amount: 0.2,
      rateCycles: 2,
      phaseOffset: 0,
      direction: 1,
    },
  }).pads.A;

  const snapshot = materializePadMotion(original, 1);

  assert.ok(Math.abs(snapshot.nodes[0].x - 0.3) < 1e-10);
  assert.ok(Math.abs(snapshot.nodes[0].y - 0.5) < 1e-10);
  assert.equal(original.nodes[0].x, 0.5);
  assert.equal(original.nodes[0].y, 0.5);
  assert.notEqual(snapshot, original);
  assert.notEqual(snapshot.nodes, original.nodes);
});

test('builds a render trail from the same motion evaluator while keeping off nodes trail-free', async () => {
  const { buildNodeMotionTrail } = await import('../quad/motionRuntime.ts');
  const workspace = updateLilyNode(createQuadLilyWorkspace(), 'B', 'center', {
    motion: {
      mode: 'pendulum',
      amount: 0.2,
      angleDegrees: 0,
      rateCycles: 3,
    },
  });
  const node = workspace.pads.B.nodes[0];

  const trail = buildNodeMotionTrail(node, 9);

  assert.equal(trail.length, 9);
  assert.ok(Math.min(...trail.map(point => point.x)) <= 0.3 + 1e-10);
  assert.ok(Math.max(...trail.map(point => point.x)) >= 0.7 - 1e-10);
  assert.ok(trail.every(point => Math.abs(point.y - 0.5) < 1e-10));
  assert.deepEqual(buildNodeMotionTrail({ ...node, motion: { mode: 'off' } }, 9), []);
  assert.deepEqual(buildNodeMotionTrail({ ...node, motion: { mode: 'draw', path: [] } }, 9), []);
});

test('flash trail is a two-point jump line from base to target', async () => {
  const { buildNodeMotionTrail } = await import('../quad/motionRuntime.ts');
  const trail = buildNodeMotionTrail({
    id: 'flash',
    x: 0.3,
    y: 0.4,
    range: 0.1,
    scaleStep: 0,
    isCenter: false,
    motion: { mode: 'flash', targetDx: 0.2, targetDy: 0.1, rateCycles: 2 },
  });

  assert.deepEqual(trail, [
    { x: 0.3, y: 0.4 },
    { x: 0.5, y: 0.5 },
  ]);
  assert.deepEqual(buildNodeMotionTrail({
    id: 'flash-empty',
    x: 0.3,
    y: 0.4,
    range: 0.1,
    scaleStep: 0,
    isCenter: false,
    motion: { mode: 'flash', rateCycles: 2 },
  }), []);
});

test('materializes endpoint B pitch once per cycle snapshot without mutating the stored A pitch', async () => {
  const { compileLilyCycle } = await import('../quad/core.ts');
  const { materializePadMotion } = await import('../quad/motionRuntime.ts');
  const original = updateLilyNode(createQuadLilyWorkspace(), 'A', 'center', {
    motion: { mode: 'orbit', amount: 0.2, rateCycles: 1, direction: 1 },
    endpointPitch: { bStep: 6 },
  } as never).pads.A;

  const atA = materializePadMotion(original, 0);
  const atB = materializePadMotion(original, 0.25);

  assert.equal(atA.nodes[0].scaleStep, 0);
  assert.equal(atB.nodes[0].scaleStep, 6);
  assert.equal(compileLilyCycle(atB).events[0].scaleStep, 6);
  assert.equal(original.nodes[0].scaleStep, 0);
  assert.deepEqual((original.nodes[0] as typeof original.nodes[0] & {
    endpointPitch?: { bStep: number };
  }).endpointPitch, { bStep: 6 });
});
