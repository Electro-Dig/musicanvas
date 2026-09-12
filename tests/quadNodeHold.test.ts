import assert from 'node:assert/strict';
import test from 'node:test';
import {compileLilyCycle, createQuadLilyWorkspace, parseQuadLilyWorkspace, updateLilyNode, type QuadLilyPad} from '../quad/core.ts';
import {createUserPadAsset, parseLibraryAsset, serializeLibraryAsset} from '../quad/library/core.ts';
import {QuadCycleRunner, type QuadCycleClock} from '../quad/cycleRunner.ts';

function phrase():QuadLilyPad {
  return {...createQuadLilyWorkspace().pads.B,intervalMs:750,phraseSteps:256,phraseMode:'fixed',nodes:[
    {id:'center',isCenter:true,x:.1,y:.5,range:.11,scaleStep:0,muted:true,holdSteps:32},
    {id:'quarter',isCenter:false,x:.2,y:.5,range:.11,scaleStep:18,holdSteps:4},
    {id:'sixteenth',isCenter:false,x:.3,y:.5,range:.11,scaleStep:16,holdSteps:1},
    {id:'last',isCenter:false,x:.4,y:.5,range:0,scaleStep:14,holdSteps:2},
  ]};
}

test('silent entry hold and unequal note values keep original grid without spacer nodes',()=>{
  const p=phrase(),plan=compileLilyCycle(p);
  assert.equal(plan.intervalMs,48000);
  assert.deepEqual(plan.events.map(e=>e.delayMs),[0,6000,6750,6937.5]);
  assert.equal(compileLilyCycle({...p,phraseMode:'auto'}).intervalMs,7312.5,'last explicit hold completes the automatic phrase');
  p.nodes.forEach(n=>delete n.holdSteps);
  assert.deepEqual(compileLilyCycle(p).events.map(e=>e.delayMs),[0,187.5,375,562.5],'legacy nodes still propagate one step');
});

test('library roundtrip preserves 48 seconds and node values; edits normalize and reset',()=>{
  let w=createQuadLilyWorkspace(); w.pads.B=phrase();
  const asset=createUserPadAsset({id:'long-holds',name:'Long phrase',pad:w.pads.B,now:'2026-09-12T00:00:00Z'});
  const restored=parseLibraryAsset(serializeLibraryAsset(asset));
  assert(restored?.type==='pad');
  assert.deepEqual(compileLilyCycle(restored.payload.pad),compileLilyCycle(w.pads.B));
  for(const [input,expected] of [[1.5,2],[9999,256],[-1,1],[NaN,1]]){
    w=updateLilyNode(w,'B','quarter',{holdSteps:input});
    assert.equal(w.pads.B.nodes[1].holdSteps,expected);
  }
  w=updateLilyNode(w,'B','quarter',{holdSteps:null});
  assert.equal(w.pads.B.nodes[1].holdSteps,undefined);
  const raw=structuredClone(w);raw.pads.B.nodes[1].holdSteps=-30;
  assert.equal(parseQuadLilyWorkspace(JSON.stringify(raw)).pads.B.nodes[1].holdSteps,1);
});

test('hold and mute can be set and reset together',()=>{
  let w=createQuadLilyWorkspace();
  w=updateLilyNode(w,'B','center',{holdSteps:4,muted:true});
  assert.equal(w.pads.B.nodes[0].holdSteps,4);
  assert.equal(w.pads.B.nodes[0].muted,true);
  w=updateLilyNode(w,'B','center',{holdSteps:null,muted:null});
  assert.equal(w.pads.B.nodes[0].holdSteps,undefined);
  assert.equal(w.pads.B.nodes[0].muted,undefined);
});

test('chord hold takes priority and does not stagger simultaneous members',()=>{
  const p=phrase();
  p.formations=[{id:'chord',shape:'chord',nodeIds:['quarter','sixteenth'],holdSteps:2,centerX:.25,centerY:.5,radius:.05,rateCycles:1}];
  assert.deepEqual(compileLilyCycle(p).events.map(e=>[e.nodeId,e.delayMs]),[['center',0],['quarter',6000],['sixteenth',6000],['last',6375]]);
});

test('48-second phrase triggers late notes and restarts at 48 seconds, never at 24',()=>{
  let now=0,serial=0;
  const pending=new Map<number,{at:number;fn:()=>void}>();
  const clock:QuadCycleClock={nowMs:()=>now,setTimeout:(fn,delay)=>{const id=++serial;pending.set(id,{at:now+delay,fn});return id;},clearTimeout:id=>{pending.delete(Number(id));}};
  const fired:{node:string;cycle:number;at:number}[]=[];
  const runner=new QuadCycleRunner({clock,onEvent:(_,e,cycle)=>fired.push({node:e.nodeId,cycle,at:now})});
  const p=phrase();p.nodes[0].holdSteps=128;p.nodes[1].holdSteps=4;
  runner.startPad(p);
  for(;;){
    const next=[...pending].filter(([,t])=>t.at<=48000).sort((a,b)=>a[1].at-b[1].at)[0];
    if(!next)break;
    pending.delete(next[0]);now=next[1].at;next[1].fn();
  }
  assert.deepEqual(fired.filter(e=>e.node==='center'),[{node:'center',cycle:0,at:0},{node:'center',cycle:1,at:48000}]);
  assert(fired.some(e=>e.node==='quarter'&&e.at===24000));
  assert(fired.some(e=>e.node==='last'&&e.at===24937.5));
  runner.stopAll();assert.equal(pending.size,0);
});
