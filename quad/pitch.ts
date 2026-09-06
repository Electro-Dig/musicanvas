export type PatternPitch =
  | { kind: 'scale-degree'; degree: number }
  | { kind: 'midi-note'; note: number };

export interface DeskScaleContext {
  rootMidi: number;
  intervals: readonly number[];
}

export type DeskPitchResolver = (pitch: PatternPitch) => number | null;

export function createDeskPitchResolver(context: DeskScaleContext): DeskPitchResolver {
  if (!Number.isInteger(context.rootMidi) || context.rootMidi < 0 || context.rootMidi > 127) {
    throw new RangeError('Desk scale root must be a MIDI note');
  }
  if (!context.intervals.length) {
    throw new RangeError('Desk scale needs at least one interval');
  }
  if (!context.intervals.every((interval) => Number.isInteger(interval))) {
    throw new RangeError('Desk scale intervals must be MIDI semitones');
  }

  return (pitch) => {
    if (pitch.kind === 'midi-note') {
      return isMidiNote(pitch.note) ? pitch.note : null;
    }
    if (!Number.isInteger(pitch.degree)) return null;
    const size = context.intervals.length;
    const octave = Math.floor(pitch.degree / size);
    const index = ((pitch.degree % size) + size) % size;
    const note = context.rootMidi + octave * 12 + context.intervals[index];
    return isMidiNote(note) ? note : null;
  };
}

function isMidiNote(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 127;
}

