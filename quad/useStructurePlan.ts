import {useEffect,useMemo,useState} from 'react';
import {QUAD_PAD_IDS,type QuadLilyPad,type QuadLilyWorkspace} from './core';
import {EMPTY_STRUCTURE,type StructurePlan} from './structureModel';

/** Exclude playback, volume and timbre: none changes the structural score. */
export function structurePadInput(p:QuadLilyPad) {
  return {id:p.id,nodes:p.nodes,formations:p.formations,formation:p.formation,intervalMs:p.intervalMs,
    phraseSteps:p.phraseSteps,phraseMode:p.phraseMode,rootMidi:p.rootMidi,scaleKey:p.scaleKey,
    octaveTranspose:p.octaveTranspose,loop:p.loop};
}

export function useStructurePlan(pads:QuadLilyWorkspace['pads'],blockScale=1) {
  const key=useMemo(()=>JSON.stringify({blockScale,pads:QUAD_PAD_IDS.map(id=>structurePadInput(pads[id]))}),[pads,blockScale]);
  const [result,setResult]=useState<{key:string;plan:StructurePlan}>();
  useEffect(()=>{
    let worker:Worker|undefined;
    const timer=setTimeout(()=>{
      try {
        worker=new Worker(new URL('./structureWorker.ts',import.meta.url),{type:'module'});
        worker.onmessage=e=>{setResult({key,plan:e.data});worker?.terminate();};
        worker.onerror=()=>{setResult({key,plan:{...EMPTY_STRUCTURE,error:'无法计算结构，请刷新后重试。'}});worker?.terminate();};
        worker.postMessage(JSON.parse(key));
      } catch {setResult({key,plan:{...EMPTY_STRUCTURE,error:'当前环境无法启动结构计算。'}});}
    },80);
    return ()=>{clearTimeout(timer);worker?.terminate();};
  },[key]);
  return result?.key===key?result.plan:null;
}
