import { useUiText } from './uiLocale';
import React,{memo,useMemo,useState} from 'react';
import {type QuadLilyWorkspace,type QuadPadId} from './core';
import {structurePositionMs,groupStructureByContour,type StructureNote} from './structureModel';
import {useStructurePlan} from './useStructurePlan';
import './structureMap.css';

type Clock={cycle:number;phase:number;playing:boolean;paused:boolean};
type Props={pads:QuadLilyWorkspace['pads'];clocks:Record<QuadPadId,Clock>};
const seconds=(ms:number)=>Number((ms/1000).toFixed(2));


const PitchPreview=memo(function PitchPreview({notes,duration,low,high}:{notes:StructureNote[];duration:number;low:number;high:number}){
  return <svg viewBox="0 0 100 26" preserveAspectRatio="none" aria-hidden="true">
    {notes.map((n,i)=><rect key={i} x={3+n.atMs/duration*91} y={3+(high-n.midi)/Math.max(1,high-low)*18} width="3" height="2.5" rx=".7"/>)}
  </svg>;
});

export function StructureMap({pads,clocks}:Props) {
  const tr = useUiText();
  const label=(id:number|null)=>id===null?tr("留白"):tr("句 {0}",id+1);
  const [blockScale,setBlockScale]=useState(1);
  const [picked,setPicked]=useState<{pad:QuadPadId;column:number}|null>(null);
  const sourcePlan=useStructurePlan(pads,blockScale);
  const plan=useMemo(()=>sourcePlan?groupStructureByContour(sourcePlan):null,[sourcePlan]);
  const extent=useMemo(()=>{
    const notes=plan?.tracks.flatMap(t=>t.cells.flatMap(c=>c.notes))??[];
    return {low:notes.length?Math.min(...notes.map(n=>n.midi)):48,high:notes.length?Math.max(...notes.map(n=>n.midi)):84};
  },[plan]);
  const selection=plan&&picked?plan.tracks.find(t=>t.id===picked.pad)?.cells[picked.column]:null;
  const selectedMotif=selection?.motif;
  const occurrences=useMemo(()=>selectedMotif==null?[]:plan?.tracks.flatMap(t=>t.cells.flatMap((cell,i)=>cell.motif===selectedMotif?[tr("{0} · 第 {1} 段", t.id, i+1)]:[]))??[],[tr, plan,selectedMotif]);
  return <section className="structure-map" aria-label={tr("四轨结构对照")}>
    <header><strong>{tr("结构对照")}</strong><label>{tr("分段")}<select aria-label={tr("结构分段长度")} value={blockScale} onChange={e=>{setBlockScale(Number(e.target.value));setPicked(null);}}>
      <option value={1}>{tr("自动")}</option><option value={0.5}>{tr("半段")}</option><option value={2}>{tr("双段")}</option>
    </select></label></header>
    {!plan?<p role="status">{tr("正在对齐四轨结构…")}</p>:plan.error?<p role="status">{tr(plan.error)}</p>:<>
      <p className="structure-summary">{plan.complete&&plan.commonPeriodMs!==null?tr("共同循环"):tr("对照范围")} {seconds(plan.durationMs)} {tr("秒 ·")} {plan.columns} {tr("段 ·")} {plan.motifs.length} {tr("种旋律结构")}</p>
      {!plan.complete&&<p className="structure-notice">{tr("仅展示前")} {plan.columns} {tr("段")}{plan.commonPeriodMs!==null?tr("；共同循环 {0} 秒", seconds(plan.commonPeriodMs)):tr("；尚未覆盖完整回归")}。</p>}
      <p className="structure-guide">{tr("同色同名 = 相同旋律走向与节奏，允许整体移调。")}<br/>{tr("从左到右看发展，沿斜线看接力；点一格高亮同类。")}</p>
      <div className="structure-scroll">
        <table className="structure-grid" style={{minWidth:Math.max(275,plan.columns*58+30)}}>
          <caption>{tr("每格")} {seconds(plan.blockMs)} {tr("秒 · 小点越高，音高越高")}</caption>
          <thead><tr><th scope="col">{tr("轨")}</th>{Array.from({length:plan.columns},(_,i)=><th scope="col" key={i}><b>{i+1}</b><span>{seconds(i*plan.blockMs)}–{seconds(Math.min(plan.durationMs,(i+1)*plan.blockMs))}s</span></th>)}</tr></thead>
          <tbody>{plan.tracks.map(track=>{
            const clock=clocks[track.id];
            const elapsed=structurePositionMs(track,clock.cycle,clock.phase);
            const position=plan.commonPeriodMs!==null?elapsed%plan.commonPeriodMs:elapsed;
            const active=clock.playing||clock.paused;
            return <tr key={track.id} data-track={track.id}>
              <th scope="row"><b>{track.id}</b><small>{clock.playing?tr("播放"):clock.paused?tr("暂停"):tr("待播")}</small></th>
              {track.cells.map((cell,i)=>{
                const now=active&&position>=i*plan.blockMs&&position<Math.min(plan.durationMs,(i+1)*plan.blockMs);
                const isWait=cell.motif===null&&track.entryMs!==null&&i*plan.blockMs<track.entryMs;
                const name=isWait?tr("等待"):label(cell.motif);
                const same=selectedMotif!=null&&cell.motif===selectedMotif;
                return <td key={i}><button type="button" className="structure-cell" data-motif={cell.motif===null?'rest':cell.motif} data-match={same||undefined}
                  style={cell.motif!==null&&cell.motif>=6?{'--motif-bg':`hsl(${(cell.motif*137.508)%360} 32% 88%)`,'--motif-ink':`hsl(${(cell.motif*137.508)%360} 32% 30%)`} as React.CSSProperties:undefined}
                  aria-label={tr("{0} 第 {1} 段：{2}，{3} 音", track.id, i+1, name, cell.notes.length)} aria-pressed={picked?.pad===track.id&&picked.column===i}
                  aria-current={now?'step':undefined} onClick={()=>setPicked({pad:track.id,column:i})}>
                  <strong>{name}</strong>
                  {cell.notes.length?<PitchPreview notes={cell.notes} duration={plan.blockMs} {...extent}/>:<span className="structure-rest">—</span>}
                  <small>{cell.notes.length?tr("{0} 音", cell.notes.length):tr("无新音")}</small>
                  {now&&<span className="structure-playhead" data-paused={!clock.playing||undefined} style={{left:`${Math.min(99,(position-i*plan.blockMs)/plan.blockMs*100)}%`}}/>}
                </button></td>;
              })}
            </tr>;
          })}</tbody>
        </table>
      </div>
      <div className="structure-detail">
        {selection&&picked?<>
          <strong>{picked.pad} {tr("· 第")} {picked.column+1} {tr("段 ·")} {label(selection.motif)}</strong>
          <p>{occurrences.length?tr("相同结构（可移调）：{0}", occurrences.join(' / ')):tr("这一段没有新的音符起音；尾音可能仍在持续。")}</p>
          <div className="structure-notes" aria-label={tr("选中片段的起音明细")}>{selection.notes.map((note,i)=><span key={i}><b>{note.name}</b><small>+{seconds(note.atMs)}s</small></span>)}</div>
        </>:<>
          <strong>{tr("重复与进入")}</strong>
          {plan.tracks.map(t=>{
            const sounding=t.cells.filter(c=>c.motif!==null);
            const one=sounding.length&&sounding.every(c=>c.motif===sounding[0].motif);
            return <p key={t.id}><b>{t.id}</b> {t.entryMs===null?tr("此范围没有新音"):tr("{0}s 进入 · {1}{2}", seconds(t.entryMs), one?tr("{0} 出现 {1} 次", label(sounding[0].motif), sounding.length):t.cells.slice(0,8).map(c=>label(c.motif)).join(' → '), t.cells.length>8?'…':'')}</p>;
          })}
        </>}
      </div>
      <footer>{tr("按四轨从起点一起播放预计算；细线跟随各轨当前位置。比较音序，不比较音色与尾音。播放中编辑后，实际触发以该轨下一轮为准。")}</footer>
    </>}
  </section>;
}
