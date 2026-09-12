import {compileLilyCycle, type QuadLilyPad, type QuadPadId} from './core.ts';
import {materializePadMotion} from './motionRuntime.ts';
import {sequenceRound, type SequenceRound} from './sequenceModel.ts';
import {calculateSequencePeriod,minimalSequencePeriod} from './sequencePeriod.ts';

export interface StructureNote {atMs:number; midi:number; name:string}
export interface StructureCell {motif:number|null; notes:StructureNote[]}
export interface StructureTrack {
  id:QuadPadId;
  loop:boolean;
  roundOffsets:number[];
  cells:StructureCell[];
  entryMs:number|null;
}
export interface StructurePlan {
  blockMs:number;
  durationMs:number;
  commonPeriodMs:number|null;
  complete:boolean;
  columns:number;
  motifs:StructureNote[][];
  tracks:StructureTrack[];
  error?:string;
}
export const EMPTY_STRUCTURE:StructurePlan = {
  blockMs:0,durationMs:0,commonPeriodMs:null,complete:false,columns:0,motifs:[],tracks:[],
};
const MAX_COLUMNS=64;
const MAX_NOTES=32768;
const gcd=(a:number,b:number):number=>b?gcd(b,a%b):a;
const tick=(ms:number)=>Math.round(ms*1000);

/** A long transport phrase may contain a shorter repeating ground-bass motif. */
export function repeatingRoundDurationMs(round:SequenceRound,stepMs:number):number {
  const full=round.steps*stepMs;
  const hits=round.hits.filter(h=>!h.muted);
  // Bound temporary storage and preserve exact timing for non-grid events.
  if(!hits.length||!Number.isInteger(round.steps)||round.steps<1||round.steps>4096
    ||hits.some(h=>!Number.isInteger(h.step)||h.step<0||h.step>=round.steps))return full;
  const slots:number[][]=Array.from({length:round.steps},()=>[]);
  for(const hit of hits)slots[hit.step].push(hit.midi);
  const keys=slots.map(notes=>notes.sort((a,b)=>a-b).join(','));
  return minimalSequencePeriod(keys)*stepMs;
}

/** Identical means identical pitches AND relative onsets, independent of node IDs/timbre. */
export function structureSignature(notes:StructureNote[],durationMs:number):string {
  return JSON.stringify([tick(durationMs),notes.map(n=>[tick(n.atMs),n.midi]).sort((a,b)=>a[0]-b[0]||a[1]-b[1])]);
}

/** Display-only families: preserve onset positions and intervals, allow a uniform transposition.
 * Keep the absolute-pitch plan intact for transport and the shared-melody follower. */
export function groupStructureByContour(plan:StructurePlan):StructurePlan {
  const ids=new Map<string,number>();
  const motifs:StructureNote[][]=[];
  const tracks=plan.tracks.map(track=>({...track,cells:track.cells.map((cell,i)=>{
    if(!cell.notes.length)return {...cell,motif:null};
    const sorted=[...cell.notes].sort((a,b)=>a.atMs-b.atMs||a.midi-b.midi);
    const root=sorted[0].midi;
    const key=structureSignature(sorted.map(n=>({...n,midi:n.midi-root})),Math.min(plan.blockMs,plan.durationMs-i*plan.blockMs));
    let motif=ids.get(key);
    if(motif===undefined){motif=motifs.length;ids.set(key,motif);motifs.push(cell.notes);}
    return {...cell,motif};
  })}));
  return {...plan,tracks,motifs};
}

