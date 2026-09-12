import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createQuadLilyWorkspace,compileLilyCycle} from '../quad/core.ts';
import {sequenceRound,sequenceChanges} from '../quad/sequenceModel.ts';
test('sequence records snapshot pitches, concurrent events, mute and hidden independently',()=>{
 const pad=createQuadLilyWorkspace().pads.A; pad.nodes.push({id:'node-1',x:.51,y:.5,range:.2,scaleStep:1,isCenter:false,muted:true},{id:'node-2',x:.51,y:.5,range:.2,scaleStep:2,isCenter:false,hidden:true});
 const plan=compileLilyCycle(pad); const round=sequenceRound(0,plan,pad);
 assert.equal(round.hits.find(h=>h.nodeId==='node-1')?.muted,true);assert.equal(round.hits.some(h=>h.nodeId==='node-2'),false);
 const name=round.hits[0].name;pad.rootMidi=72;assert.equal(round.hits[0].name,name);
 const simultaneous=sequenceRound(1,{...plan,events:[{nodeId:'center',delayMs:0,depth:0,scaleStep:0},{nodeId:'node-1',delayMs:0,depth:0,scaleStep:1}]},pad);assert.equal(simultaneous.hits[0].step,simultaneous.hits[1].step);
});
test('changes use actual delivered nodes, distinguish new, exit and timing',()=>{
 const h={nodeId:'a',midi:60,name:'C4',step:2,muted:false};const prev={cycle:0,steps:16,hits:[h,{...h,nodeId:'b',name:'D4'}],played:['a']};
 assert.deepEqual(sequenceChanges({cycle:1,steps:16,hits:[{...h,step:1}],played:[]},prev),['C4 提前 1 步']);
 assert.deepEqual(sequenceChanges({cycle:1,steps:16,hits:[],played:[]},prev),['C4 退出']);
});
test('events at or beyond phrase boundary are not plotted as this phrase',()=>{
 const pad=createQuadLilyWorkspace().pads.A;const plan=compileLilyCycle(pad);
 const round=sequenceRound(0,{...plan,events:[...plan.events,{nodeId:'center',delayMs:600,depth:4,scaleStep:0}]},pad);
 assert.equal(round.hits.length,1);
});
test('automatic chord-hold rounds use the already compiled cycle boundary',()=>{
 const pad=createQuadLilyWorkspace().pads.A;pad.phraseMode='auto';
 pad.nodes.push({id:'chord-note',x:.51,y:.5,range:0,scaleStep:1,isCenter:false});
 pad.formations=[{id:'G1',shape:'chord',nodeIds:['center','chord-note'],holdSteps:4,centerX:.5,centerY:.5,radius:.05,rateCycles:1}];
 const plan=compileLilyCycle(pad);assert.equal(plan.intervalMs,600);
 pad.formations[0].holdSteps=1;
 const round=sequenceRound(0,{...plan,events:[...plan.events,{nodeId:'center',delayMs:450,depth:3,scaleStep:0}]},pad);
 assert.equal(round.steps,4);
 assert.ok(round.hits.some(hit=>hit.step===3));
});
