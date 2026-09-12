import {test} from 'node:test';
import assert from 'node:assert/strict';
import {archiveSequenceRound,type SequenceArchive,type SequenceRound} from '../quad/sequenceModel.ts';
const round=(cycle:number):SequenceRound=>({cycle,steps:8,hits:[],played:[]});
test('archives played events, caps history and resets on restart',()=>{
 let state:SequenceArchive={current:{...round(0),played:['center']},previous:null,history:[]};
 state=archiveSequenceRound(state,round(1));
 assert.deepEqual(state.history[0].played,['center']);
 for(let i=2;i<40;i++)state=archiveSequenceRound(state,round(i));
 assert.equal(state.history.length,31);
 assert.equal(state.history[0].cycle,8);
 state=archiveSequenceRound(state,round(0));
 assert.deepEqual(state.history,[]);
 assert.equal(state.previous,null);
});
test('same-cycle compilation does not duplicate history or forget triggers',()=>{
 const state:SequenceArchive={current:{...round(3),played:['center']},previous:round(2),history:[round(2)]};
 const next=archiveSequenceRound(state,round(3));
 assert.equal(next.history.length,1);
 assert.deepEqual(next.current?.played,['center']);
});
