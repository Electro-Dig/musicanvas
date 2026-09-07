import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../quad/core.ts';

test('bulk tempo edit changes only tempo fields across all four pads', () => {
  const w = core.createQuadLilyWorkspace();
  const next = core.patchAllPadTiming(w, { intervalMs: 500, rootMidi: 90 } as any);
  for (const id of core.QUAD_PAD_IDS) {
    assert.equal(next.pads[id].intervalMs, 500);
    assert.equal(next.pads[id].rootMidi, w.pads[id].rootMidi);
    assert.equal(next.pads[id].velocity, w.pads[id].velocity);
    assert.deepEqual(next.pads[id].nodes, w.pads[id].nodes);
  }
  assert.equal(w.pads.A.intervalMs, 600);
});
