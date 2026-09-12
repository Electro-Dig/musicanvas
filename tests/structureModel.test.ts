import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createQuadLilyWorkspace} from '../quad/core.ts';
import type {SequenceRound} from '../quad/sequenceModel.ts';
import {alignStructureTracks,calculateStructure,structurePositionMs,structureSignature,repeatingRoundDurationMs,groupStructureByContour} from '../quad/structureModel.ts';

const round=(steps:number,hits:[number,number,boolean?][]):SequenceRound=>({cycle:0,steps,played:[],hits:hits.map(([step,midi,muted],i)=>({step,midi,muted:!!muted,name:String(midi),nodeId:`n${i}`}))});

test('display families align transposed Canon entries without merging different rhythms or melodic intervals',()=>{
  const raw=alignStructureTracks([
    {id:'A',loop:true,stepMs:250,rounds:[round(4,[[0,48],[2,43]])]},
    {id:'B',loop:true,stepMs:250,rounds:[round(16,[[4,72],[6,71],[8,72],[10,69]])]},
    {id:'C',loop:true,stepMs:250,rounds:[round(16,[[8,60],[10,59],[12,60],[14,57]])]},
    {id:'D',loop:true,stepMs:250,rounds:[round(16,[[12,84],[14,83]])]},
  ]);
  const grouped=groupStructureByContour(raw);
  assert.deepEqual(grouped.tracks.map(t=>t.cells.map(c=>c.motif)),[
    [0,0,0,0],[null,1,2,null],[null,null,1,2],[null,null,null,1],
  ]);
  assert.notEqual(raw.tracks[1].cells[1].motif,raw.tracks[2].cells[2].motif,'absolute score remains independent');
  const changed=structuredClone(raw);changed.tracks[2].cells[2].notes[1].atMs+=100;
  const regrouped=groupStructureByContour(changed);
  assert.notEqual(regrouped.tracks[1].cells[1].motif,regrouped.tracks[2].cells[2].motif);
});

test('a 48-second transport retains six-second repeated bass blocks',()=>{
  const bass=[50,45,47,42,43,38,43,45];
  const r=round(256,Array.from({length:64},(_,i)=>[i*4,bass[i%8]]));
  assert.equal(repeatingRoundDurationMs(r,187.5),6000);
  const plan=alignStructureTracks([{id:'A',loop:true,stepMs:187.5,rounds:[r]}]);
  assert.equal(plan.durationMs,48000);assert.equal(plan.columns,8);
  assert.deepEqual(plan.tracks[0].cells.map(c=>c.motif),Array(8).fill(0));
  r.hits.at(-1)!.midi=46;
  assert.equal(repeatingRoundDurationMs(r,187.5),48000,'one changed final note breaks exact repetition');
  assert.equal(repeatingRoundDurationMs(round(256,[]),187.5),48000,'silence must not collapse the chart to single steps');
  assert.equal(repeatingRoundDurationMs(round(8,[[.5,60],[4.5,60]]),250),2000,'off-grid onsets preserve their original span');
});

test('Canon-like ground and three delayed voices align in four equal blocks',()=>{
  const melody:[number,number][]=[[0,78],[2,76],[4,74],[6,73],[8,71],[10,69],[12,71],[14,73]];
  const second=melody.map(([t,n])=>[t+16,n-12] as [number,number]);
  const third=Array.from({length:16},(_,i)=>[32+i,62+i%7] as [number,number]);
  const plan=alignStructureTracks([
    {id:'A',loop:true,stepMs:375,rounds:[round(16,[[0,50],[2,45],[4,47],[6,42],[8,43],[10,38],[12,43],[14,45]])]},
    ...(['B','C','D'] as const).map((id,i)=>({id,loop:true,stepMs:375,rounds:[round(64,[[0,62,true],...[...melody,...second,...third].map(([t,n])=>[t+16*(i+1),n] as [number,number]).filter(([t])=>t<64)])]})),
  ]);
  assert.equal(plan.durationMs,24000);
  assert.equal(plan.blockMs,6000);
  assert.equal(plan.complete,true);
  assert.equal(plan.motifs.length,4);
  assert.deepEqual(plan.tracks.map(t=>t.cells.map(c=>c.motif)),[
    [0,0,0,0],[null,1,2,3],[null,null,1,2],[null,null,null,1],
  ]);
  assert.deepEqual(plan.tracks.map(t=>t.entryMs),[0,6000,12000,18000]);
  assert.equal(structurePositionMs(plan.tracks[0],3,.5),21000);
  assert.equal(structurePositionMs(plan.tracks[1],0,.875),21000);
});

