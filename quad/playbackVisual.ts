import type {LilyCycleCompilation, QuadLilyPad, QuadPadId} from './core.ts';
import {buildNodePresentations} from './nodePresentation.ts';

export type PlaybackVisualMode = 'original' | 'follow' | 'echo';
export const PLAYBACK_VISUAL_STORAGE_KEY = 'gemidi.studio.playback-visual.v1';
export const parsePlaybackVisualMode = (value: unknown): PlaybackVisualMode => value === 'follow' || value === 'echo' ? value : 'original';
export interface PlaybackVisualEvent {atMs:number; notes:{nodeId:string;midi:number;name:string}[]}
export interface PlaybackVisualScore {durationMs:number;entryMs:number;events:PlaybackVisualEvent[]}
export interface PlaybackEcho {nodeId:string;sourcePad:QuadPadId}
export interface PlaybackVisualFrame {recent:PlaybackVisualEvent[];playedIds:string[];focusIds:string[];echoes:PlaybackEcho[]}

// The transport's immutable cycle snapshot is the authority, including edits queued for the next cycle.
const scores = new WeakMap<LilyCycleCompilation, WeakMap<QuadLilyPad, PlaybackVisualScore>>();
export function playbackVisualScore(compilation:LilyCycleCompilation,pad:QuadLilyPad):PlaybackVisualScore {
  let byPad=scores.get(compilation);if(!byPad){byPad=new WeakMap();scores.set(compilation,byPad);}
  const cached=byPad.get(pad);if(cached)return cached;
  const nodes=new Map(pad.nodes.map(n=>[n.id,n]));
  const names=buildNodePresentations(compilation.events.map(e=>({id:e.nodeId,scaleStep:e.scaleStep,isCenter:nodes.get(e.nodeId)?.isCenter??false})),pad);
  const events:PlaybackVisualEvent[]=[];
  for(const e of [...compilation.events].sort((a,b)=>a.delayMs-b.delayMs)) {
    const node=nodes.get(e.nodeId),pitch=names.get(e.nodeId);
    if(!node||node.muted||node.hidden||pitch?.midiNote==null||e.delayMs>=compilation.intervalMs)continue;
    let group=events.at(-1);
    if(!group||Math.abs(group.atMs-e.delayMs)>.001){group={atMs:e.delayMs,notes:[]};events.push(group);}
    group.notes.push({nodeId:e.nodeId,midi:pitch.midiNote,name:pitch.noteName});
  }
  events.forEach(e=>e.notes.sort((a,b)=>a.midi-b.midi||a.nodeId.localeCompare(b.nodeId)));
  const score={durationMs:compilation.intervalMs,entryMs:events[0]?.atMs??0,events};byPad.set(pad,score);return score;
}

const matches = new WeakMap<PlaybackVisualScore, WeakMap<PlaybackVisualScore, boolean>>();
/** Compare every pitch and onset in the shared cycle window, never infer imitation from one matching pitch. */
export function samePlaybackMelody(a:PlaybackVisualScore,b:PlaybackVisualScore):boolean {
  let cache=matches.get(a);if(!cache){cache=new WeakMap();matches.set(a,cache);}const cached=cache.get(b);if(cached!==undefined)return cached;
  const span=Math.min(a.durationMs-a.entryMs,b.durationMs-b.entryMs);
  const left=a.events.filter(e=>e.atMs-a.entryMs<span-.001),right=b.events.filter(e=>e.atMs-b.entryMs<span-.001);
  const same=left.length>=2&&left.length===right.length&&left.every((e,i)=>Math.abs((e.atMs-a.entryMs)-(right[i].atMs-b.entryMs))<.001&&e.notes.length===right[i].notes.length&&e.notes.every((n,j)=>n.midi===right[i].notes[j].midi));
  cache.set(b,same);return same;
}

export interface PlaybackVisualTrack {
  id:QuadPadId; playing:boolean; paused?:boolean; cyclePhase:number;
  playedNodeIds?:readonly string[]; activeNodeIds?:readonly string[];
  score:PlaybackVisualScore|null;
}
export function recentPlaybackEvents(track:PlaybackVisualTrack):PlaybackVisualEvent[] {
  if(!track.score||(!track.playing&&!track.paused))return [];
  const played=new Set(track.playedNodeIds??[]), now=track.cyclePhase*track.score.durationMs;
  const recent:PlaybackVisualEvent[]=[];
  for(let i=track.score.events.length-1;i>=0&&recent.length<4;i--) {
    const event=track.score.events[i];if(event.atMs>now+2)continue;
    const notes=event.notes.filter(n=>played.has(n.nodeId));
    if(notes.length)recent.unshift({...event,notes});
  }
  return recent;
}
export function playbackVisualFrames(tracks:PlaybackVisualTrack[],mode:PlaybackVisualMode):Map<QuadPadId,PlaybackVisualFrame> {
  const frames=new Map<QuadPadId,PlaybackVisualFrame>();if(mode==='original')return frames;
  for(const track of tracks) {
    const recent=recentPlaybackEvents(track);
    const audible=new Set(track.score?.events.flatMap(e=>e.notes.map(n=>n.nodeId))??[]);
    const playedIds=(track.playing||track.paused)?(track.playedNodeIds??[]).filter(id=>audible.has(id)):[];
    frames.set(track.id,{recent,playedIds,focusIds:[...new Set([...(recent.at(-1)?.notes.map(n=>n.nodeId)??[]),...((track.playing||track.paused)?track.activeNodeIds??[]:[])].filter(id=>audible.has(id)))],echoes:[]});
  }
  if(mode!=='echo')return frames;
  for(const target of tracks) {
    if(!target.score||(!target.playing&&!target.paused))continue;
    const frame=frames.get(target.id)!;
    for(const source of tracks) {
      if(source.id===target.id||!source.score||!samePlaybackMelody(target.score,source.score))continue;
      const current=frames.get(source.id)?.recent.at(-1);if(!current)continue;
      const atMs=current.atMs-source.score.entryMs+target.score.entryMs;
      const mapped=target.score.events.find(e=>Math.abs(e.atMs-atMs)<.001);
      if(!mapped)continue;
      // A partially delivered chord must not light a note whose trigger has not arrived.
      const remaining=[...current.notes];
      for(const n of mapped.notes){const index=remaining.findIndex(other=>other.midi===n.midi);if(index<0)continue;remaining.splice(index,1);frame.echoes.push({nodeId:n.nodeId,sourcePad:source.id});}
    }
  }
  return frames;
}
