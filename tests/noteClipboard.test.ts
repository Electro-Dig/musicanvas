import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuadLilyWorkspace } from '../quad/core.ts';
import { copyNotes, pasteNotes } from '../quad/noteClipboard.ts';
import { createNoteFormation } from '../quad/groupMotion.ts';

function fixture() {
  const pad = createQuadLilyWorkspace().pads.A;
  const root = pad.nodes[0];
  pad.nodes = [root, { ...root, id: 'node-1', isCenter: false, x: 0.3, scaleStep: 2 }, { ...root, id: 'node-2', isCenter: false, x: 0.4, scaleStep: 4 }];
  pad.formations = [createNoteFormation(pad.nodes.slice(1), 'circle', 4, { id: 'G1' })];
  return pad;
}
test('copy snapshot and repeated paste retain complete formation with fresh identities', () => {
  const pad = fixture();
  const clip = copyNotes(pad, ['node-1', 'node-2']);
  const result = pasteNotes(pad, clip);
  assert.equal(result.pad.nodes.length, 5);
  assert.equal(result.pad.formations!.length, 2);
  assert.notEqual(result.pad.formations![1].id, 'G1');
  assert.deepEqual(result.pad.formations![1].nodeIds, result.ids);
  assert.equal(result.pad.formations![1].centerX, pad.formations![0].centerX + 0.04);
  assert.equal(new Set(pasteNotes(result.pad, clip).pad.nodes.map(n => n.id)).size, 7);
  result.pad.nodes.at(-1)!.scaleStep = 99;
  assert.equal(clip.nodes[1].scaleStep, 4);
});
test('partial formation contains only requested nodes and root becomes ordinary', () => {
  const pad = fixture();
  const clip = copyNotes(pad, [pad.nodes[0].id, 'node-1']);
  assert.equal(clip.partialFormations, 1);
  assert.equal(clip.formations.length, 0);
  const result = pasteNotes(pad, clip);
  assert.equal(result.pad.nodes.filter(n => n.isCenter).length, 1);
  assert.equal(result.ids.length, 2);
  assert.equal(pasteNotes({ ...pad, locked: true }, clip).pad.nodes.length, 3);
});
test('cross-pad transpose preserves absolute pitch when target scale permits', () => {
  const pad = fixture();
  const target = { ...pad, octaveTranspose: pad.octaveTranspose + 1 };
  const result = pasteNotes(target, copyNotes(pad, ['node-1']));
  assert.equal(result.adjustedPitches, 0);
  assert.ok(result.pad.nodes.at(-1)!.scaleStep < pad.nodes[1].scaleStep);
});