test('identity preserves rhythm, octaves and simultaneity; chord member order is irrelevant',()=>{
  const notes=[{atMs:0,midi:60,name:'C4'},{atMs:0,midi:64,name:'E4'}];
  const key=structureSignature(notes,1000);
  assert.equal(key,structureSignature([...notes].reverse(),1000));
  assert.notEqual(key,structureSignature([notes[0],{...notes[1],atMs:250}],1000));
  assert.notEqual(key,structureSignature(notes.map(n=>({...n,midi:n.midi+12})),1000));
  assert.notEqual(key,structureSignature(notes,500));
});

test('events on a block boundary go only into the following block',()=>{
  const plan=alignStructureTracks([{id:'A',loop:true,stepMs:250,rounds:[round(8,[[0,60],[4,64],[7,67]])]}],.5);
  assert.deepEqual(plan.tracks[0].cells.map(c=>c.notes.map(n=>[n.atMs,n.midi])),[[[0,60]],[[0,64],[750,67]]]);
});

test('variable phrase durations use elapsed time, not cycle number alone',()=>{
  const plan=alignStructureTracks([{id:'A',loop:true,stepMs:250,rounds:[round(4,[[0,60]]),round(8,[[0,64]])]}]);
  assert.equal(plan.durationMs,3000);
  assert.equal(structurePositionMs(plan.tracks[0],1,.5),2000);
  assert.equal(structurePositionMs(plan.tracks[0],3,.5),5000);
});

test('long common periods are bounded and never mislabelled as complete',()=>{
  const plan=alignStructureTracks([
    {id:'A',loop:true,stepMs:250,rounds:[round(61,[[0,60]])]},
    {id:'B',loop:true,stepMs:250,rounds:[round(67,[[0,64]])]},
  ]);
  assert.equal(plan.columns,64);
  assert.equal(plan.complete,false);
  assert.equal(plan.commonPeriodMs,61*67*250);
});

test('one-shot tracks are not silently repeated or called a joint loop',()=>{
  const plan=alignStructureTracks([
    {id:'A',loop:false,stepMs:250,rounds:[round(4,[[0,60]])]},
    {id:'B',loop:true,stepMs:250,rounds:[round(8,[[0,64]])]},
  ]);
  assert.equal(plan.commonPeriodMs,null);
  assert.deepEqual(plan.tracks[0].cells.map(c=>c.notes.length),[1,0]);
});

test('live compiler changes to pitch, mute and timing reach structure prediction',()=>{
  const pads=createQuadLilyWorkspace().pads;
  const initial=calculateStructure(Object.values(pads));
  assert.equal(initial.motifs.length,1);
  pads.B.octaveTranspose=1;
  assert.equal(calculateStructure(Object.values(pads)).motifs.length,2);
  pads.C.nodes[0].muted=true;
  pads.D.phraseSteps=16;
  const changed=calculateStructure(Object.values(pads));
  assert.equal(changed.durationMs,2400);
  assert.deepEqual(changed.tracks[2].cells.map(c=>c.motif),[null,null,null,null]);
  assert.deepEqual(changed.tracks[3].cells.map(c=>c.motif),[0,null,null,null]);
});
