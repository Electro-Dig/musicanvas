export type InstrumentKind = 'piano' | 'marimba' | 'synth';

export interface SoundPreset {
  id: string;
  name: string;
  kind: InstrumentKind;
  synthWave: OscillatorType;
  filterType: BiquadFilterType;
  filterBase: number;
  filterQ: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  gain: number;
  detune?: number;
  dualOsc?: boolean;
  harmonicRatio?: number;
  tremoloRate?: number;
}

export const SOUND_PRESETS: SoundPreset[] = [
  // --- Acoustic Instruments ---
  {
    id: 'grand-piano',
    name: 'Grand Piano',
    kind: 'piano',
    synthWave: 'triangle',
    filterType: 'lowpass',
    filterBase: 3200,
    filterQ: 1.5,
    attack: 0.004,
    decay: 0.9,
    sustain: 0.3,
    release: 0.45,
    gain: 0.42,
    dualOsc: true,
    detune: 3,
    harmonicRatio: 2.0,
  },
  {
    id: 'marimba',
    name: 'Marimba',
    kind: 'marimba',
    synthWave: 'sine',
    filterType: 'bandpass',
    filterBase: 1200,
    filterQ: 4.2,
    attack: 0.002,
    decay: 0.38,
    sustain: 0.05,
    release: 0.22,
    gain: 0.45,
    harmonicRatio: 4.0,
  },

  // --- Electronic Synths ---
  {
    id: 'neon-synthwave',
    name: 'Neon Synthwave',
    kind: 'synth',
    synthWave: 'sawtooth',
    filterType: 'bandpass',
    filterBase: 1400,
    filterQ: 3.5,
    attack: 0.01,
    decay: 0.22,
    sustain: 0.35,
    release: 0.28,
    gain: 0.32,
    dualOsc: true,
  },
  {
    id: 'acid-303',
    name: 'Acid 303',
    kind: 'synth',
    synthWave: 'sawtooth',
    filterType: 'lowpass',
    filterBase: 2400,
    filterQ: 8.5,
    attack: 0.006,
    decay: 0.2,
    sustain: 0.15,
    release: 0.18,
    gain: 0.3,
  },
  {
    id: 'lofi-chill-ep',
    name: 'Lofi Chill EP',
    kind: 'synth',
    synthWave: 'sine',
    filterType: 'lowpass',
    filterBase: 850,
    filterQ: 1.2,
    attack: 0.025,
    decay: 0.38,
    sustain: 0.45,
    release: 0.4,
    gain: 0.38,
  },
  {
    id: 'berlin-minimal',
    name: 'Berlin Minimal',
    kind: 'synth',
    synthWave: 'triangle',
    filterType: 'bandpass',
    filterBase: 900,
    filterQ: 5.0,
    attack: 0.008,
    decay: 0.16,
    sustain: 0.1,
    release: 0.14,
    gain: 0.35,
  },
  {
    id: 'crystal-pluck',
    name: 'Crystal Pluck',
    kind: 'synth',
    synthWave: 'sine',
    filterType: 'lowpass',
    filterBase: 3000,
    filterQ: 2.2,
    attack: 0.003,
    decay: 0.24,
    sustain: 0.15,
    release: 0.22,
    gain: 0.38,
    dualOsc: true,
    detune: 14,
  },
  {
    id: 'machine-darkwave',
    name: 'Machine Darkwave',
    kind: 'synth',
    synthWave: 'sawtooth',
    filterType: 'lowpass',
    filterBase: 1300,
    filterQ: 4.5,
    attack: 0.01,
    decay: 0.26,
    sustain: 0.35,
    release: 0.28,
    gain: 0.32,
  },
];

export const DEFAULT_SOUND_PRESET_ID = 'crystal-pluck';

/** MIDI 外接音色（不走内置合成器） */
export const EXTERNAL_SOUND_PRESET_ID = 'external-midi';

export function getSoundPresetById(id: string): SoundPreset {
  return SOUND_PRESETS.find((p) => p.id === id) ?? SOUND_PRESETS[0];
}
