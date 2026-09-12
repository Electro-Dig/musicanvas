import {useEffect, useMemo, useState} from 'react';
import type {QuadLilyPad} from './core';
import type {calculateSequencePeriod} from './sequencePeriod';
type Plan = ReturnType<typeof calculateSequencePeriod>;
const pending: Plan = {rounds:[],motionPeriod:0,unique:0,durationMs:0,error:'正在计算完整周期…'};
export function useSequencePlan(pad: QuadLilyPad) {
  // Playback, timbre and volume don't change the predicted sequence.
  const key = useMemo(() => JSON.stringify({id:pad.id,nodes:pad.nodes,formations:pad.formations,formation:pad.formation,intervalMs:pad.intervalMs,phraseSteps:pad.phraseSteps,phraseMode:pad.phraseMode,rootMidi:pad.rootMidi,scaleKey:pad.scaleKey,octaveTranspose:pad.octaveTranspose}), [pad]);
  const [result,setResult] = useState<{key:string;plan:Plan}>();
  useEffect(() => {
    let worker: Worker | undefined;
    const timer = setTimeout(() => {
      try {
        worker = new Worker(new URL('./sequenceWorker.ts', import.meta.url), {type:'module'});
        worker.onmessage = event => { setResult({key,plan:event.data}); worker?.terminate(); };
        worker.onerror = () => {setResult({key,plan:{...pending,error:'无法计算音序，请刷新后重试。'}});worker?.terminate();};
        worker.postMessage(JSON.parse(key));
      } catch { setResult({key,plan:{...pending,error:'当前环境无法启动音序计算。'}}); }
    }, 60);
    return () => { clearTimeout(timer); worker?.terminate(); };
  }, [key]);
  return result?.key === key ? result.plan : pending;
}
