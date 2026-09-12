import {calculateSequencePeriod} from './sequencePeriod';
self.onmessage = (event: MessageEvent) => {
  try { self.postMessage(calculateSequencePeriod(event.data)); }
  catch { self.postMessage({rounds:[],motionPeriod:0,unique:0,durationMs:0,error:'音序计算失败，请调整参数后重试。'}); }
};
