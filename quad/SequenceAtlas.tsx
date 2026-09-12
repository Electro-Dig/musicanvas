import { useUiText } from './uiLocale';
import React, {useLayoutEffect, useRef, useState, useMemo} from 'react';
import type {SequenceRound} from './sequenceModel';
import type {QuadLilyPad} from './core';
import {useSequencePlan} from './useSequencePlan';
import './sequenceAtlas.css';

export function SequenceAtlas({current,pad,phase,playing,onSelect}:{current:SequenceRound;pad:QuadLilyPad;phase:number;playing:boolean;onSelect:(id:string)=>void}) {
  const tr = useUiText();
 const [follow,setFollow]=useState(true);
 const scroll=useRef<HTMLDivElement>(null);
 const active=useRef<HTMLTableRowElement>(null);
 const selectRef=useRef(onSelect);
 useLayoutEffect(()=>{selectRef.current=onSelect;},[onSelect]);
 const plan=useSequencePlan(pad);
 const key=plan;
 const [top,setTop]=useState(0);
 const rounds=plan.rounds;
 const liveIndex=current.cycle%Math.max(1,rounds.length);
 const steps=useMemo(()=>Math.max(1,...rounds.map(r=>r.steps)),[rounds]);
 const hits=(r:SequenceRound)=>r.hits.filter(h=>!h.muted);
 const grid=useMemo(()=>rounds.map(r=>{const cells:SequenceRound['hits'][]=Array.from({length:steps},()=>[]);for(const h of r.hits)if(!h.muted&&cells[Math.floor(h.step)])cells[Math.floor(h.step)].push(h);return cells;}),[rounds,steps]);
 const offsets=useMemo(()=>{const result=[0];for(const cells of grid)result.push(result[result.length-1]+Math.max(36,...cells.map(c=>c.length*19+9)));return result;},[grid]);
 let low=0,high=rounds.length;
 while(low<high){const mid=(low+high)>>1;if(offsets[mid]<top)low=mid+1;else high=mid;}
 const start=Math.max(0,low-5),end=Math.min(rounds.length,start+64);
 useLayoutEffect(()=>{
  if(follow&&scroll.current&&rounds.length){
   const box=scroll.current, y=offsets[liveIndex];
   if(y<box.scrollTop||offsets[liveIndex+1]>box.scrollTop+box.clientHeight-40){box.scrollTop=Math.max(0,y-box.clientHeight/2);setTop(box.scrollTop);}
  }
 },[current.cycle,follow,key]);
 const currentStep=Math.min(current.steps-1,Math.floor(phase*current.steps));
 const body=useMemo(()=>(   <tbody>{start>0&&<tr aria-hidden="true"><td colSpan={steps+2} style={{height:offsets[start]-3,padding:0,border:0,background:'transparent'}}/></tr>}{rounds.slice(start,end).map((r,index)=>{
    const ri=start+index;
    const live=ri===liveIndex, rh=hits(r), prev=rounds[(ri+rounds.length-1)%rounds.length];
    return <tr key={r.cycle} style={{height:offsets[ri+1]-offsets[ri]-3}} ref={live?active:undefined} className={live?'atlas-current':''} aria-current={live?'step':undefined}>
     <th title={tr("循环中的第 {0} 轮", ri+1)}>{live?'▶ ':''}{r.cycle+1}</th>
     {Array.from({length:steps},(_,i)=>{
      const cell=grid[ri][i];
      const old=grid[(ri+rounds.length-1)%rounds.length][i];
      const changed=!!prev&&cell.map(h=>h.name).sort().join()!==old.map(h=>h.name).sort().join();
      const now=live&&playing&&currentStep===i;
      return <td key={i} className={`${!cell.length?'atlas-empty':''} ${cell.length>1?'atlas-chord':''} ${changed?'atlas-changed':''} ${now?'atlas-now':''}`} aria-current={now?'step':undefined}>
       {cell.length?cell.map((h,j)=><React.Fragment key={h.nodeId}><button className={live&&current.played.includes(h.nodeId)?'atlas-played':''} onClick={()=>selectRef.current(h.nodeId)} title={tr("{0} · 第 {1} 步 · {2}", h.name, i+1, live&&current.played.includes(h.nodeId)?tr("已触发"):tr("预计触发"))}>{h.name}</button></React.Fragment>):<span className="atlas-rest">{i<r.steps?'—':'·'}</span>}
      </td>;
     })}<td>{rh.length}</td>
    </tr>;
   })}{end<rounds.length&&<tr aria-hidden="true"><td colSpan={steps+2} style={{height:offsets[rounds.length]-offsets[end]-3,padding:0,border:0,background:'transparent'}}/></tr>}</tbody>),[tr, rounds,grid,offsets,start,end,steps,liveIndex,playing,currentStep,current.played]);
 return <section className="sequence-atlas" aria-label={tr("音序全图")}>
  <header><strong>{tr("音序全图")}</strong><button aria-pressed={follow} onClick={()=>setFollow(!follow)}>{follow?tr("跟随播放"):tr("恢复跟随")}</button></header>
  <p>{plan.error?tr(plan.error):tr("完整循环 {0} 轮 · {1} 秒 · {2} 种音序", rounds.length, Number((plan.durationMs/1000).toFixed(2)), plan.unique)}</p>
  <div className="atlas-legend"><span>{tr("粉框：比上一轮改变")}</span><span>{tr("蓝底：同时触发")}</span><span>{tr("绿框：正在播放")}</span></div>
  <div className="sequence-atlas-scroll" ref={scroll} onScroll={event=>setTop(event.currentTarget.scrollTop)}>
   <table style={{minWidth:Math.max(280,steps*28+50)}}><thead><tr><th>{tr("轮")}</th>{Array.from({length:steps},(_,i)=><th key={i}>{i+1}</th>)}<th>{tr("音数")}</th></tr></thead>
   {body}</table>
  </div>
  <footer>{tr("每行一轮 · 同格叠音 · 粉框标变化")}<br/>{tr("从起点预计算完整回归，游标循环跟随。每个音独立小格；粉框与前一轮比较（首轮对照末轮）。")}</footer>
 </section>;
}
