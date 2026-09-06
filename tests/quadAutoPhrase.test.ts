import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuadLilyWorkspace, compileLilyCycle, parseQuadLilyWorkspace } from '../quad/core.ts';

test('new canvas loops for four steps until automatic mode is enabled', () => {
  const p = createQuadLilyWorkspace().pads.A;
  assert.equal(compileLilyCycle(p).intervalMs, 600);
});

test('automatic mode follows the last reachable sounding event, not the fixed step count', () => {
  const p = createQuadLilyWorkspace().pads.A;
  p.phraseMode = 'auto';
  p.phraseSteps = 16;
  p.nodes = [
    { ...p.nodes[0], x: 0, y: 0, range: .11 },
    { ...p.nodes[0], id: 'n1', isCenter: false, x: .1, y: 0, range: .11 },
    { ...p.nodes[0], id: 'n2', isCenter: false, x: .2, y: 0, range: .01 },
    { ...p.nodes[0], id: 'far', isCenter: false, x: 1, y: 1 },
  ];
  assert.equal(compileLilyCycle(p).intervalMs, 450);
  p.nodes[2].muted = true;
  assert.equal(compileLilyCycle(p).intervalMs, 300);
});

test('legacy saved canvases retain their fixed phrase duration', () => {
  const w = JSON.parse(JSON.stringify(createQuadLilyWorkspace()));
  delete w.pads.A.phraseMode;
  w.pads.A.phraseSteps = 16;
  assert.equal(compileLilyCycle(parseQuadLilyWorkspace(JSON.stringify(w)).pads.A).intervalMs, 2400);
});
