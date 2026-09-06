import assert from 'node:assert/strict';
import test from 'node:test';

import {
  choosePreferredMidiOutputId,
  fm1ProgramChangeMessage,
  midiPitchBendMessage,
  sendExpressiveNoteGate,
  isFm1MidiOutput,
  sendFm1ProgramChange,
  sendMidiNoteOffs,
  sendMidiPanic,
  supportsMidiPan,
} from '../quad/fm1.ts';
import type { MIDIOutputBasic } from '../quad/midiTypes.ts';

test('FM-1 detection matches the hardware name without confusing loopMIDI', () => {
  assert.equal(isFm1MidiOutput(output('a', 'FM-1 Midi', 'Microsoft Corporation')), true);
  assert.equal(isFm1MidiOutput(output('b', 'M-VAVE FM_1')), true);
  assert.equal(isFm1MidiOutput(output('c', 'loopMIDI Port')), false);
  assert.equal(isFm1MidiOutput(output('d', 'Other Device', 'FM-1')), true);
});

test('generic MIDI outputs may use CC10 pan but FM-1 must not receive it', () => {
  assert.equal(supportsMidiPan(output('generic', 'loopMIDI Port')), true);
  assert.equal(supportsMidiPan(output('fm1', 'FM-1 Midi', 'Microsoft Corporation')), false);
});

test('output selection preserves an explicit valid choice, otherwise prefers FM-1', () => {
  const outputs = [
    output('loop', 'loopMIDI Port'),
    output('fm1', 'FM-1 Midi', 'Microsoft Corporation'),
  ];

  assert.equal(choosePreferredMidiOutputId(outputs, null), 'fm1');
  assert.equal(choosePreferredMidiOutputId(outputs, 'loop'), 'loop');
  assert.equal(choosePreferredMidiOutputId(outputs, 'missing'), 'fm1');
  assert.equal(choosePreferredMidiOutputId([], 'fm1'), null);
});

test('FM-1 tone 001-128 maps to MIDI Program Change 0-127', () => {
  assert.equal(fm1ProgramChangeMessage('follow'), null);
  assert.deepEqual(fm1ProgramChangeMessage(1), [0xc0, 0]);
  assert.deepEqual(fm1ProgramChangeMessage(128), [0xc0, 127]);
  assert.throws(() => fm1ProgramChangeMessage(0), /1.*128/);
  assert.throws(() => fm1ProgramChangeMessage(129), /1.*128/);
});

test('Program Change is sent only for an explicit FM-1 tone', () => {
  const sent: number[][] = [];
  const fm1 = output('fm1', 'FM-1 Midi', 'Microsoft Corporation', (data) => sent.push([...data]));
  const generic = output('generic', 'loopMIDI Port', '', (data) => sent.push([...data]));

  assert.equal(sendFm1ProgramChange(fm1, 'follow'), false);
  assert.equal(sendFm1ProgramChange(generic, 17), false);
  assert.equal(sendFm1ProgramChange(fm1, 17), true);
  assert.deepEqual(sent, [[0xc0, 16]]);
});

test('a disconnected FM-1 port cannot crash Program Change handling', () => {
  const disconnected = output('fm1', 'FM-1 Midi', 'Microsoft Corporation', () => {
    throw new Error('port disconnected');
  });

  assert.equal(sendFm1ProgramChange(disconnected, 17), false);
});

test('MIDI panic silences queued hardware voices on the selected channel', () => {
  const sent: number[][] = [];
  const device = output('device', 'Any MIDI Output', '', (data) => sent.push([...data]));

  assert.equal(sendMidiPanic(null), false);
  assert.equal(sendMidiPanic(device), true);
  assert.deepEqual(sent, [
    [0xb0, 120, 0],
    [0xb0, 123, 0],
  ]);
});

test('tracked notes receive explicit Note Off before a device panic', () => {
  const sent: number[][] = [];
  const device = output('device', 'Any MIDI Output', '', (data) => sent.push([...data]));

  assert.equal(sendMidiNoteOffs(null, [60]), 0);
  assert.equal(sendMidiNoteOffs(device, [60, 64, 60, -1, 128]), 2);
  assert.deepEqual(sent, [
    [0x80, 60, 0],
    [0x80, 64, 0],
  ]);
});

test('normalized pitch bend maps exactly to the 14-bit MIDI range', () => {
  assert.deepEqual(midiPitchBendMessage(-1), [0xe0, 0, 0]);
  assert.deepEqual(midiPitchBendMessage(0), [0xe0, 0, 64]);
  assert.deepEqual(midiPitchBendMessage(1), [0xe0, 127, 127]);
  assert.deepEqual(midiPitchBendMessage(2), [0xe0, 127, 127]);
});

test('expressive note gate bends one held voice, changes its anchor legato, then releases and centers', () => {
  const sent: number[][] = [];
  const device = output('fm1', 'FM-1 Midi', '', (data) => sent.push([...data]));
  const heldVoices: Record<string, number> = {};

  sendExpressiveNoteGate(device, heldVoices, { voiceId: 'lead', action: 'on', velocity: 80, pitchBend: 0.25 }, 62);
  sendExpressiveNoteGate(device, heldVoices, { voiceId: 'lead', action: 'move', velocity: 80, pitchBend: -0.5 }, 64);
  sendExpressiveNoteGate(device, heldVoices, { voiceId: 'lead', action: 'off', velocity: 0, pitchBend: 0 }, null);

  assert.deepEqual(sent, [
    [0xe0, 0, 80],
    [0x90, 62, 80],
    [0xe0, 0, 32],
    [0x90, 64, 80],
    [0x80, 62, 0],
    [0x80, 64, 0],
    [0xe0, 0, 64],
  ]);
  assert.deepEqual(heldVoices, {});
});

function output(
  id: string,
  name: string,
  manufacturer = '',
  send: MIDIOutputBasic['send'] = () => {},
): MIDIOutputBasic {
  return { id, name, manufacturer, type: 'output', send };
}
