import { useUiText } from './uiLocale';
import React, { useState } from 'react';
import type { QuadLilyPad, QuadPadId } from './core';
import './phaseComparison.css';
import RhythmOverlay from './RhythmOverlay';
import { buildPhaseScroll, phaseReturnMs } from './phaseScrollExport';


export interface PhaseComparisonPad {
  id: QuadPadId;
  phase: number;
  steps: number;
  bpm: number;
  playing: boolean;

}

/** Read-only view: all timing belongs to the host transport. */
export default function PhaseComparison({ pads, sources = [] }: { pads: PhaseComparisonPad[]; sources?: QuadLilyPad[] }) {
  const tr = useUiText();
  const [exportLength, setExportLength] = useState('phase');
  const [exportStatus, setExportStatus] = useState('');
  const [view, setView] = useState<'rings' | 'overlay'>('rings');
  const [selected, setSelected] = useState<QuadPadId[]>(['A', 'B']);
  const first = selected[0], second = selected[1];

  const a = pads.find(p => p.id === first);
  const b = pads.find(p => p.id === second);
  const toggle = (id: QuadPadId) => setSelected(old => old.includes(id) ? old.filter(x => x !== id) : old.length < 2 ? [...old,id] : old);
  const toolbar = <div className="phase-toolbar"><div className="phase-pad-segment" role="group" aria-label={tr("选择对比画布，最多两个")}>{pads.map(p => <button key={p.id} aria-label={tr("对比画布{0}", p.id)} aria-pressed={selected.includes(p.id)} disabled={!selected.includes(p.id) && selected.length === 2} onClick={()=>toggle(p.id)}>{p.id}</button>)}</div><div className="quad-map-view-switch"><button aria-pressed={view === 'rings'} onClick={()=>setView('rings')}>{tr("双环位置")}</button><button aria-pressed={view === 'overlay'} onClick={()=>setView('overlay')}>{tr("节奏叠影")}</button></div></div>;
  if (!a || !b) return <section className="phase-comparison" aria-label={tr("相位对比")}>{toolbar}<p>{tr("点亮两张画布开始对比；再次点击可取消。")}</p></section>;
  const phase = (n: number) => ((n % 1) + 1) % 1;
  const point = (p: number, r: number) => ({ x: 150 + r * Math.sin(phase(p) * Math.PI * 2), y: 150 - r * Math.cos(phase(p) * Math.PI * 2) });
  const pa = point(a.phase, 86), pb = point(b.phase, 114);
  const gap = phase(a.phase - b.phase);
  const sameSteps = a.steps === b.steps;
  const sourceA = sources.find(p => p.id === first), sourceB = sources.find(p => p.id === second);
  const fullDuration = sourceA && sourceB ? phaseReturnMs(sourceA,sourceB) : 0;
  const exportScroll = () => {
    if (!sourceA || !sourceB) return;
    try {
      const svg = buildPhaseScroll(sourceA,sourceB,exportLength === 'phase' ? fullDuration : Number(exportLength)*1000);
      const url = URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));
      const link = document.createElement('a'); link.href=url; link.download=`melody-scroll-${first}-${second}.svg`; link.click();
      setTimeout(()=>URL.revokeObjectURL(url),60000); setExportStatus(tr("已生成 SVG 长卷并发起下载"));
    } catch(error) { setExportStatus(error instanceof Error ? error.message : tr("导出失败")); }
  };
  const color = (id: QuadPadId) => `var(--quad-pad-${id.toLowerCase()})`;
  return <section className="phase-comparison" aria-label={tr("相位对比")}>
    {toolbar}
    <div className="phase-export"><label><span>{tr("长卷")}</span><select aria-label={tr("长卷时长")} value={exportLength} onChange={e=>setExportLength(e.target.value)}><option value="phase">{tr("相位一周 ·")}{(fullDuration/1000).toFixed(1)} {tr("秒")}</option><option value="30">{tr("30 秒")}</option><option value="60">{tr("60 秒")}</option><option value="180">{tr("180 秒")}</option></select></label><button onClick={exportScroll} disabled={!sourceA || !sourceB}>{tr("导出 SVG")}</button></div>

    <div role="status" className="phase-export-note">{exportStatus}</div>
    {view === 'overlay' ? <RhythmOverlay key={`${first}-${second}`} a={a} b={b} sources={sources} /> : <svg viewBox="0 0 300 300" role="img" aria-label={tr("{0} 与 {1} 的乐句相位对比", first, second)}>
      {[a,b].map((p,j) => <g key={p.id} style={{color:color(p.id)}}>
        <circle cx="150" cy="150" r={j ? 114 : 86} fill="none" stroke="currentColor" opacity=".28" />
        {Array.from({length:p.steps},(_,i) => {const q=point(i/p.steps,j?114:86);return <circle key={i} cx={q.x} cy={q.y} r={i?1.6:3.5} fill="currentColor" opacity=".65" />;})}
      </g>)}
      <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke="currentColor" opacity=".25" strokeDasharray="3 4" />
      {[pa,pb].map((p,i) => <g key={i} style={{color:color(i?second:first)}}><circle cx={p.x} cy={p.y} r="13" fill="currentColor" opacity=".13"/><circle cx={p.x} cy={p.y} r="6" fill="currentColor"/></g>)}
      <text x="150" y="145" textAnchor="middle" className="phase-comparison__value">{(sameSteps ? gap*a.steps : gap).toFixed(2)}</text>
      <text x="150" y="168" textAnchor="middle" className="phase-comparison__caption">{sameSteps ? tr("步 · 环内相差") : tr("圈 · 相位差")}</text>
    </svg>}
    <div className="phase-comparison__legend">{[a,b].map(p=><div key={p.id}><strong style={{color:color(p.id)}}>{p.id}</strong><span>{p.bpm} BPM · {p.steps} {tr("步")}</span><small>{p.playing?tr("播放中"):tr("已暂停")}</small></div>)}</div>
    {view === 'rings' && <p>{tr("顶端为乐句起点，顺时针前进。数值为内环相对外环的环内差值，不累计领先圈数。")}</p>}
    {!sameSteps && <p>{tr("乐句长度不同：比较循环进度，不代表音符拍点重合。")}</p>}
  </section>;
}
