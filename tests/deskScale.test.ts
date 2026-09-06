import assert from 'node:assert/strict';
import test from 'node:test';

import { createDeskPitchResolver } from '../quad/pitch.ts';

test('Desk scale resolver maps positive and negative degrees around the selected root', () => {
  const resolve = createDeskPitchResolver({ rootMidi: 55, intervals: [0, 2, 4, 7, 9] });

  assert.equal(resolve({ kind: 'scale-degree', degree: 0 }), 55);
  assert.equal(resolve({ kind: 'scale-degree', degree: 5 }), 67);
  assert.equal(resolve({ kind: 'scale-degree', degree: -1 }), 52);
});

test('Desk scale resolver preserves absolute MIDI notes and rejects out-of-range results', () => {
  const resolve = createDeskPitchResolver({ rootMidi: 60, intervals: [0, 3, 5, 7, 10] });

  assert.equal(resolve({ kind: 'midi-note', note: 73 }), 73);
  assert.equal(resolve({ kind: 'midi-note', note: 130 }), null);
  assert.equal(resolve({ kind: 'scale-degree', degree: 100 }), null);
});

test('Desk scale resolver refuses an empty or malformed scale instead of guessing pitches', () => {
  assert.throws(() => createDeskPitchResolver({ rootMidi: 60, intervals: [] }), {
    message: 'Desk scale needs at least one interval',
  });
  assert.throws(() => createDeskPitchResolver({ rootMidi: 60, intervals: [0, 3.5, 7] }), {
    message: 'Desk scale intervals must be MIDI semitones',
  });
});
