import React,{memo,useEffect,useMemo,useRef,useState} from 'react';
import {Maximize2,Minimize2} from 'lucide-react';
import {QUAD_PAD_IDS,type QuadLilyPad,type QuadLilyWorkspace,type QuadPadId} from './core';
import {structurePadInput,useStructurePlan} from './useStructurePlan';
import {buildFollowModel,followPosition,type FollowClock,type FollowModel,type FollowPath} from './melodyFollowModel';
import './melodyFollow.css';

export type FollowPlayback=FollowClock&{sourcePad?:QuadLilyPad};
export type ReadFollowClocks=()=>Record<QuadPadId,FollowPlayback>;
type Props={pads:QuadLilyWorkspace['pads'];readClocks:ReadFollowClocks;transportKey:string};
const sec=(ms:number)=>Number((ms/1000).toFixed(2));
const pitchName=(m:number)=>['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][m%12]+(Math.floor(m/12)-1);
const padColor=(id:QuadPadId)=>`var(--quad-pad-${id.toLowerCase()})`;

/** Only mounted in this view; no clock loop while paused, hidden, or in another graph mode. */
function useFollowClocks(read:ReadFollowClocks,transportKey:string) {
  const [clocks,setClocks]=useState(read);
  useEffect(()=>{
    let frame=0,last=0;
    const update=(now:number)=>{
      if(document.hidden)return;
      if(now-last>=32){
        last=now;
        const next=read();setClocks(next);
        if(!QUAD_PAD_IDS.some(id=>next[id].playing&&(next[id].phase<1||next[id].sourcePad?.loop!==false)))return;
      }
      frame=requestAnimationFrame(update);
    };
    const wake=()=>{cancelAnimationFrame(frame);last=0;if(!document.hidden){setClocks(read());frame=requestAnimationFrame(update);}};
    wake();document.addEventListener('visibilitychange',wake);
    return ()=>{cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',wake);};
  },[read,transportKey]);
  return clocks;
}

function geometry(path:FollowPath,width:number,expanded:boolean) {
  const left=36,right=16,top=36,height=path.ground?62:expanded?270:180;
  const events=path.reference.events.filter(e=>e.atMs<path.durationMs);
  let low=127,high=0;
  for(const e of events)for(const n of e.notes){low=Math.min(low,n.midi);high=Math.max(high,n.midi);}
  if(!events.length){low=48;high=72;}
  low-=2;high+=2;
  const x=(ms:number)=>left+Math.max(0,Math.min(path.durationMs,ms))/Math.max(1,path.durationMs)*(width-left-right);
  const y=(midi:number)=>top+(high-midi)/Math.max(1,high-low)*height;
  const pieces:string[]=[];
  events.forEach((e,i)=>{
    const end=events[i+1]?.atMs??path.durationMs;
    for(const n of e.notes)pieces.push(`M${x(e.atMs)},${y(n.midi)}H${x(end)}`);
    if(e.notes.length===1&&events[i+1]?.notes.length===1)pieces.push(`M${x(end)},${y(e.notes[0].midi)}V${y(events[i+1].notes[0].midi)}`);
  });
  return {width,left,right,top,height,low,high,x,y,events,d:pieces.join(' '),svgHeight:top+height+32};
}
type Geometry=ReturnType<typeof geometry>;

const FollowScore=memo(function FollowScore({path,model,g}:{path:FollowPath;model:FollowModel;g:Geometry}){
  const {x,y,left,right,width,top,height,events}=g;
  const parts=Math.ceil(path.durationMs/model.plan.blockMs);
  const stride=Math.max(1,Math.ceil(parts/(width<450?3:8)));
  const tickIndices=Array.from({length:parts},(_,i)=>i).filter(i=>i%stride===0&&x(path.durationMs)-x(i*model.plan.blockMs)>32);
  const pitches=Array.from({length:11},(_,i)=>i*12).filter(m=>m>=g.low&&m<=g.high);
  return <g className="follow-score" aria-hidden="true">
    {Array.from({length:parts},(_,i)=>{
      const begin=i*model.plan.blockMs,end=Math.min(path.durationMs,begin+model.plan.blockMs);
      const column=Math.floor((begin+path.reference.entryMs)/model.plan.blockMs);
      const motif=path.reference.track.cells[column]?.motif;
      return <g key={i}>
        {i%2===0&&<rect x={x(begin)} y={25} width={x(end)-x(begin)} height={height+top-20} className="follow-phrase-shade"/>}
        {!path.ground&&motif!=null&&x(end)-x(begin)>32&&<text x={x(begin)+4} y={top+9} className="follow-phrase-label">句{motif+1}</text>}
      </g>;
    })}
    {pitches.map(m=><g key={m}><line x1={left} x2={width-right} y1={y(m)} y2={y(m)} className="follow-grid"/><text x={0} y={y(m)+4}>{pitchName(m)}</text></g>)}
    {tickIndices.map(i=><text key={i} x={x(i*model.plan.blockMs)} y={16} textAnchor={i===0?'start':'middle'}>{sec(i*model.plan.blockMs)}s</text>)}
    <text x={x(path.durationMs)} y={16} textAnchor="end">{sec(path.durationMs)}s</text>
    <path d={g.d} className="follow-melody-line"/>
    {events.length<2048&&events.flatMap((e,i)=>e.notes.map((n,j)=><circle key={`${i}-${j}`} cx={x(e.atMs)} cy={y(n.midi)} r={1.5} className="follow-onset"/>))}
    {!events.length&&<text x={left} y={top+height/2}>这个声部尚无起音</text>}
    <text x={left} y={top+height+25} className="follow-axis-label">{path.ground?'低音周期内时间 →':'旋律内部时间 →'}</text>
  </g>;
});

const FollowPathView=memo(function FollowPathView({model,path,clocks,stale,expanded}:{model:FollowModel;path:FollowPath;clocks:Record<QuadPadId,FollowPlayback>;stale:Set<QuadPadId>;expanded:boolean}) {
  const host=useRef<HTMLDivElement>(null);
  const [width,setWidth]=useState(280);
  useEffect(()=>{
    const observer=new ResizeObserver(([entry])=>setWidth(Math.max(180,Math.round(entry.contentRect.width))));
    if(host.current)observer.observe(host.current);
    return ()=>observer.disconnect();
  },[]);
  const g=useMemo(()=>geometry(path,width,expanded),[path,width,expanded]);
  const positions=path.voices.map(voice=>({voice,clock:clocks[voice.track.id],...followPosition(model.plan,path,voice,clocks[voice.track.id])}));
  const shared=path.voices.length>1;
  const title=path.ground?`${path.reference.track.id} · 固定低音`:shared?`${path.voices.map(v=>v.track.id).join(' / ')} · 共用旋律`:`${path.reference.track.id} · 独立声部`;
  return <div className="follow-path" ref={host} data-follow-path={path.voices.map(v=>v.track.id).join('')}>
    <div className="follow-path-heading"><strong>{title}</strong><span>{path.ground?`重复 ${model.plan.columns} 次`:shared?'同音高 · 同节奏':'按本轨音序显示'}</span></div>
    <svg className="follow-svg" viewBox={`0 0 ${width} ${g.svgHeight}`} height={g.svgHeight} role="img" aria-label={`${title}，纵向是音高，横向是进入后的时间`}>
      <FollowScore path={path} model={model} g={g}/>
      {positions.map(({voice,clock,waiting,outside,positionMs,event})=>{
        const id=voice.track.id;
        if(waiting||outside||stale.has(id)||!event)return null;
        const x=g.x(positionMs),color=padColor(id);
        return <g key={id} data-follow-marker={id} data-position-ms={positionMs.toFixed(2)} data-midi={event.notes.map(n=>n.midi).join(',')} data-paused={clock.paused||undefined}>
          <line x1={x} x2={x} y1={g.top-5} y2={g.top+g.height+3} stroke={color} className="follow-position-line"/>
          {event.notes.map((n,i)=>{
            const y=g.y(n.midi);
            return <g key={i}>
              <circle cx={x} cy={y} r={10} fill={color} className="follow-marker-halo"/>
              {id==='B'?<circle cx={x} cy={y} r={4.5} fill={color}/>:id==='C'?<rect x={x-4} y={y-4} width={8} height={8} fill={color}/>:id==='D'?<path d={`M${x},${y-5}l5,9h-10Z`} fill={color}/>:<circle cx={x} cy={y} r={4.5} fill={color}/>}
              {i===0&&<text x={Math.min(width-g.right-10,x+7)} y={y-12} className="follow-marker-label">{id}</text>}
            </g>;
          })}
        </g>;
      })}
    </svg>
    <div className="follow-voice-list" aria-label={`${title}实时位置`}>
      {positions.map(({voice,clock,waiting,outside,positionMs,globalMs,event,repeat})=>{
        const id=voice.track.id,pending=stale.has(id);
        const state=pending?'编辑待下轮生效':outside?'超出预览范围':!clock.playing&&!clock.paused?'待播':waiting?'等待进入':clock.paused?'暂停':'播放';
        return <div className="follow-voice" key={id} data-follow-voice={id} data-state={state} data-global-ms={globalMs.toFixed(2)}>
          <b className="follow-pad" style={{color:padColor(id)}}>{id}</b>
          <span className="follow-note">{pending||waiting||outside?'—':event?.notes.map(n=>n.name).join(' + ')||'—'}</span>
          <span className="follow-voice-time">{state}{!pending&&!waiting&&!outside?` · ${path.ground?`第 ${repeat}/${model.plan.columns} 次`:`${sec(positionMs)}s`}`:''}</span>
        </div>;
      })}
    </div>
    {shared&&<p className="follow-entries">{path.voices.map(voice=>`${voice.track.id}：${sec(voice.entryMs)}s 进入`).join(' · ')}</p>}
  </div>;
});

export function MelodyFollow({pads,readClocks,transportKey}:Props) {
  const plan=useStructurePlan(pads);
  const model=useMemo(()=>plan&&!plan.error?buildFollowModel(plan):null,[plan]);
  const clocks=useFollowClocks(readClocks,transportKey);
  const stale=useMemo(()=>new Set(QUAD_PAD_IDS.filter(id=>{
    const source=clocks[id].sourcePad;
    return source&&JSON.stringify(structurePadInput(source))!==JSON.stringify(structurePadInput(pads[id]));
  })),[pads,clocks.A.sourcePad,clocks.B.sourcePad,clocks.C.sourcePad,clocks.D.sourcePad]);
  const [expanded,setExpanded]=useState(false);
  const panel=useRef<HTMLElement>(null);
  const toggle=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    if(!expanded)return;
    panel.current?.showPopover();
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();setExpanded(false);toggle.current?.focus();}};
    document.addEventListener('keydown',key,true);
    return ()=>document.removeEventListener('keydown',key,true);
  },[expanded]);
  const shared=model?.paths.some(p=>p.voices.length>1);
  return <section className="melody-follow" ref={panel} popover={expanded?'manual':undefined} data-expanded={expanded||undefined} aria-label="旋律追随">
    <header className="follow-header"><div><strong>旋律追随</strong><span>同一句旋律，先后走过</span></div>
      <button className="quad-pro-mini-btn" type="button" aria-label={expanded?'收起旋律追随':'展开旋律追随'} aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)} ref={toggle}>
        {expanded?<Minimize2 size={13}/>:<Maximize2 size={13}/>} {expanded?'收起':'展开'}
      </button>
    </header>
    {!plan?<p role="status">正在对齐旋律…</p>:plan.error?<p role="status">{plan.error}</p>:model&&<>
      <p className="follow-summary">{plan.complete&&plan.commonPeriodMs!==null?'共同循环':'预览范围'} {sec(plan.durationMs)} 秒 · {shared?'相同音序共用一条路径':'各声部独立呈现'}</p>
      {!plan.complete&&<p className="follow-notice">尚未覆盖完整周期，仅展示已计算范围。</p>}
      <div className="follow-paths">{model.paths.map(path=><FollowPathView key={path.reference.track.id} model={model} path={path} clocks={clocks} stale={stale} expanded={expanded}/>)}</div>
      <footer>标记跟随各轨实际播放时钟；高度表示最近触发音，线段不代表尾音长度。只有已覆盖音高与节奏完全一致的声部才共用路径。</footer>
    </>}
  </section>;
}
