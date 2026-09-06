export interface ScaleDefinition {
  key: string;
  name: string;
  intervals: number[];
}

export interface RootNoteDefinition {
  name: string;
  midiValue: number;
}

export const ROOT_NOTES: RootNoteDefinition[] = [
  { name: 'C', midiValue: 60 }, { name: 'C#', midiValue: 61 }, { name: 'D', midiValue: 62 },
  { name: 'D#', midiValue: 63 }, { name: 'E', midiValue: 64 }, { name: 'F', midiValue: 65 },
  { name: 'F#', midiValue: 66 }, { name: 'G', midiValue: 67 }, { name: 'G#', midiValue: 68 },
  { name: 'A', midiValue: 69 }, { name: 'A#', midiValue: 70 }, { name: 'B', midiValue: 71 },
];

export const SCALES: ScaleDefinition[] = [
  { key: 'major', name: 'Major', intervals: [0, 2, 4, 5, 7, 9, 11] },
  { key: 'minor', name: 'Natural Minor', intervals: [0, 2, 3, 5, 7, 8, 10] },
  { key: 'majorPentatonic', name: 'Major Pentatonic', intervals: [0, 2, 4, 7, 9] },
  { key: 'minorPentatonic', name: 'Minor Pentatonic', intervals: [0, 3, 5, 7, 10] },
  { key: 'maj7', name: 'Major 7th Arp', intervals: [0, 4, 7, 11] },
  { key: 'min7', name: 'Minor 7th Arp', intervals: [0, 3, 7, 10] },
  { key: 'dom7', name: 'Dominant 7th Arp', intervals: [0, 4, 7, 10] },
  { key: 'diminished', name: 'Diminished (W-H)', intervals: [0, 2, 3, 5, 6, 8, 9, 11] },
  { key: 'chromatic', name: 'Chromatic', intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  { key: 'wholeTone', name: 'Whole Tone', intervals: [0, 2, 4, 6, 8, 10] },
  { key: 'custom', name: 'Custom...', intervals: [] },
];

export const DEFAULT_SCALE_KEY = SCALES[2].key;
