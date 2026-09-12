import type { LilyCycleCompilation, QuadLilyPad } from './core.ts';
import { getPadCycleDurationMs } from './core.ts';
import { buildNodePresentations } from './nodePresentation.ts';
export interface SequenceHit { nodeId: string; midi: number; name: string; step: number; muted: boolean }
export interface SequenceRound { cycle: number; steps: number; hits: SequenceHit[]; played: string[] }
export interface SequenceArchive { current: SequenceRound|null; previous: SequenceRound|null; history: SequenceRound[] }
export function archiveSequenceRound(entry:SequenceArchive,next:SequenceRound):SequenceArchive {
 if(!entry.current||next.cycle<entry.current.cycle) return {current:next,previous:null,history:[]};
 if(next.cycle===entry.current.cycle) return {...entry,current:{...next,played:entry.current.played}};
 return {current:next,previous:entry.current,history:[...entry.history,entry.current].slice(-31)};
}
export function sequenceRound(cycle: number, plan: LilyCycleCompilation, pad: QuadLilyPad): SequenceRound {
 const names = buildNodePresentations(pad.nodes, pad);
 return { cycle, steps: Math.round(getPadCycleDurationMs(pad) / plan.propagationStepMs), played: [], hits: plan.events.flatMap(event => {
  if(event.delayMs >= getPadCycleDurationMs(pad)) return [];
  const node = pad.nodes.find(n => n.id === event.nodeId); const name = names.get(event.nodeId);
  return !node || node.hidden || name?.midiNote == null ? [] : [{nodeId:event.nodeId, midi:name.midiNote, name:name.noteName, step:event.delayMs / plan.propagationStepMs, muted:!!node.muted}];
 }) };
}
export function sequenceChanges(now: SequenceRound, before: SequenceRound | null): string[] {
 if (!before) return [];
 const prior = before.hits.filter(h => !h.muted && before.played.includes(h.nodeId));
 const current = now.hits.filter(h => !h.muted);
 const changes = current.flatMap(h => {
  const old = prior.find(p => p.nodeId === h.nodeId);
  if (!old) return [`${h.name} 新增`];
  const result:string[]=[];
  if(old.midi!==h.midi) result.push(`${old.name} → ${h.name}`);
  if(old.step!==h.step) result.push(`${h.name} ${h.step<old.step?'提前':'延后'} ${Math.abs(h.step-old.step)} 步`);
  return result;
 });
 prior.filter(p => !current.some(h => h.nodeId===p.nodeId)).forEach(p => changes.push(`${p.name} 退出`));
 return changes;
}
