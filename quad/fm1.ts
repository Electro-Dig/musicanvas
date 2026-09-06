import type { MIDIOutputBasic } from './midiTypes.ts';

export type Fm1ToneSelection = 'follow' | number;

export interface ExpressiveNoteGateCommand {
  voiceId: string;
  action: 'on' | 'move' | 'off';
  velocity: number;
  pitchBend: number;
}

const FM1_NAME_PATTERN = /(?:^|[^a-z0-9])fm[\s_-]?1(?:$|[^a-z0-9])/i;

export function isFm1MidiOutput(output: Pick<MIDIOutputBasic, 'name' | 'manufacturer'>): boolean {
  return FM1_NAME_PATTERN.test(`${output.manufacturer || ''} ${output.name || ''}`);
}

export function supportsMidiPan(output: Pick<MIDIOutputBasic, 'name' | 'manufacturer'>): boolean {
  return !isFm1MidiOutput(output);
}

export function choosePreferredMidiOutputId(
  outputs: MIDIOutputBasic[],
  currentOutputId: string | null,
): string | null {
  if (currentOutputId && outputs.some(output => output.id === currentOutputId)) {
    return currentOutputId;
  }
  return outputs.find(isFm1MidiOutput)?.id || outputs[0]?.id || null;
}

export function fm1ProgramChangeMessage(tone: Fm1ToneSelection): number[] | null {
  if (tone === 'follow') return null;
  if (!Number.isInteger(tone) || tone < 1 || tone > 128) {
    throw new RangeError('FM-1 tone must be an integer between 1 and 128');
  }
  return [0xc0, tone - 1];
}

export function sendFm1ProgramChange(
  output: MIDIOutputBasic | null,
  tone: Fm1ToneSelection,
): boolean {
  if (!output || !isFm1MidiOutput(output)) return false;
  const message = fm1ProgramChangeMessage(tone);
  if (!message) return false;
  try {
    output.send(message);
    return true;
  } catch {
    return false;
  }
}

export function sendMidiNoteOffs(
  output: MIDIOutputBasic | null,
  notes: number[],
  channel = 0,
): number {
  if (!output) return 0;
  const safeChannel = Math.max(0, Math.min(15, Math.round(channel)));
  const validNotes = [...new Set(notes)]
    .filter(note => Number.isInteger(note) && note >= 0 && note <= 127);
  let sentCount = 0;
  validNotes.forEach(note => {
    try {
      output.send([0x80 | safeChannel, note, 0]);
      sentCount += 1;
    } catch {
      // A hot-unplugged port can reject sends; continue clearing local state.
    }
  });
  return sentCount;
}

export function sendMidiPanic(output: MIDIOutputBasic | null, channel = 0): boolean {
  if (!output) return false;
  const safeChannel = Math.max(0, Math.min(15, Math.round(channel)));
  try {
    output.send([0xb0 | safeChannel, 120, 0]);
    output.send([0xb0 | safeChannel, 123, 0]);
    return true;
  } catch {
    return false;
  }
}

export function midiPitchBendMessage(normalizedValue: number, channel = 0): number[] {
  const normalized = Math.max(-1, Math.min(1, normalizedValue));
  const safeChannel = Math.max(0, Math.min(15, Math.round(channel)));
  const value = normalized >= 0
    ? Math.round(8192 + normalized * 8191)
    : Math.round(8192 + normalized * 8192);
  return [0xe0 | safeChannel, value & 0x7f, (value >> 7) & 0x7f];
}

export function sendExpressiveNoteGate(
  output: MIDIOutputBasic | null,
  heldVoices: Record<string, number>,
  command: ExpressiveNoteGateCommand,
  midiNote: number | null,
  channel = 0,
): boolean {
  if (!output) return false;
  const safeChannel = Math.max(0, Math.min(15, Math.round(channel)));
  const previousNote = heldVoices[command.voiceId];

  try {
    if (command.action === 'off') {
      if (previousNote !== undefined) output.send([0x80 | safeChannel, previousNote, 0]);
      delete heldVoices[command.voiceId];
      output.send(midiPitchBendMessage(0, safeChannel));
      return true;
    }

    if (midiNote === null || !Number.isInteger(midiNote) || midiNote < 0 || midiNote > 127) return false;
    output.send(midiPitchBendMessage(command.pitchBend, safeChannel));
    if (previousNote !== midiNote) {
      const velocity = Math.max(1, Math.min(127, Math.round(command.velocity)));
      output.send([0x90 | safeChannel, midiNote, velocity]);
      if (previousNote !== undefined) output.send([0x80 | safeChannel, previousNote, 0]);
      heldVoices[command.voiceId] = midiNote;
    }
    return true;
  } catch {
    return false;
  }
}
