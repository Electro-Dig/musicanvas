import { generateFactoryPatches } from './opendx7/patches.js';

const patches = generateFactoryPatches();
const selected = [0,1,2,27,4,15,13,14,20,29,25,12];
export const FM_PRESETS = selected.map(index => ({id:`dx7-${index}`,name:`FM · ${patches[index].name}`,patch:patches[index]}));

export class OpenDx7Engine {
  private loading?: Promise<void>;
  private tracks = new Map<string,{node:AudioWorkletNode,preset:string}>();
  private epochs = new Map<string,number>();
  private serial=0;
  constructor(private ctx:AudioContext,private output:AudioNode) {}
  prepare() {
    return this.loading ??= this.ctx.audioWorklet.addModule('/vendor/opendx7/processor.js').catch(error=>{this.loading=undefined;throw error;});
  }
  async play(track:string,preset:string,note:number,velocity:number,duration:number,when:number) {
    const epoch=this.epochs.get(track)??0;
    this.epochs.set(track,epoch);
    await this.prepare();
    if(epoch!==(this.epochs.get(track)??0))return;
    const patch=FM_PRESETS.find(p=>p.id===preset)?.patch;
    if(!patch)return;
    let voice=this.tracks.get(track);
    if(!voice){
      const node=new AudioWorkletNode(this.ctx,'dx7-processor',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});
      node.connect(this.output);voice={node,preset:''};this.tracks.set(track,voice);
    }
    if(voice.preset!==preset){voice.node.port.postMessage({type:'panic'});voice.node.port.postMessage({type:'patch',patch});voice.preset=preset;}
    const at=Math.max(when,this.ctx.currentTime),id=++this.serial;
    voice.node.port.postMessage({type:'scheduled',events:[
      {type:'noteOn',note,velocity,id,at},
      {type:'noteOff',note,id,at:at+Math.max(.01,duration)}
    ]});
  }
  stop(track:string){this.epochs.set(track,(this.epochs.get(track)??0)+1);this.tracks.get(track)?.node.port.postMessage({type:'panic'});}
  stopAll(){for(const track of new Set([...this.epochs.keys(),...this.tracks.keys()]))this.stop(track);}
}
