import {compileLilyCycle,getPadCycleDurationMs,type QuadLilyPad} from './core.ts';
import {getPadFormations,findFormationForNode} from './groupMotion.ts';
import {materializePadMotion} from './motionRuntime.ts';
import {sequenceRound,type SequenceRound} from './sequenceModel.ts';
const gcd=(a:number,b:number):number=>b?gcd(b,a%b):a;
// Playback samples movement at integer phrase boundaries. For a rational p/q
// movement rate, p integer phrases restore its phase (not rounded p/q).
function integerReturn(rate:number):number|null {
 for(let q=1;q<=1000;q++){const p=Math.round(rate*q);if(p>0&&Math.abs(p/q-rate)<1e-10)return p/gcd(p,q);}
 return null;
}
export function minimalSequencePeriod(keys:string[]):number {
 if(!keys.length)return 0;
 const prefix=new Array(keys.length).fill(0);
 for(let i=1;i<keys.length;i++){let j=prefix[i-1];while(j>0&&keys[i]!==keys[j])j=prefix[j-1];if(keys[i]===keys[j])j++;prefix[i]=j;}
 const p=keys.length-prefix[keys.length-1];return keys.length%p===0?p:keys.length;
}
export function calculateSequencePeriod(pad:QuadLilyPad,limit=16384):{rounds:SequenceRound[];motionPeriod:number;unique:number;durationMs:number;error?:string} {
 const formations=getPadFormations(pad);
 const rates:number[]=[];
 for(const f of formations)if(f.shape!=='chord'&&f.nodeIds.some(id=>pad.nodes.some(n=>n.id===id&&!n.hidden)))rates.push(f.rateCycles);
 for(const n of pad.nodes)if(!n.hidden&&!findFormationForNode(formations,n.id)&&n.motion&&n.motion.mode!=='off')rates.push(n.motion.rateCycles??1);
 let motionPeriod=1;
 for(const rate of rates){const p=integerReturn(Number.isFinite(rate)&&rate>0?rate:1);if(p===null)return {rounds:[],motionPeriod:0,unique:0,durationMs:0,error:'此运动周期无法确定有限回归，请使用整数周期。'};motionPeriod=motionPeriod/gcd(motionPeriod,p)*p;if(motionPeriod>limit)return {rounds:[],motionPeriod,unique:0,durationMs:0,error:`完整循环超过 ${limit} 轮，请缩短运动周期后查看全图。`};}
 const durations:number[]=[];
 const rounds=Array.from({length:motionPeriod},(_,i)=>{const snapshot=materializePadMotion(pad,i);durations.push(getPadCycleDurationMs(snapshot));return sequenceRound(i,compileLilyCycle(snapshot),snapshot);});
 const keys=rounds.map((r,i)=>JSON.stringify([durations[i],r.hits.filter(h=>!h.muted).map(h=>`${h.step}:${h.midi}`).sort()]));
 const period=minimalSequencePeriod(keys);
 return {rounds:rounds.slice(0,period),motionPeriod,unique:new Set(keys).size,durationMs:durations.slice(0,period).reduce((a,b)=>a+b,0)};
}
