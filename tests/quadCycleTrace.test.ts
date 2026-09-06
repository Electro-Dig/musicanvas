import assert from 'node:assert/strict';
import test from 'node:test';

import type { QuadLilyPad } from '../quad/core.ts';

function createPad(nodes: QuadLilyPad['nodes']): QuadLilyPad {
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

test('compileLilyCycle records directed parents and groups simultaneous branches into waves', async () => {
  const core = await import('../quad/core.ts');
  const compileLilyCycle = (core as typeof core & {
    compileLilyCycle?: (pad: QuadLilyPad) => {
      nodes: Array<Record<string, unknown>>;
      edges: Array<Record<string, unknown>>;
      waves: Array<Record<string, unknown>>;
    };
  }).compileLilyCycle;

  assert.equal(typeof compileLilyCycle, 'function', '周期编译器应是可复用的纯函数');

  const result = compileLilyCycle!(createPad([
    { id: 'center', x: 0.5, y: 0.5, range: 0.11, scaleStep: 0, isCenter: true },
    { id: 'a', x: 0.58, y: 0.5, range: 0.1, scaleStep: 1, isCenter: false },
    { id: 'b', x: 0.5, y: 0.59, range: 0.05, scaleStep: 2, isCenter: false },
    { id: 'a2', x: 0.66, y: 0.5, range: 0.05, scaleStep: 3, isCenter: false },
  ]));

  assert.deepEqual(result.nodes.map(node => ({
    nodeId: node.nodeId,
    parentId: node.parentId,
    status: node.status,
    offsetMs: node.offsetMs,
    phase: node.phase,
    depth: node.depth,
    order: node.order,
    wave: node.wave,
  })), [
    { nodeId: 'center', parentId: null, status: 'active', offsetMs: 0, phase: 0, depth: 0, order: 0, wave: 0 },
    { nodeId: 'a', parentId: 'center', status: 'active', offsetMs: 200, phase: 0.25, depth: 1, order: 1, wave: 1 },
    { nodeId: 'b', parentId: 'center', status: 'active', offsetMs: 400, phase: 0.5, depth: 1, order: 2, wave: 2 },
    { nodeId: 'a2', parentId: 'a', status: 'active', offsetMs: 400, phase: 0.5, depth: 2, order: 3, wave: 2 },
  ]);
  assert.deepEqual(result.edges.map(edge => ({
    fromId: edge.fromId,
    toId: edge.toId,
    orderWithinParent: edge.orderWithinParent,
  })), [
    { fromId: 'center', toId: 'a', orderWithinParent: 0 },
    { fromId: 'center', toId: 'b', orderWithinParent: 1 },
    { fromId: 'a', toId: 'a2', orderWithinParent: 0 },
  ]);
  assert.deepEqual(result.waves.map(wave => ({
    wave: wave.wave,
    offsetMs: wave.offsetMs,
    phase: wave.phase,
    nodeIds: wave.nodeIds,
  })), [
    { wave: 0, offsetMs: 0, phase: 0, nodeIds: ['center'] },
    { wave: 1, offsetMs: 200, phase: 0.25, nodeIds: ['a'] },
    { wave: 2, offsetMs: 400, phase: 0.5, nodeIds: ['b', 'a2'] },
  ]);
});

test('compileLilyCycle retains reachable nodes beyond 100% and distinguishes unreachable nodes', async () => {
  const core = await import('../quad/core.ts');
  const compileLilyCycle = (core as typeof core & {
    compileLilyCycle?: (pad: QuadLilyPad) => {
      nodes: Array<{
        nodeId: string;
        status: string;
        offsetMs: number | null;
        phase: number | null;
        parentId: string | null;
      }>;
    };
  }).compileLilyCycle;

  assert.equal(typeof compileLilyCycle, 'function', '周期编译器应保留未发声原因');

  const result = compileLilyCycle!(createPad([
    { id: 'center', x: 0.5, y: 0.5, range: 0.081, scaleStep: 0, isCenter: true },
    { id: 'c1', x: 0.58, y: 0.5, range: 0.081, scaleStep: 1, isCenter: false },
    { id: 'c2', x: 0.66, y: 0.5, range: 0.081, scaleStep: 2, isCenter: false },
    { id: 'c3', x: 0.74, y: 0.5, range: 0.081, scaleStep: 3, isCenter: false },
    { id: 'c4', x: 0.82, y: 0.5, range: 0.081, scaleStep: 4, isCenter: false },
    { id: 'island', x: 0.1, y: 0.1, range: 0.05, scaleStep: 9, isCenter: false },
  ]));
  const byId = Object.fromEntries(result.nodes.map(node => [node.nodeId, node]));

  assert.deepEqual({
    status: byId.c3.status,
    offsetMs: byId.c3.offsetMs,
    phase: byId.c3.phase,
  }, { status: 'active', offsetMs: 600, phase: 0.75 });
  assert.deepEqual({
    status: byId.c4.status,
    offsetMs: byId.c4.offsetMs,
    phase: byId.c4.phase,
    parentId: byId.c4.parentId,
  }, { status: 'outside-cycle', offsetMs: 800, phase: 1, parentId: 'c3' });
  assert.deepEqual({
    status: byId.island.status,
    offsetMs: byId.island.offsetMs,
    phase: byId.island.phase,
    parentId: byId.island.parentId,
  }, { status: 'unreachable', offsetMs: null, phase: null, parentId: null });
});
