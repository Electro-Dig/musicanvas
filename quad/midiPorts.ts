import { choosePreferredMidiOutputId, isFm1MidiOutput } from './fm1.ts';
import type { MIDIOutputBasic } from './midiTypes.ts';

export type DeskMidiAccessRequester = (options?: MIDIOptions) => Promise<MIDIAccess>;

export interface DeskMidiOutput extends MIDIOutputBasic {
  state: MIDIPortDeviceState;
  connection: MIDIPortConnectionState;
  isFm1: boolean;
}

export interface DeskMidiPortsSnapshot {
  outputs: DeskMidiOutput[];
  selectedOutputId: string | null;
}

export function requireConnectedDeskMidiOutput(
  snapshot: DeskMidiPortsSnapshot,
): DeskMidiOutput {
  if (snapshot.outputs.length === 0) {
    throw new Error('没有找到 MIDI 输出设备，请连接 FM-1 或其他 MIDI 设备。');
  }
  const output = snapshot.outputs.find(candidate => candidate.id === snapshot.selectedOutputId)!;
  if (output.state !== 'connected') {
    throw new Error(`MIDI 输出设备「${output.name || output.id}」已断开，请重新连接。`);
  }
  return output;
}

export function sendDeskMidiMessage(
  snapshot: DeskMidiPortsSnapshot,
  data: number[] | Uint8Array,
  timestamp?: number,
): void {
  const output = requireConnectedDeskMidiOutput(snapshot);
  try {
    output.send(data, timestamp);
  } catch (error) {
    const detail = error instanceof Error ? error.message : '未知错误';
    throw new Error(`向 MIDI 输出设备「${output.name || output.id}」发送失败：${detail}`, { cause: error });
  }
}

export function readDeskMidiPorts(
  access: MIDIAccess,
  selectedOutputId: string | null,
): DeskMidiPortsSnapshot {
  const outputs: DeskMidiOutput[] = [];
  access.outputs.forEach(output => {
    outputs.push({
      id: output.id,
      name: output.name ?? undefined,
      manufacturer: output.manufacturer ?? undefined,
      type: 'output',
      state: output.state,
      connection: output.connection,
      isFm1: isFm1MidiOutput(output),
      send: output.send.bind(output),
    });
  });
  return {
    outputs,
    selectedOutputId: choosePreferredMidiOutputId(outputs, selectedOutputId),
  };
}

export async function requestDeskMidiAccess(
  request?: DeskMidiAccessRequester,
): Promise<MIDIAccess> {
  const browserRequest = typeof navigator === 'undefined'
    ? undefined
    : navigator.requestMIDIAccess?.bind(navigator);
  const activeRequest = request ?? browserRequest;
  if (!activeRequest) {
    throw new Error('当前浏览器不支持 Web MIDI，无法从 Desk 驱动合成器。');
  }
  try {
    return await activeRequest({ sysex: false });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      throw new Error('无法访问 MIDI 设备，请允许浏览器使用 MIDI。', { cause: error });
    }
    const detail = error instanceof Error ? error.message : '未知错误';
    throw new Error(`连接 MIDI 设备失败：${detail}`, { cause: error });
  }
}
