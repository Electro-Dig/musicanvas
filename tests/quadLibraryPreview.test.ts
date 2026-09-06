import assert from 'node:assert/strict';
import test from 'node:test';

import { addLilyNode, createQuadLilyWorkspace, updateLilyNode, updateLilyPad } from '../quad/core.ts';
import { buildPadLibraryPreviewModel } from '../quad/library/preview.ts';

test('素材库缩略图模型包含编队外形与双音符标记', () => {
  let workspace = addLilyNode(createQuadLilyWorkspace(), 'A', {
    id: 'n1', x: 0.62, y: 0.5, range: 0.14, scaleStep: 2,
  });
  workspace = addLilyNode(workspace, 'A', {
    id: 'n2', x: 0.5, y: 0.36, range: 0.14, scaleStep: 3,
  });
  workspace = updateLilyNode(workspace, 'A', 'n1', {
    endpointPitch: { bStep: 6 },
  });
  workspace = updateLilyPad(workspace, 'A', {
    formations: [{
      id: 'G2',
      nodeIds: ['center', 'n1', 'n2'],
      shape: 'circle',
      centerX: 0.5,
      centerY: 0.5,
      radius: 0.14,
      rateCycles: 4,
    }],
  });

  const model = buildPadLibraryPreviewModel(workspace.pads.A);
  assert.equal(model.formations.length, 1);
  assert.equal(model.formations[0].id, 'G2');
  assert.ok(model.formations[0].trail.length >= 8);
  assert.ok(model.formations[0].memberRing.length >= 4);
  assert.equal(model.nodes.find((node) => node.id === 'n1')?.dualNote, true);
  assert.equal(model.nodes.find((node) => node.id === 'center')?.dualNote, false);
});
