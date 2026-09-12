import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calculateStructure,alignStructureTracks} from '../quad/structureModel.ts';
import {buildFollowModel,followEvents,followPosition,lastFollowEvent} from '../quad/melodyFollowModel.ts';
import {parseLibraryAsset} from '../quad/library/core.ts';
import type {SequenceRound} from '../quad/sequenceModel.ts';

function canon(){
  const asset=parseLibraryAsset(readFileSync(new URL('../public/studies/canon-opening-16-bars.musicanvas.json',import.meta.url),'utf8'));
  assert(asset?.type==='workspace');
  return structuredClone(asset.payload.workspace.pads);
}
test('actual 48-second Canon merges B C D exactly, preserving A as a six-second ground',()=>{
  const pads=canon(),plan=calculateStructure(Object.values(pads)),model=buildFollowModel(plan);
  assert.equal(plan.durationMs,48000);
  assert.equal(model.paths.length,2);
  const melody=model.paths[0],bass=model.paths[1];
  assert.deepEqual(melody.voices.map(v=>[v.track.id,v.entryMs,v.events.length]),[['B',6000,121],['C',12000,112],['D',18000,80]]);
  assert.equal(melody.durationMs,42000);
  assert.equal(bass.reference.track.id,'A');assert.equal(bass.durationMs,6000);assert.equal(bass.ground,true);
  // Every rendered current pitch must match this voice's own compiled score, including the loop seam.
  for(const ms of [0,5999,6000,12000,18000,23999,24000,30000,47999,48000,60000]){
    for(const path of model.paths)for(const voice of path.voices){
      const p=followPosition(plan,path,voice,{cycle:Math.floor(ms/48000),phase:ms%48000/48000,playing:true,paused:false});
      const expected=lastFollowEvent(voice.events,ms%48000-voice.entryMs);
      assert.deepEqual(p.event?.notes.map(n=>n.midi)??[],expected?.notes.map(n=>n.midi)??[],`${voice.track.id} at ${ms}`);
    }
  }
});

test('editing one Canon pitch separates that voice instead of falsely tracking the leader',()=>{
  const pads=canon();pads.C.nodes[8].scaleStep+=1;
  const model=buildFollowModel(calculateStructure(Object.values(pads)));
  assert.deepEqual(model.paths.map(p=>p.voices.map(v=>v.track.id)),[['B','D'],['C'],['A']]);
  const unedited=buildFollowModel(calculateStructure(Object.values(canon())));
  const path=unedited.paths[0],voice=path.voices[1];
  const paused=followPosition(unedited.plan,path,voice,{cycle:0,phase:.5,playing:false,paused:true});
  assert.equal(paused.positionMs,12000);assert.equal(paused.event?.notes[0].midi,62);
  assert.equal(followPosition(unedited.plan,path,voice,{cycle:3,phase:.5,playing:false,paused:false}).event,null);
});

test('chords retain simultaneity, and a rhythm change prevents path sharing',()=>{
  const notes=[{atMs:0,midi:67,name:'G4'},{atMs:0,midi:60,name:'C4'},{atMs:500,midi:64,name:'E4'}];
  const events=followEvents(notes);
  assert.deepEqual(events.map(e=>e.notes.map(n=>n.midi)),[[60,67],[64]]);
  assert.equal(lastFollowEvent(events,-1),null);
  assert.deepEqual(lastFollowEvent(events,499)?.notes.map(n=>n.midi),[60,67]);
  const round=(shift:number):SequenceRound=>({cycle:0,steps:8,played:[],hits:[0,2+shift,4].map((step,i)=>({step,midi:60+i,name:'C4',nodeId:String(i),muted:false}))});
  const plan=alignStructureTracks([{id:'B',loop:true,stepMs:250,rounds:[round(0)]},{id:'C',loop:true,stepMs:250,rounds:[round(1)]}]);
  assert.equal(buildFollowModel(plan).paths.length,2);
});

test('single-shot endings and incomplete prediction windows never wrap their markers',()=>{
  const r:SequenceRound={cycle:0,steps:8,played:[],hits:[{step:0,midi:60,name:'C4',nodeId:'n',muted:false}]};
  const plan=alignStructureTracks([{id:'A',loop:false,stepMs:250,rounds:[r]}]);
  const model=buildFollowModel(plan),path=model.paths[0];
  const p=followPosition(plan,path,path.reference,{cycle:0,phase:1,playing:true,paused:false});
  assert.equal(p.outside,true);assert.equal(p.event,null);
  const capped={...plan,complete:false,durationMs:1000,commonPeriodMs:4000};
  assert.equal(followPosition(capped,path,path.reference,{cycle:0,phase:.75,playing:true,paused:false}).outside,true);
});