export function alignStructureTracks(
  sources:{id:QuadPadId;loop:boolean;stepMs:number;rounds:SequenceRound[]}[],
  blockScale=1,
):StructurePlan {
  if(!sources.length || sources.some(s=>!s.rounds.length || !(s.stepMs>0)))
    return {...EMPTY_STRUCTURE,error:'暂无可对照的音序。'};
  const prepared=sources.map(s=>{
    const offsets=[0];
    for(const round of s.rounds) offsets.push(offsets.at(-1)!+round.steps*s.stepMs);
    return {...s,offsets,total:offsets.at(-1)!};
  });
  const shortest=Math.min(...prepared.flatMap(s=>s.rounds.map(r=>repeatingRoundDurationMs(r,s.stepMs))));
  const blockMs=shortest*(blockScale===0.5||blockScale===2?blockScale:1);
  if(!(blockMs>0)) return {...EMPTY_STRUCTURE,error:'音序时长无效。'};
  let commonTicks=tick(prepared[0].total);
  for(const s of prepared.slice(1)) {
    const t=tick(s.total);
    commonTicks=commonTicks/gcd(commonTicks,t)*t;
    if(!Number.isSafeInteger(commonTicks)) break;
  }
  // A single-shot track does not return to its opening; label this as an arrangement window.
  const allLoop=prepared.every(s=>s.loop);
  const commonPeriodMs=allLoop&&Number.isSafeInteger(commonTicks)?commonTicks/1000:null;
  const requested=allLoop?(commonPeriodMs??Infinity):Math.max(...prepared.map(s=>s.total));
  const durationMs=Math.min(requested,blockMs*MAX_COLUMNS);
  const columns=Math.ceil(durationMs/blockMs-1e-9);
  const motifs:StructureNote[][]=[];
  const motifIds=new Map<string,number>();
  let noteCount=0;
  const tracks:StructureTrack[]=[];
  for(const s of prepared) {
    const cells:StructureCell[]=Array.from({length:columns},()=>({motif:null,notes:[]}));
    let entryMs:number|null=null;
    const repeats=s.loop?Math.ceil(durationMs/s.total):1;
    // Tiny individual loops can otherwise expand a bounded chart into millions of events.
    if(repeats*s.rounds.reduce((sum,r)=>sum+r.hits.length,0)>MAX_NOTES)
      return {...EMPTY_STRUCTURE,error:'这段对照包含过多触发，请先缩短轨道之间的周期差。'};
    for(let repeat=0;repeat<repeats;repeat++) {
      for(let ri=0;ri<s.rounds.length;ri++) {
        for(const hit of s.rounds[ri].hits) {
          if(hit.muted) continue;
          const atMs=repeat*s.total+s.offsets[ri]+hit.step*s.stepMs;
          if(tick(atMs)>=tick(durationMs)) continue;
          const column=Math.floor((tick(atMs)/1000+1e-7)/blockMs);
          if(!cells[column]) continue;
          if(++noteCount>MAX_NOTES) return {...EMPTY_STRUCTURE,error:'这段对照包含过多音符，请缩短周期后查看。'};
          cells[column].notes.push({atMs:atMs-column*blockMs,midi:hit.midi,name:hit.name});
          entryMs=entryMs===null?atMs:Math.min(entryMs,atMs);
        }
      }
    }
    cells.forEach((cell,i)=>{
      cell.notes.sort((a,b)=>a.atMs-b.atMs||a.midi-b.midi);
      if(!cell.notes.length) return;
      const key=structureSignature(cell.notes,Math.min(blockMs,durationMs-i*blockMs));
      let id=motifIds.get(key);
      if(id===undefined){id=motifs.length;motifIds.set(key,id);motifs.push(cell.notes);}
      cell.motif=id;
    });
    tracks.push({id:s.id,loop:s.loop,roundOffsets:s.offsets,cells,entryMs});
  }
  return {blockMs,durationMs,commonPeriodMs,complete:durationMs===requested,columns,motifs,tracks};
}

/** Runs only inside the structure worker, on composition changes, never on animation frames. */
export function calculateStructure(pads:QuadLilyPad[],blockScale=1):StructurePlan {
  const sources=[];
  for(const pad of pads) {
    if(!pad.loop){
      const snapshot=materializePadMotion(pad,0);
      const compilation=compileLilyCycle(snapshot);
      sources.push({id:pad.id,loop:false,stepMs:compilation.propagationStepMs,rounds:[sequenceRound(0,compilation,snapshot)]});
      continue;
    }
    const plan=calculateSequencePeriod(pad,128);
    if(plan.error) return {...EMPTY_STRUCTURE,error:`Pad ${pad.id}：${plan.error}`};
    sources.push({id:pad.id,loop:pad.loop,stepMs:pad.intervalMs/4,rounds:plan.rounds});
  }
  return alignStructureTracks(sources,blockScale);
}

export function structurePositionMs(track:StructureTrack,cycle:number,phase:number):number {
  const rounds=track.roundOffsets.length-1;
  if(rounds<=0)return 0;
  const safeCycle=Math.max(0,Math.floor(cycle));
  if(!track.loop&&safeCycle>=rounds)return track.roundOffsets.at(-1)!;
  const ri=safeCycle%rounds;
  const start=track.roundOffsets[ri];
  return Math.floor(safeCycle/rounds)*track.roundOffsets.at(-1)!+start+
    Math.max(0,Math.min(1,phase))*(track.roundOffsets[ri+1]-start);
}
