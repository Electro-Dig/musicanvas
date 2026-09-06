import assert from 'node:assert/strict';
import test from 'node:test';

import { restoreQuadLilySession, serializeQuadLilySession } from '../quad/storage.ts';

test('restores Pad geometry and music settings without auto-starting hardware playback', () => {
  const restored = restoreQuadLilySession(JSON.stringify({
    masterPlaying: true,
    fm1Tone: 42,
    pads: {
      A: {
        playing: true,
        intervalMs: 860,
        rootMidi: 67,
        nodes: [
          { id: 'center', x: 0.4, y: 0.5, range: 0.3, scaleStep: 0, isCenter: true },
          { id: 'kept', x: 0.6, y: 0.5, range: 0.2, scaleStep: 3, isCenter: false },
        ],
      },
      B: { playing: true },
    },
  }));

  assert.equal(restored.fm1Tone, 42);
  assert.equal(restored.pads.A.intervalMs, 860);
  assert.equal(restored.pads.A.rootMidi, 67);
  assert.deepEqual(restored.pads.A.nodes.map(node => node.id), ['center', 'kept']);
  assert.equal(restored.masterPlaying, false);
  assert.equal(Object.values(restored.pads).some(pad => pad.playing), false);
});

test('serializes only the validated workspace document', () => {
  const restored = restoreQuadLilySession(null);
  assert.deepEqual(restoreQuadLilySession(serializeQuadLilySession(restored)), restored);
});

test('旧单编队 formation 迁移为 formations 数组，并可并存多个', () => {
  const restored = restoreQuadLilySession(JSON.stringify({
    pads: {
      A: {
        formation: {
          id: 'G1',
          nodeIds: ['center', 'n1'],
          shape: 'circle',
          centerX: 0.5,
          centerY: 0.5,
          radius: 0.12,
          rateCycles: 4,
        },
        nodes: [
          { id: 'center', x: 0.5, y: 0.5, range: 0.2, scaleStep: 0, isCenter: true },
          { id: 'n1', x: 0.6, y: 0.5, range: 0.2, scaleStep: 1, isCenter: false },
        ],
      },
      B: {
        formations: [
          {
            id: 'G1',
            nodeIds: ['center', 'b1'],
            shape: 'line',
            centerX: 0.4,
            centerY: 0.5,
            radius: 0.1,
            rateCycles: 2,
          },
          {
            id: 'G2',
            nodeIds: ['b2', 'b3'],
            shape: 'circle',
            centerX: 0.7,
            centerY: 0.5,
            radius: 0.08,
            rateCycles: 3,
          },
        ],
        nodes: [
          { id: 'center', x: 0.5, y: 0.5, range: 0.2, scaleStep: 0, isCenter: true },
          { id: 'b1', x: 0.3, y: 0.5, range: 0.2, scaleStep: 1, isCenter: false },
          { id: 'b2', x: 0.65, y: 0.5, range: 0.2, scaleStep: 2, isCenter: false },
          { id: 'b3', x: 0.75, y: 0.5, range: 0.2, scaleStep: 3, isCenter: false },
        ],
      },
    },
  }));

  assert.equal(restored.pads.A.formations?.length, 1);
  assert.equal(restored.pads.A.formations?.[0]?.id, 'G1');
  assert.equal(restored.pads.B.formations?.length, 2);
  assert.deepEqual(restored.pads.B.formations?.map((item) => item.id), ['G1', 'G2']);
});
