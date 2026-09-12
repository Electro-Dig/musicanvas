import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileLilyCycle} from '../quad/core.ts';
import {parseLibraryAsset} from '../quad/library/core.ts';
import {playbackVisualScore,playbackVisualFrames,samePlaybackMelody,recentPlaybackEvents,parsePlaybackVisualMode,type PlaybackVisualScore,type PlaybackVisualTrack} from '../quad/playbackVisual.ts';

function canon(){
  const asset=parseLibraryAsset(readFileSync(new URL('../public/studies/canon-opening-16-bars.musicanvas.json',import.meta.url),'utf8'));
  assert(asset?.type==='workspace');return structuredClone(asset.payload.workspace.pads);
}
test('Canon relay maps complete matching pitch/rhythm to target node IDs and excludes the bass',()=>{
  const pads=canon();
  const tracks=Object.values(pads).map(pad=>{
    const score=playbackVisualScore(compileLilyCycle(pad),pad);
    return {id:pad.id,playing:true,cyclePhase:30_000/score.durationMs,score,playedNodeIds:score.events.filter(e=>e.atMs<=30_000).flatMap(e=>e.notes.map(n=>n.nodeId))};
  });
  assert(samePlaybackMelody(tracks[1].score,tracks[2].score));
  assert(samePlaybackMelody(tracks[1].score,tracks[3].score));
  assert(!samePlaybackMelody(tracks[0].score,tracks[1].score));
  const frames=playbackVisualFrames(tracks,'echo');assert.equal(frames.get('A')!.echoes.length,0);
  for(const target of tracks.slice(1)) {
    const echoes=frames.get(target.id)!.echoes;assert(echoes.length>=2);
    for(const echo of echoes){
      const source=tracks.find(t=>t.id===echo.sourcePad)!;
      const sourceEvent=recentPlaybackEvents(source).at(-1)!;
      const targetEvent=target.score.events.find(e=>e.notes.some(n=>n.nodeId===echo.nodeId))!;
      assert.equal(targetEvent.atMs-target.score.entryMs,sourceEvent.atMs-source.score.entryMs);
      assert.deepEqual(targetEvent.notes.map(n=>n.midi),sourceEvent.notes.map(n=>n.midi));
    }
  }
});
test('changing a later pitch or rhythm rejects relay even when the opening matches',()=>{
  const pads=canon(),b=playbackVisualScore(compileLilyCycle(pads.B),pads.B);
  const c=playbackVisualScore(compileLilyCycle(pads.C),pads.C);
  const pitch=structuredClone(c);pitch.events[25].notes[0].midi++;
  const rhythm=structuredClone(c);rhythm.events[25].atMs+=10;
  assert(!samePlaybackMelody(b,pitch));assert(!samePlaybackMelody(b,rhythm));
});
test('visuals use delivered triggers, keep chords simultaneous, freeze paused and clear on stop/restart',()=>{
  const score:PlaybackVisualScore={durationMs:4000,entryMs:0,events:[
    {atMs:0,notes:[{nodeId:'c',midi:60,name:'C4'},{nodeId:'e',midi:64,name:'E4'}]},
    {atMs:1000,notes:[{nodeId:'g',midi:67,name:'G4'}]},
  ]};
  const a:PlaybackVisualTrack={id:'A',score,playing:true,cyclePhase:.5,playedNodeIds:['c','e']};
  const first=playbackVisualFrames([a],'follow').get('A')!;
  assert.deepEqual(first.focusIds,['c','e']);assert.equal(first.recent.length,1);
  assert.deepEqual(first.playedIds,['c','e']);
  const advanced=playbackVisualFrames([{...a,playedNodeIds:['c','e','g']}],'follow').get('A')!;
  assert.deepEqual(advanced.playedIds,['c','e','g'],'past notes keep their colour after the focus advances');
  assert.deepEqual(advanced.focusIds,['g']);
  assert.deepEqual(playbackVisualFrames([{...a,cyclePhase:0,playedNodeIds:[]}],'follow').get('A')!.playedIds,[],'new cycle clears the played trail');
  const paused={...a,playing:false,paused:true};assert.deepEqual(playbackVisualFrames([paused],'follow').get('A')!.recent,first.recent);
  assert.equal(playbackVisualFrames([{...a,playing:false}],'echo').get('A')!.focusIds.length,0);
  assert.equal(playbackVisualFrames([{...a,cyclePhase:0,playedNodeIds:[]}],'follow').get('A')!.recent.length,0);
  assert.equal(playbackVisualFrames([a],'original').size,0);
});
test('silent/hidden notes do not become sounding visual anchors; scores are cached',()=>{
  const pads=canon(),compiled=compileLilyCycle(pads.B),score=playbackVisualScore(compiled,pads.B);
  assert.equal(playbackVisualScore(compiled,pads.B),score);
  assert(!score.events.flatMap(e=>e.notes).some(n=>n.nodeId==='center'));
  const changed=structuredClone(pads.B);changed.nodes.find(n=>n.id===score.events[0].notes[0].nodeId)!.muted=true;
  assert(!playbackVisualScore(compiled,changed).events.flatMap(e=>e.notes).some(n=>n.nodeId===score.events[0].notes[0].nodeId));
  assert.equal(parsePlaybackVisualMode('bogus'),'original');assert.equal(parsePlaybackVisualMode('echo'),'echo');
});
