import assert from 'node:assert/strict';
import test from 'node:test';

import { QuadMidiBus, type QuadMidiOutput } from '../quad/midiBus.ts';

function recordingOutput(): { output: QuadMidiOutput; messages: number[][] } {
  const messages: number[][] = [];
  return {
    output: {
      send(data) {
        messages.push([...data]);
      },
    },
    messages,
  };
}

function switchableOutput(): {
  output: QuadMidiOutput;
  messages: number[][];
  setDisconnected(value: boolean): void;
} {
  const messages: number[][] = [];
  let disconnected = false;
  return {
    output: {
      send(data) {
        if (disconnected) throw new Error('device unplugged');
        messages.push([...data]);
      },
    },
    messages,
    setDisconnected(value) {
      disconnected = value;
    },
  };
}

test('trigger sends one Note On for the requested slot voice', () => {
  const { output, messages } = recordingOutput();
  const bus = new QuadMidiBus(output);

  assert.equal(bus.trigger('slot-a', 'pulse-1', 64, 96), true);
  assert.deepEqual(messages, [[0x90, 64, 96]]);
});

test('releaseVoice turns off only the addressed voice and keeps another slot owned', () => {
  const { output, messages } = recordingOutput();
  const bus = new QuadMidiBus(output);
  bus.trigger('slot-a', 'pulse-1', 60, 100);
  bus.trigger('slot-b', 'pulse-1', 67, 90);
  messages.length = 0;

  assert.equal(bus.releaseVoice('slot-a', 'pulse-1'), true);
  assert.deepEqual(messages, [[0x80, 60, 0]]);

  assert.equal(bus.releaseVoice('slot-b', 'pulse-1'), true);
  assert.deepEqual(messages, [[0x80, 60, 0], [0x80, 67, 0]]);
});

test('releaseSlot releases every voice in one slot without clearing another slot', () => {
  const { output, messages } = recordingOutput();
  const bus = new QuadMidiBus(output);
  bus.trigger('slot-a', 'center', 60, 100);
  bus.trigger('slot-a', 'neighbor', 64, 80);
  bus.trigger('slot-b', 'center', 67, 90);
  messages.length = 0;

  assert.equal(bus.releaseSlot('slot-a'), 2);
  assert.deepEqual(messages, [[0x80, 60, 0], [0x80, 64, 0]]);

  assert.equal(bus.releaseVoice('slot-b', 'center'), true);
  assert.deepEqual(messages, [[0x80, 60, 0], [0x80, 64, 0], [0x80, 67, 0]]);
});

test('releasing one slot does not turn off a pitch still owned by another slot', () => {
  const { output, messages } = recordingOutput();
  const bus = new QuadMidiBus(output);
  bus.trigger('slot-a', 'center', 60, 100);
  bus.trigger('slot-b', 'center', 60, 90);
  messages.length = 0;

  assert.equal(bus.releaseSlot('slot-a'), 1);
  assert.deepEqual(messages, []);

  assert.equal(bus.releaseVoice('slot-b', 'center'), true);
  assert.deepEqual(messages, [[0x80, 60, 0]]);
});

test('retriggering one voice at a new pitch closes the old pitch before Note On', () => {
  const { output, messages } = recordingOutput();
  const bus = new QuadMidiBus(output);
  bus.trigger('slot-a', 'moving-node', 60, 90);
  messages.length = 0;

  assert.equal(bus.trigger('slot-a', 'moving-node', 65, 70), true);
  assert.deepEqual(messages, [[0x80, 60, 0], [0x90, 65, 70]]);

  assert.equal(bus.releaseVoice('slot-a', 'moving-node'), true);
  assert.deepEqual(messages, [[0x80, 60, 0], [0x90, 65, 70], [0x80, 65, 0]]);
});

test('masterPanic sends CC120 and CC123 on every channel and clears every owned voice', () => {
  const { output, messages } = recordingOutput();
  const bus = new QuadMidiBus(output);
  bus.trigger('slot-a', 'center', 60, 100);
  bus.trigger('slot-b', 'center', 67, 90);
  messages.length = 0;

  bus.masterPanic();

  assertPanicMessages(messages);
  assert.equal(bus.releaseVoice('slot-a', 'center'), false);
  assert.equal(bus.releaseSlot('slot-b'), 0);
  assertPanicMessages(messages);
});

test('a hot-unplugged output clears the complete local ledger after a failed send', () => {
  const { output, messages, setDisconnected } = switchableOutput();
  const bus = new QuadMidiBus(output);
  bus.trigger('slot-a', 'center', 60, 100);
  bus.trigger('slot-b', 'center', 67, 90);

  setDisconnected(true);
  assert.equal(bus.releaseVoice('slot-a', 'center'), false);

  setDisconnected(false);
  assert.equal(bus.releaseSlot('slot-b'), 0);
  assert.equal(bus.trigger('slot-b', 'center', 67, 80), true);
  assert.equal(bus.releaseVoice('slot-b', 'center'), true);
  assert.deepEqual(messages, [
    [0x90, 60, 100],
    [0x90, 67, 90],
    [0x90, 67, 80],
    [0x80, 67, 0],
  ]);
});

test('a failed retrigger after hot unplug does not leave its previous voice owned', () => {
  const { output, messages, setDisconnected } = switchableOutput();
  const bus = new QuadMidiBus(output);
  bus.trigger('slot-a', 'center', 60, 100);

  setDisconnected(true);
  assert.equal(bus.trigger('slot-a', 'center', 60, 80), false);

  setDisconnected(false);
  assert.equal(bus.releaseVoice('slot-a', 'center'), false);
  assert.deepEqual(messages, [[0x90, 60, 100]]);
});

test('channel, MIDI note and Note On velocity are rounded and clamped safely', () => {
  const { output, messages } = recordingOutput();
  const bus = new QuadMidiBus(output, 99);

  bus.trigger('slot-a', 'low', -4.6, -20);
  bus.trigger('slot-b', 'high', 200.8, 999);
  bus.releaseVoice('slot-a', 'low');
  bus.masterPanic();

  assert.deepEqual(messages.slice(0, 3), [
    [0x9f, 0, 1],
    [0x9f, 127, 127],
    [0x8f, 0, 0],
  ]);
  assertPanicMessages(messages.slice(3));
});

function assertPanicMessages(messages: number[][]): void {
  assert.equal(messages.length, 32);
  for (let channel = 0; channel < 16; channel += 1) {
    assert.deepEqual(messages.slice(channel * 2, channel * 2 + 2), [
      [0xb0 | channel, 120, 0],
      [0xb0 | channel, 123, 0],
    ]);
  }
}

test('trigger rejects non-finite note and velocity values without touching MIDI', () => {
  const { output, messages } = recordingOutput();
  const bus = new QuadMidiBus(output);

  assert.equal(bus.trigger('slot-a', 'bad-note', Number.NaN, 90), false);
  assert.equal(bus.trigger('slot-a', 'bad-velocity', 60, Number.POSITIVE_INFINITY), false);
  assert.deepEqual(messages, []);
});
