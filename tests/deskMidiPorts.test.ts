import assert from 'node:assert/strict';
import test from 'node:test';

import {
  readDeskMidiPorts,
  requestDeskMidiAccess,
  requireConnectedDeskMidiOutput,
  sendDeskMidiMessage,
} from '../quad/midiPorts.ts';

test('Desk requests Web MIDI access without SysEx', async () => {
  let receivedOptions: MIDIOptions | undefined;
  const access = fakeAccess([]);

  const result = await requestDeskMidiAccess(async options => {
    receivedOptions = options;
    return access;
  });

  assert.equal(result, access);
  assert.deepEqual(receivedOptions, { sysex: false });
});

test('Desk reports unsupported Web MIDI in clear Chinese', async () => {
  await assert.rejects(
    requestDeskMidiAccess(undefined),
    { message: '当前浏览器不支持 Web MIDI，无法从 Desk 驱动合成器。' },
  );
});

test('Desk translates denied MIDI permission into a clear Chinese error', async () => {
  await assert.rejects(
    requestDeskMidiAccess(async () => {
      throw new DOMException('blocked by user', 'NotAllowedError');
    }),
    { message: '无法访问 MIDI 设备，请允许浏览器使用 MIDI。' },
  );
});

test('Desk keeps MIDI access failures actionable in Chinese', async () => {
  await assert.rejects(
    requestDeskMidiAccess(async () => {
      throw new Error('driver unavailable');
    }),
    { message: '连接 MIDI 设备失败：driver unavailable' },
  );
});

test('Desk exposes Web MIDI outputs as a React-friendly list', () => {
  const access = fakeAccess([
    fakeOutput('loop', 'loopMIDI Port', 'loopMIDI'),
    fakeOutput('fm1', 'FM-1 Midi', 'Microsoft Corporation'),
  ]);

  const snapshot = readDeskMidiPorts(access, null);

  assert.deepEqual(
    snapshot.outputs.map(({ id, name, manufacturer, state, connection, isFm1 }) => (
      { id, name, manufacturer, state, connection, isFm1 }
    )),
    [
      {
        id: 'loop',
        name: 'loopMIDI Port',
        manufacturer: 'loopMIDI',
        state: 'connected',
        connection: 'closed',
        isFm1: false,
      },
      {
        id: 'fm1',
        name: 'FM-1 Midi',
        manufacturer: 'Microsoft Corporation',
        state: 'connected',
        connection: 'closed',
        isFm1: true,
      },
    ],
  );
});

test('Desk prefers FM-1 when there is no valid explicit output selection', () => {
  const access = fakeAccess([
    fakeOutput('loop', 'loopMIDI Port'),
    fakeOutput('fm1', 'FM-1 Midi', 'Microsoft Corporation'),
  ]);

  assert.equal(readDeskMidiPorts(access, null).selectedOutputId, 'fm1');
  assert.equal(readDeskMidiPorts(access, 'missing').selectedOutputId, 'fm1');
});

test('Desk preserves an explicit output selection while that port still exists', () => {
  const access = fakeAccess([
    fakeOutput('loop', 'loopMIDI Port'),
    fakeOutput('fm1', 'FM-1 Midi', 'Microsoft Corporation'),
  ]);

  assert.equal(readDeskMidiPorts(access, 'loop').selectedOutputId, 'loop');
});

test('Desk refuses a disconnected MIDI output before playback sends events', () => {
  const snapshot = readDeskMidiPorts(
    fakeAccess([fakeOutput('fm1', 'FM-1 Midi', 'Microsoft Corporation', () => {}, 'disconnected')]),
    'fm1',
  );

  assert.throws(
    () => requireConnectedDeskMidiOutput(snapshot),
    { message: 'MIDI 输出设备「FM-1 Midi」已断开，请重新连接。' },
  );
});

test('Desk explains when no MIDI output is available for playback', () => {
  const snapshot = readDeskMidiPorts(fakeAccess([]), null);

  assert.throws(
    () => requireConnectedDeskMidiOutput(snapshot),
    { message: '没有找到 MIDI 输出设备，请连接 FM-1 或其他 MIDI 设备。' },
  );
});

test('Desk sends through the selected connected output with its timestamp', () => {
  const sent: Array<{ data: number[]; timestamp?: number }> = [];
  const snapshot = readDeskMidiPorts(fakeAccess([
    fakeOutput('fm1', 'FM-1 Midi', '', (data, timestamp) => {
      sent.push({ data: [...data], timestamp });
    }),
  ]), 'fm1');

  sendDeskMidiMessage(snapshot, [0x90, 60, 100], 1250);

  assert.deepEqual(sent, [{ data: [0x90, 60, 100], timestamp: 1250 }]);
});

test('Desk translates a hot-unplugged send failure into a clear Chinese error', () => {
  const snapshot = readDeskMidiPorts(fakeAccess([
    fakeOutput('fm1', 'FM-1 Midi', '', () => {
      throw new Error('port lost');
    }),
  ]), 'fm1');

  assert.throws(
    () => sendDeskMidiMessage(snapshot, [0x90, 60, 100]),
    { message: '向 MIDI 输出设备「FM-1 Midi」发送失败：port lost' },
  );
});

function fakeAccess(outputs: MIDIOutput[]): MIDIAccess {
  const outputMap = new Map(outputs.map(output => [output.id, output]));
  return {
    inputs: new Map(),
    outputs: outputMap,
    sysexEnabled: false,
    onstatechange: null,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
  } as unknown as MIDIAccess;
}

function fakeOutput(
  id: string,
  name: string,
  manufacturer = '',
  send: MIDIOutput['send'] = () => {},
  state: MIDIPortDeviceState = 'connected',
): MIDIOutput {
  return {
    id,
    name,
    manufacturer,
    type: 'output',
    state,
    connection: 'closed',
    version: '',
    send,
    open: async function () { return this; },
    close: async function () { return this; },
    onstatechange: null,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
    clear() {},
  } as MIDIOutput;
}
