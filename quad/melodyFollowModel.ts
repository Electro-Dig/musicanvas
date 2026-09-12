import type {QuadPadId} from './core.ts';
import {structurePositionMs,type StructureNote,type StructurePlan,type StructureTrack} from './structureModel.ts';

export interface FollowEvent {atMs:number;notes:StructureNote[]}
export interface FollowVoice {
  track:StructureTrack;
  entryMs:number;
  spanMs:number;
  events:FollowEvent[];
  ground:boolean;
}
export interface FollowPath {reference:FollowVoice;voices:FollowVoice[];durationMs:number;ground:boolean}
export interface FollowModel {paths:FollowPath[];plan:StructurePlan}
const precision=(n:number)=>Math.round(n*1000);

/** Group simultaneous pitches; never invent an order inside a chord. */
export function followEvents(notes:StructureNote[]):FollowEvent[] {
  const sorted=[...notes].sort((a,b)=>a.atMs-b.atMs||a.midi-b.midi);
  const events:FollowEvent[]=[];
  for(const note of sorted){
    const last=events.at(-1);
    if(last&&precision(last.atMs)===precision(note.atMs))last.notes.push(note);
    else events.push({atMs:note.atMs,notes:[note]});
  }
  return events;
}

/** Exact delayed imitation over the complete shared observation window, not just a matching first note. */
export function sameFollowMelody(a:FollowVoice,b:FollowVoice):boolean {
  const span=Math.min(a.spanMs,b.spanMs);
  const first=a.events.filter(e=>precision(e.atMs)<precision(span));
  const second=b.events.filter(e=>precision(e.atMs)<precision(span));
  return first.length>=2&&first.length===second.length&&first.every((e,i)=>
    precision(e.atMs)===precision(second[i].atMs)&&e.notes.length===second[i].notes.length&&
    e.notes.every((n,j)=>n.midi===second[i].notes[j].midi));
}

export function buildFollowModel(plan:StructurePlan):FollowModel {
  const voices=plan.tracks.map(track=>{
    const entryMs=track.entryMs??0;
    const all=track.cells.flatMap((cell,i)=>cell.notes.map(n=>({...n,atMs:n.atMs+i*plan.blockMs-entryMs})));
    const ground=plan.complete&&track.cells.length>1&&track.cells[0].motif!==null&&
      track.cells.every(c=>c.motif===track.cells[0].motif)&&precision(plan.durationMs%plan.blockMs)===0;
    return {track,entryMs,spanMs:plan.durationMs-entryMs,events:followEvents(all),ground};
  });
  const candidates=voices.filter(v=>v.events.length&&!v.ground).sort((a,b)=>b.spanMs-a.spanMs||a.track.id.localeCompare(b.track.id));
  const paths:FollowPath[]=[];
  for(const voice of candidates){
    const matching=paths.find(path=>sameFollowMelody(path.reference,voice));
    if(matching)matching.voices.push(voice);
    else paths.push({reference:voice,voices:[voice],durationMs:voice.spanMs,ground:false});
  }
  for(const voice of voices.filter(v=>v.ground)){
    paths.push({reference:voice,voices:[voice],durationMs:plan.blockMs,ground:true});
  }
  // Keep silence explicit instead of borrowing another voice's path.
  for(const voice of voices.filter(v=>!v.events.length))paths.push({reference:voice,voices:[voice],durationMs:plan.durationMs,ground:false});
  return {paths,plan};
}

export function lastFollowEvent(events:FollowEvent[],positionMs:number):FollowEvent|null {
  let low=0,high=events.length;
  while(low<high){const mid=(low+high)>>>1;if(events[mid].atMs<=positionMs+1e-7)low=mid+1;else high=mid;}
  return events[low-1]??null;
}

export interface FollowClock {cycle:number;phase:number;playing:boolean;paused:boolean}
export function followPosition(plan:StructurePlan,path:FollowPath,voice:FollowVoice,clock:FollowClock) {
  const active=clock.playing||clock.paused;
  const elapsed=active?structurePositionMs(voice.track,clock.cycle,clock.phase):0;
  // One-shots and capped prediction windows must never wrap and pretend to replay.
  const globalMs=plan.commonPeriodMs!==null?elapsed%plan.commonPeriodMs:elapsed;
  const outside=globalMs>=plan.durationMs;
  const waiting=!active||globalMs<voice.entryMs;
  const localMs=Math.max(0,globalMs-voice.entryMs);
  const positionMs=path.ground?localMs%path.durationMs:localMs;
  const event=!waiting&&!outside?lastFollowEvent(voice.events,localMs):null;
  return {globalMs,positionMs,event,waiting,outside,repeat:Math.floor(localMs/Math.max(1,path.durationMs))+1};
}
