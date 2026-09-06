import { DEFAULT_SCALE_KEY, SCALES } from './musicTheory.ts';
import { createDeskPitchResolver } from './pitch.ts';

const MIDI_NOTE_NAMES = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
] as const;

export interface PresentableLilyNode {
  id: string;
  scaleStep: number;
  isCenter: boolean;
}

export interface NodePresentationSettings {
  rootMidi: number;
  scaleKey: string;
  octaveTranspose: number;
}

export interface NodePresentation {
  shortId: string;
  noteName: string;
  midiNote: number | null;
}

/**
 * Builds the single identity/pitch dictionary shared by the Lily canvas and
 * Cycle Map. Explicit `node-N` ids keep their number; other ids receive the
 * smallest free positive number in source order.
 */
export function buildNodePresentations(
  nodes: readonly PresentableLilyNode[],
  settings: NodePresentationSettings,
): Map<string, NodePresentation> {
  const reservedNumbers = new Set<number>();
  for (const node of nodes) {
    if (node.isCenter) continue;
    const explicitNumber = readExplicitNodeNumber(node.id);
    if (explicitNumber !== null) reservedNumbers.add(explicitNumber);
  }

  const scale = SCALES.find(candidate => (
    candidate.key === settings.scaleKey && candidate.intervals.length > 0
  )) ?? SCALES.find(candidate => candidate.key === DEFAULT_SCALE_KEY)!;
  const transposedRoot = settings.rootMidi + settings.octaveTranspose * 12;
  const resolvePitch = createDeskPitchResolver({
    rootMidi: Math.max(0, Math.min(127, Math.round(transposedRoot))),
    intervals: scale.intervals,
  });

  const presentations = new Map<string, NodePresentation>();
  const assignedNumbers = new Set(reservedNumbers);
  let nextFallbackNumber = 1;

  for (const node of nodes) {
    const explicitNumber = node.isCenter ? null : readExplicitNodeNumber(node.id);
    let shortId = 'ROOT';
    if (!node.isCenter) {
      if (explicitNumber !== null) {
        shortId = `N${explicitNumber}`;
      } else {
        while (assignedNumbers.has(nextFallbackNumber)) nextFallbackNumber += 1;
        shortId = `N${nextFallbackNumber}`;
        assignedNumbers.add(nextFallbackNumber);
        nextFallbackNumber += 1;
      }
    }

    const midiNote = resolvePitch({ kind: 'scale-degree', degree: node.scaleStep });
    presentations.set(node.id, {
      shortId,
      noteName: midiNote === null ? formatScaleStep(node.scaleStep) : formatMidiNote(midiNote),
      midiNote,
    });
  }

  return presentations;
}

export function formatMidiNote(note: number): string {
  const pitchClass = ((note % 12) + 12) % 12;
  const octave = Math.floor(note / 12) - 1;
  return `${MIDI_NOTE_NAMES[pitchClass]}${octave}`;
}

function readExplicitNodeNumber(id: string): number | null {
  const match = /^node-([1-9]\d*)$/.exec(id);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : null;
}

function formatScaleStep(scaleStep: number): string {
  return `STEP ${scaleStep > 0 ? '+' : ''}${scaleStep}`;
}
