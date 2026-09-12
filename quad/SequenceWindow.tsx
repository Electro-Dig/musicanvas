import React, {useState} from 'react';
import type {SequenceRound,SequenceHit} from './sequenceModel';
import {sequenceChanges} from './sequenceModel';
import {formatMidiNote} from './nodePresentation';
import './sequenceWindow.css';
export function SequenceWindow({current,previous,phase,playing,padId,selected,onSelect}:{current:SequenceRound;previous:SequenceRound|null;phase:number;playing:boolean;padId:string;selected:string|null;onSelect:(id:string)=>void}) {
 const [open,setOpen]=useState(false);
 const [inspect,setInspect]=useState<string|null>(null);
 const pitches=[...new Set([...current.hits,...(previous?.hits??[])].filter(h=>!h.muted).map(h=>h.midi))];
 const lo=Math.min(59,...pitches), hi=Math.max(75,...pitches); const rows=hi-lo+1;
 const steps=Math.max(current.steps,previous?.steps??0);
 const changes=sequenceChanges(current,previous);
 const hitLabel=(h:SequenceHit)=>`${h.name} · 第 ${h.step+1} 步${h.muted?' · 静音连接点':''}`;
 const plot=(round:SequenceRound,old:boolean)=><div className="sequence-plot" style={{height:rows*20+28,minWidth:Math.max(700,steps*42)}}>
  {Array.from({length:rows},(_,i)=><div className="sequence-pitch" key={i} style={{top:i*20}}><span>{formatMidiNote(hi-i)}</span></div>)}
  {Array.from({length:steps},(_,i)=><div className="sequence-beat" key={i} style={{left:`calc(52px + (100% - 52px) * ${i/steps})`}}><span>{i+1}</span></div>)}
  {round.hits.filter(h=>!old||round.played.includes(h.nodeId)).map(h=><button key={h.nodeId} title={hitLabel(h)} aria-label={`${old?'上一轮':'本轮'} ${hitLabel(h)}`} className={`sequence-hit ${h.muted?'is-muted':''} ${selected===h.nodeId?'is-selected':''} ${round.played.includes(h.nodeId)?'is-played':''}`} style={{left:`calc(52px + (100% - 52px) * ${h.step/steps})`,top:h.muted?rows*20+3:(hi-h.midi)*20,width:`calc((100% - 52px) / ${steps} - 4px)`}} onClick={()=>onSelect(h.nodeId)} onMouseEnter={()=>setInspect(hitLabel(h))} onMouseLeave={()=>setInspect(null)}>{h.muted?'◇':h.name}</button>)}
  {!old&&playing&&<div className="sequence-playhead" style={{left:`calc(52px + (100% - 52px) * ${phase*current.steps/steps})`}}/>}
  <span className="sequence-rest-label" style={{top:rows*20+3}}>连接</span>
 </div>;
 return <section className={`sequence-window ${open?'':'is-closed'}`} aria-label="音序对照窗">
  <header><div><b>音序 / PAD {padId}</b><span>{current.steps} 步 · 触发点 × 音高</span></div><div><button onClick={()=>setOpen(!open)}>{open?'收起音高细节':'展开音高细节'}</button></div></header>
  <div className="sequence-summary">{inspect??(previous?(changes.length?changes.join(' · '):'本轮计划与上一轮触发顺序相同'):'播放两轮，查看音序变化')}<small>实心：已触发　空心：待触发　◇：静音连接　同列：同时触发</small></div>
  <div className="sequence-strip" style={{gridTemplateColumns:`repeat(${Math.min(8,current.steps)},minmax(0,1fr))`}}>{Array.from({length:current.steps},(_,i)=>{const hits=current.hits.filter(h=>Math.floor(h.step)===i&&!h.muted);return <div className={playing&&Math.floor(phase*current.steps)===i?'is-now':''} key={i}><small>{i+1}</small>{hits.length?hits.map(h=><button key={h.nodeId} className={current.played.includes(h.nodeId)?'played':''} onClick={()=>onSelect(h.nodeId)} title={hitLabel(h)}>{h.name}</button>):<span>—</span>}</div>})}</div>
  {open&&<><div className="sequence-scroll"><div className="sequence-panels"><div><h3>本轮计划 <span>{playing?'播放中':'未播放 / 停止'} · #{current.cycle+1}　｜　上一轮实际触发：{previous?`#${previous.cycle+1}（虚线）`:'等待记录'}</span></h3><div className="sequence-overlay">{plot(current,false)}{previous&&<div className="sequence-history">{plot(previous,true)}</div>}</div></div></div></div>
  <footer>仅显示乐句边界内的触发。横向读顺序，纵向读音高。块宽只标触发点，不代表声音时长；点击音名选中画布节点。历史记录为到时调度事件，不是录音检测。</footer></>}
 </section>;
}
