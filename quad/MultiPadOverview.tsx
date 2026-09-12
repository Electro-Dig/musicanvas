import { useUiText } from './uiLocale';
import React, { useMemo } from 'react';
import { compileLilyCycle, getPadCycleDurationMs, type QuadLilyPad } from './core';
import type { PhaseComparisonPad } from './PhaseComparison';
import './phaseComparison.css';

/** Shared seconds axis, each row shows one local phrase from its own start. */
export default function MultiPadOverview({pads, progress}: {pads: QuadLilyPad[]; progress: PhaseComparisonPad[]}) {
  const tr = useUiText();
  const cycles=useMemo(()=>pads.map(p=>compileLilyCycle(p)),[pads]);
  const span=Math.max(1,...pads.map(getPadCycleDurationMs));
  return <section className="phase-comparison" aria-label={tr("四轨周期总览")}>
    <p>{tr("共同时间刻度 · 每行从自己的乐句起点计时")}</p>
    <div className="multi-pad-axis"><span>{tr("0 秒")}</span><span>{(span/2000).toFixed(2)}</span><span>{(span/1000).toFixed(2)} {tr("秒")}</span></div>
    {pads.map((p,i)=>{const state=progress.find(s=>s.id===p.id);const duration=getPadCycleDurationMs(p);return <div className="multi-pad-row" key={p.id} style={{'--track-color':`var(--quad-pad-${p.id.toLowerCase()})`} as React.CSSProperties}>
      <header><strong>{p.id}</strong><span>{state?.bpm} BPM · {Math.round(duration / (p.intervalMs / 4))} {tr("步")}</span><small>{p.playing?tr("播放中"):tr("已暂停")}</small></header>
      <svg viewBox="0 0 280 80" role="img" aria-label={tr("Pad {0} 乐句事件与播放位置", p.id)}>
        <rect x="8" y="16" width={264*duration/span} height="48" rx="5" fill="var(--track-color)" opacity=".08" />
        <line x1="8" y1="40" x2="272" y2="40" stroke="currentColor" opacity=".15"/>
        {cycles[i].nodes.filter(n=>n.status==='active').map(n=><g key={n.nodeId}><circle cx={8+264*(n.offsetMs??0)/span} cy="40" r="3.5" fill="var(--track-color)"/><title>{n.nodeId} · {((n.offsetMs??0)/1000).toFixed(3)} {tr("秒")}</title></g>)}
        <line x1={8+264*(state?.phase??0)*duration/span} x2={8+264*(state?.phase??0)*duration/span} y1="12" y2="68" stroke="var(--track-color)" strokeWidth="2" />
      </svg>
    </div>})}
    <p>{tr("圆点表示本轮可到达的事件时点，竖线表示当前进度。暂停时保留位置；详细传播关系见“当前轨”。")}</p>
  </section>;
}
