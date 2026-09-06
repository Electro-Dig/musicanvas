import assert from 'node:assert/strict';
import test from 'node:test';

test('builds stable ROOT/N labels and real MIDI note names from the Pad scale', async () => {
  const module = await import('../quad/nodePresentation.ts').catch(() => ({}));
  const buildNodePresentations = (module as {
    buildNodePresentations?: (
      nodes: Array<{ id: string; scaleStep: number; isCenter: boolean }>,
      settings: { rootMidi: number; scaleKey: string; octaveTranspose: number },
    ) => Map<string, { shortId: string; noteName: string; midiNote: number }>;
  }).buildNodePresentations;
  assert.equal(typeof buildNodePresentations, 'function', 'Canvas 与 Cycle Map 需要共享同一份节点身份映射');

  const labels = buildNodePresentations!([
    { id: 'center', scaleStep: 0, isCenter: true },
    { id: 'node-7', scaleStep: 2, isCenter: false },
    { id: 'custom', scaleStep: -1, isCenter: false },
  ], { rootMidi: 60, scaleKey: 'majorPentatonic', octaveTranspose: 0 });

  assert.deepEqual(labels.get('center'), { shortId: 'ROOT', noteName: 'C4', midiNote: 60 });
  assert.deepEqual(labels.get('node-7'), { shortId: 'N7', noteName: 'E4', midiNote: 64 });
  assert.deepEqual(labels.get('custom'), { shortId: 'N1', noteName: 'A3', midiNote: 57 });
});

test('fallback node numbers never collide with explicit node-N ids', async () => {
  const module = await import('../quad/nodePresentation.ts').catch(() => ({}));
  const buildNodePresentations = (module as {
    buildNodePresentations?: (
      nodes: Array<{ id: string; scaleStep: number; isCenter: boolean }>,
      settings: { rootMidi: number; scaleKey: string; octaveTranspose: number },
    ) => Map<string, { shortId: string }>;
  }).buildNodePresentations;
  assert.equal(typeof buildNodePresentations, 'function');

  const labels = buildNodePresentations!([
    { id: 'center', scaleStep: 0, isCenter: true },
    { id: 'custom-a', scaleStep: 0, isCenter: false },
    { id: 'node-1', scaleStep: 0, isCenter: false },
    { id: 'custom-b', scaleStep: 0, isCenter: false },
  ], { rootMidi: 60, scaleKey: 'majorPentatonic', octaveTranspose: 0 });

  assert.equal(labels.get('custom-a')?.shortId, 'N2');
  assert.equal(labels.get('node-1')?.shortId, 'N1');
  assert.equal(labels.get('custom-b')?.shortId, 'N3');
});
