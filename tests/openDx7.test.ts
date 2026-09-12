import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {generateFactoryPatches} from '../quad/synth/opendx7/patches.js';

function fixture(){
  let Processor:any;
  const scope:any={sampleRate:48000,currentTime:0,Float32Array,Float64Array,Math,
    AudioWorkletProcessor:class{port:any={onmessage:null};},registerProcessor:(_:string,c:any)=>{Processor=c;}};
  vm.runInNewContext(readFileSync(new URL('../public/vendor/opendx7/processor.js',import.meta.url),'utf8'),scope);
  const p=new Processor();p._setPatch(generateFactoryPatches()[0]);
  return {p,scope,render:()=>{const data=new Float32Array(128);p.process([],[[data]],{});scope.currentTime+=128/48000;return data;}};
}
test('FM scheduler waits for audio time and renders concurrent notes',()=>{
  const {p,scope,render}=fixture();
  p.port.onmessage({data:{type:'scheduled',events:[{type:'noteOn',note:60,velocity:100,id:1,at:.02},{type:'noteOn',note:64,velocity:100,id:2,at:.02}]}});
  assert.ok(render().every(x=>x===0));assert.equal(p.voices.filter((v:any)=>v.active).length,0);
  scope.currentTime=.02;const audio=render();assert.equal(p.voices.filter((v:any)=>v.active).length,2);assert.ok(audio.some(x=>x!==0));assert.ok(audio.every(Number.isFinite));
});
test('FM releases one repeated note without releasing the newer voice, and panic cancels queued notes',()=>{
 const {p,scope,render}=fixture();p._noteOn(60,100,1);p._noteOn(60,100,2);p._noteOff(60,1);
 assert.equal(p.voices.find((v:any)=>v.eventId===1).released,true);assert.equal(p.voices.find((v:any)=>v.eventId===2).released,false);
 p.port.onmessage({data:{type:'scheduled',events:[{type:'noteOn',note:70,velocity:100,id:3,at:1}]}});
 p._panic();scope.currentTime=2;assert.ok(render().every(x=>x===0));assert.equal(p.scheduled.length,0);
});
