import assert from 'node:assert/strict';
import test from 'node:test';
import { createQuadLilyWorkspace, clearLilyPad, compileLilyCycle } from '../quad/core.ts';
import { parseCanvasDecoration, type CanvasDecoration } from '../quad/canvasDecoration.ts';
import { restoreQuadLilySession, serializeQuadLilySession } from '../quad/storage.ts';
import { createUserWorkspaceAsset, parseLibraryAsset, serializeLibraryAsset } from '../quad/library/core.ts';

const decoration: CanvasDecoration = {
  kind: 'feather',
  strokes: [{ role: 'stem', points: [[.5, .9], [.5, .1]] },
    { role: 'vein', points: [[.5, .6], [.8, .4]] }],
};

test('decorative branches survive session and library round trips without changing propagation', () => {
  const workspace = createQuadLilyWorkspace();
  const before = compileLilyCycle(workspace.pads.A);
  workspace.pads.A.decoration = decoration;
  const restored = restoreQuadLilySession(serializeQuadLilySession(workspace));
  assert.deepEqual(restored.pads.A.decoration, decoration);
  assert.deepEqual(compileLilyCycle(restored.pads.A), before);
  const asset = createUserWorkspaceAsset({ id: 'feather-test', name: 'Feather', workspace });
  const imported = parseLibraryAsset(serializeLibraryAsset(asset));
  assert.equal(imported?.type, 'workspace');
  if (imported?.type !== 'workspace') throw new Error('Expected workspace');
  assert.deepEqual(imported.payload.workspace.pads.A.decoration, decoration);
  assert.deepEqual(compileLilyCycle(imported.payload.workspace.pads.A), before);
  assert.equal(clearLilyPad(restored, 'A').pads.A.decoration, undefined);
  assert.equal(restored.pads.B.decoration, undefined);
});

test('import accepts bounded numeric drawings and discards malformed strokes', () => {
  const bad = { kind: 'feather', strokes: [
    { role: 'stem', points: [[0, 0], [1, Infinity]] },
    { role: 'stem', points: [[0, 0], [-1, .5]] },
    { role: 'script', points: [[0, 0], [1, 1]] },
    { role: 'vein', points: Array.from({ length: 257 }, () => [.5, .5]) },
    decoration.strokes[0],
  ] };
  const parsed = parseCanvasDecoration(bad);
  assert.deepEqual(parsed?.strokes, [decoration.strokes[0]]);
  assert.notEqual(parsed?.strokes[0].points, decoration.strokes[0].points);
  assert.equal(parseCanvasDecoration({ kind: 'feather', strokes: [] }), undefined);
  assert.equal(parseCanvasDecoration({ kind: 'other', strokes: decoration.strokes }), undefined);
  assert.equal(parseCanvasDecoration({ kind: 'feather', strokes: Array(100).fill(decoration.strokes[0]) })?.strokes.length, 64);
});
