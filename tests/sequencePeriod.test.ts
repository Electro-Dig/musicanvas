import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createQuadLilyWorkspace} from '../quad/core.ts';
import {calculateSequencePeriod,minimalSequencePeriod} from '../quad/sequencePeriod.ts';
test('a repeated first phrase does not prove the full sequence returned',()=>{
 assert.equal(minimalSequencePeriod(['A','A','B','A','A','B']),3);
 assert.equal(minimalSequencePeriod(['A','B','A','C']),4);
 assert.equal(minimalSequencePeriod(['A','A','A']),1);
});
test('combines motion cycles before minimizing the musical sequence',()=>{
 const pad=createQuadLilyWorkspace().pads.A;
 pad.nodes[0].motion={mode:'orbit',rateCycles:2,amount:.02};
 pad.nodes.push({...pad.nodes[0],id:'other',x:.6,isCenter:false});
 pad.nodes[1].motion={mode:'orbit',rateCycles:3,amount:.02};
 const plan=calculateSequencePeriod(pad);
 assert.equal(plan.motionPeriod,6);
 assert.ok(plan.rounds.length>0&&6%plan.rounds.length===0);
 assert.ok(plan.durationMs>0);
});
test('fractional cycle rates restore at an integer phrase boundary',()=>{
 const pad=createQuadLilyWorkspace().pads.A;
 pad.nodes[0].motion={mode:'orbit',rateCycles:1.5,amount:.02};
 assert.equal(calculateSequencePeriod(pad).motionPeriod,3);
});
test('oversized period is explicit rather than a truncated full cycle',()=>{
 const pad=createQuadLilyWorkspace().pads.A;
 pad.nodes[0].motion={mode:'orbit',rateCycles:11,amount:.02};
 const plan=calculateSequencePeriod(pad,10);
 assert.ok(plan.error);
 assert.deepEqual(plan.rounds,[]);
});
