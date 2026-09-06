import type { LilyNode, QuadLilyPad } from './core.ts';
import { allocateFormationId, getPadFormations, type LilyNoteFormation } from './groupMotion.ts';
import { buildNodePresentations } from './nodePresentation.ts';

export interface NoteClipboard {
  nodes: LilyNode[];
  formations: LilyNoteFormation[];
  source: Pick<QuadLilyPad, 'rootMidi' | 'scaleKey' | 'octaveTranspose'>;
  partialFormations: number;
}

export function copyNotes(pad: QuadLilyPad, ids: readonly string[]): NoteClipboard {
  const selected = new Set(ids);
  const formations = getPadFormations(pad);
  return structuredClone({
    nodes: ids.map(id => pad.nodes.find(n => n.id === id)).filter((n): n is LilyNode => Boolean(n)),
    formations: formations.filter(f => f.nodeIds.every(id => selected.has(id))),
    source: { rootMidi: pad.rootMidi, scaleKey: pad.scaleKey, octaveTranspose: pad.octaveTranspose },
    partialFormations: formations.filter(f => f.nodeIds.some(id => selected.has(id)) && !f.nodeIds.every(id => selected.has(id))).length,
  });
}

export function pasteNotes(pad: QuadLilyPad, clipboard: NoteClipboard, offset = 0.04) {
  if (pad.locked || !clipboard.nodes.length) return { pad, ids: [] as string[], adjustedPitches: 0 };
  const ids = new Set(pad.nodes.map(n => n.id));
  const mapping = new Map<string, string>();
  const sameScale = clipboard.source.rootMidi === pad.rootMidi && clipboard.source.scaleKey === pad.scaleKey && clipboard.source.octaveTranspose === pad.octaveTranspose;
  const candidates = Array.from({ length: 257 }, (_, i) => ({ id: String(i - 128), scaleStep: i - 128, isCenter: false }));
  const pitches = buildNodePresentations(candidates, pad);
  let adjustedPitches = 0;
  const convert = (step: number) => {
    if (sameScale) return step;
    const note = buildNodePresentations([{ id: 'pitch', scaleStep: step, isCenter: false }], clipboard.source).get('pitch')!.midiNote;
    if (note === null) return step;
    let best = step, distance = Infinity;
    for (const candidate of candidates) {
      const pitch = pitches.get(candidate.id)!.midiNote;
      if (pitch !== null && Math.abs(pitch - note) < distance) { best = candidate.scaleStep; distance = Math.abs(pitch - note); }
    }
    if (distance > 0) adjustedPitches++;
    return best;
  };
  const nodes = clipboard.nodes.map(original => {
    let number = 1;
    while (ids.has(`node-${number}`)) number++;
    const id = `node-${number}`;
    ids.add(id); mapping.set(original.id, id);
    const node = structuredClone(original);
    return { ...node, id, isCenter: false, x: node.x + offset, y: node.y + offset,
      scaleStep: convert(node.scaleStep),
      ...(node.endpointPitch ? { endpointPitch: { bStep: convert(node.endpointPitch.bStep) } } : {}),
    };
  });
  const formations = [...getPadFormations(pad)];
  for (const source of clipboard.formations) formations.push({ ...structuredClone(source),
    id: allocateFormationId(formations), nodeIds: source.nodeIds.map(id => mapping.get(id)!),
    centerX: source.centerX + offset, centerY: source.centerY + offset,
  });
  return { pad: { ...pad, nodes: [...pad.nodes, ...nodes], formations, formation: undefined }, ids: nodes.map(n => n.id), adjustedPitches };
}
