import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createQuadLilyWorkspace,compileLilyCycle,parseQuadLilyWorkspace} from '../quad/core.ts';
import {createAirProgression,createAirEightProgression} from '../quad/airProgression.ts';
import {materializePadMotion} from '../quad/motionRuntime.ts';
import {resolveFormationNodePosition} from '../quad/groupMotion.ts';
function fixture(root=false){
 const w=createQuadLilyWorkspace(),p=w.pads.A;
 p.phraseSteps=16;
 p.nodes=[{...p.nodes[0],x:.1,y:.5,range:.15},...['a','b','c'].map((id,i)=>({...p.nodes[0],id,isCenter:false,x:i===0?.2:.7+i*.05,y:.5,range:.05,scaleStep:i+1}))];
 p.formations=[{id:'G1',shape:'chord',nodeIds:root?['center','a','b']:['a','b','c'],centerX:.5,centerY:.5,radius:.1,rateCycles:4}];
 return w;
}
test('touching one chord member schedules all members at one instant, once',()=>{
 const p=fixture().pads.A,events=compileLilyCycle(p).events;
 assert.equal(events.length,4);
 assert.equal(new Set(events.filter(e=>e.nodeId!=='center').map(e=>e.delayMs)).size,1);
 assert.equal(events.find(e=>e.nodeId==='a')?.delayMs,p.intervalMs/4);
});
test('a chord containing ROOT starts together; hidden members remain absent',()=>{
 const p=fixture(true).pads.A;p.nodes.find(n=>n.id==='b')!.hidden=true;
 const events=compileLilyCycle(p).events;
 assert.equal(events.find(e=>e.nodeId==='a')?.delayMs,0);
 assert.ok(!events.some(e=>e.nodeId==='b'));
});
test('automatic phrase includes an explicit ROOT chord hold',()=>{
 const p=createQuadLilyWorkspace().pads.A;
 p.intervalMs=600;p.phraseMode='auto';
 p.nodes=[{...p.nodes[0],x:.1,y:.5,range:.15},{id:'a',isCenter:false,x:.2,y:.5,range:0,scaleStep:1}];
 p.formations=[{id:'G1',shape:'chord',nodeIds:['center','a'],holdSteps:4,centerX:.15,centerY:.5,radius:.05,rateCycles:1}];
 assert.equal(compileLilyCycle(p).intervalMs,600);
});
test('chord shape survives workspace serialization',()=>{
 const w=fixture();assert.equal(parseQuadLilyWorkspace(JSON.stringify(w)).pads.A.formations?.[0].shape,'chord');
});
test('four chords return after eight seconds and retain their two-second spacing after reload',()=>{
 const w=createQuadLilyWorkspace();w.pads.A=createAirProgression();
 const p=parseQuadLilyWorkspace(JSON.stringify(w)).pads.A;
 const result=compileLilyCycle(materializePadMotion(p,0));
 assert.deepEqual([...new Set(result.events.map(e=>e.delayMs))],[0,2000,4000,6000]);
 for(const offset of [0,2000,4000,6000])assert.equal(result.events.filter(e=>e.delayMs===offset).length,4);
 assert.equal(p.phraseSteps*p.intervalMs/4,8000);
 assert.ok(p.formations?.every(f=>f.holdSteps===8));
});
test('concentric chord rings give different voice counts room and preserve spacing at canvas edges',()=>{
 for(const count of [2,3,4,5,7,12,24])for(const center of [.02,.5,.98]){
  const formation={id:'G',shape:'chord' as const,nodeIds:Array.from({length:count},(_,i)=>String(i)),centerX:center,centerY:center,radius:.05,rateCycles:4};
  const points=formation.nodeIds.map((_,i)=>resolveFormationNodePosition(formation,i,0));
  for(let i=0;i<count;i++){
   assert.ok(points[i].x>=0&&points[i].x<=1&&points[i].y>=0&&points[i].y<=1);
   assert.deepEqual(points[i],resolveFormationNodePosition(formation,i,99));
   for(let j=0;j<i;j++)assert.ok(Math.hypot(points[i].x-points[j].x,points[i].y-points[j].y)>.055);
  }
 }
});
test('eight-chord study plays each group in order at two-second intervals',()=>{
 const w=createQuadLilyWorkspace();w.pads.A=createAirEightProgression();
 const p=parseQuadLilyWorkspace(JSON.stringify(w)).pads.A;
 const result=compileLilyCycle(materializePadMotion(p,0));
 assert.equal(result.events.length,32);
 for(let group=0;group<8;group++){
  const members=p.formations![group].nodeIds;
  assert.deepEqual(result.events.filter(e=>members.includes(e.nodeId)).map(e=>e.delayMs),Array(4).fill(group*2000));
 }
 assert.equal(p.phraseSteps*p.intervalMs/4,16000);
});

