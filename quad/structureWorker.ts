import {calculateStructure, EMPTY_STRUCTURE} from './structureModel';
self.onmessage=(event:MessageEvent)=>{
  try {self.postMessage(calculateStructure(event.data.pads,event.data.blockScale));}
  catch {self.postMessage({...EMPTY_STRUCTURE,error:'结构计算失败，请调整参数后重试。'});}
};
