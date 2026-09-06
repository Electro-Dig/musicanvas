import React, { useEffect, useRef, useState } from 'react';
import { compileLilyCycle, getPadCycleDurationMs, type QuadLilyPad } from './core';
import { buildNodePresentations, formatMidiNote } from './nodePresentation';
import type { PhaseComparisonPad } from './PhaseComparison';

const wrap = (v: number) => ((v % 1) + 1) % 1;
type Dot = { phase: number; midi: number; track: string; time: number };
/** Samples transport crossings, never schedules sound or changes the transport. */
export default function RhythmOverlay({ a, b, sources }: { a: PhaseComparisonPad; b: PhaseComparisonPad; sources: QuadLilyPad[]; key?: string }) {
  const [memory, setMemory] = useState(1);
  const [windows, setWindows] = useState(6);
  const travel = useRef(a.phase);
  const [dots, setDots] = useState<Dot[]>([]);
  const previous = useRef({ a: a.phase, b: b.phase, playing: `${a.playing}-${b.playing}`, time: performance.now() });
  const clock = useRef(0);
  const referencePad = sources.find(p => p.id === a.id);
  const reference = referencePad ? getPadCycleDurationMs(referencePad) : 1500;
  const events = [a,b].flatMap(state => {
    const source = sources.find(p => p.id === state.id);
    if (!source) return [];
    const names = buildNodePresentations(source.nodes, source);
    return compileLilyCycle(source).nodes.filter(n => n.status === 'active' && !source.nodes.find(s => s.id === n.nodeId)?.muted).flatMap(n => {
      const midi = names.get(n.nodeId)?.midiNote;
      return midi == null ? [] : [{ track:state.id, phase:n.phase ?? 0, midi }];
    });
  });
  const signature = JSON.stringify(events);
  useEffect(() => { setDots([]); }, [signature, reference, windows]);
  useEffect(() => {
    const now = performance.now(), old = previous.current;
    const playing = `${a.playing}-${b.playing}`;
    const da = wrap(a.phase-old.a), db = wrap(b.phase-old.b);
    const dt = now-old.time;
    previous.current = { a:a.phase, b:b.phase, playing, time:now };
    // Skip discontinuities (restart, resume, background throttling), rather than inventing events.
    if (playing !== old.playing || dt > 400 || da > .5 || db > .5) { setDots([]); travel.current = a.phase; return; }
    if (!a.playing) return;
    const start = travel.current;
    travel.current += da;
    clock.current += dt;
    const fresh: Dot[] = [];
    for (const event of events) {
      const first = event.track === a.id, state = first ? a : b;
      const delta = first ? da : db, before = first ? old.a : old.b;
      const distance = wrap(event.phase-before);
      if (!state.playing || delta === 0 || distance === 0 || distance > delta) continue;
      const fraction = distance/delta;
      fresh.push({ ...event, phase:wrap((start + da*fraction)/windows), time:clock.current-dt*(1-fraction) });
    }
    setDots(oldDots => [...oldDots, ...fresh].filter(d => clock.current-d.time < reference*windows*Math.max(1,memory)).slice(-1024));
  }, [a.phase,b.phase,a.playing,b.playing,signature,reference,memory,windows]);
  const pitches = [...new Set(events.map(e => e.midi))].sort((x,y) => x-y);
  const low = pitches[0] ?? 60, high = pitches[pitches.length-1] ?? low;
  const radius = (midi:number) => high === low ? 106 : 86+(midi-low)*42/(high-low);
  const point = (d:Dot) => ({ x:150+radius(d.midi)*Math.sin(d.phase*Math.PI*2), y:150-radius(d.midi)*Math.cos(d.phase*Math.PI*2) });
  const opacity = (d:Dot) => Math.max(.05,1-(clock.current-d.time)/(reference*windows*Math.max(1,memory)));
  return <div className="rhythm-overlay">
    <div className="phase-comparison__selectors"><label>每圈窗口<select aria-label="每圈窗口" value={windows} onChange={e => setWindows(Number(e.target.value))}>{[4,5,6,8,12].map(n => <option key={n} value={n}>{n} 个</option>)}</select></label><label>保留轨迹<select aria-label="叠影轮数" value={memory} onChange={e => setMemory(Number(e.target.value))}>{[1,2,4,8].map(n => <option key={n} value={n}>{n} 圈</option>)}</select></label><button onClick={() => setDots([])}>清除痕迹</button></div>
    <svg viewBox="0 0 300 300" role="img" aria-label={`${a.id} 与 ${b.id} 的环形乐句窗口`}>
      {Array.from({length:windows},(_,i) => <g key={i}><line x1={150+78*Math.sin(i/windows*2*Math.PI)} y1={150-78*Math.cos(i/windows*2*Math.PI)} x2={150+134*Math.sin(i/windows*2*Math.PI)} y2={150-134*Math.cos(i/windows*2*Math.PI)} stroke="currentColor" opacity=".16"/><text x={150+69*Math.sin((i+.5)/windows*2*Math.PI)} y={153-69*Math.cos((i+.5)/windows*2*Math.PI)} textAnchor="middle" fontSize="9" fill="currentColor" opacity=".4">{i+1}</text></g>)}
      {pitches.map(m => <g key={m}><circle cx="150" cy="150" r={radius(m)} fill="none" stroke="currentColor" opacity=".09"/><text x="154" y={147-radius(m)} fontSize="8" fill="currentColor" opacity=".65">{formatMidiNote(m)}</text></g>)}
      {[a,b].map(state => {
        const trace = dots.filter(d => d.track === state.id).sort((x,y) => x.time-y.time);
        const last = trace[trace.length-1];
        return <g key={state.id} style={{color:`var(--quad-pad-${state.id.toLowerCase()})`}}>
          {trace.map((d,i) => { const p=point(d), prev=trace[i-1]; return <g key={i} opacity={opacity(d)}>
            {prev && d.time-prev.time > 1 && d.time-prev.time < reference && <line x1={point(prev).x} y1={point(prev).y} x2={p.x} y2={p.y} stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>}
            <circle cx={p.x} cy={p.y} r="1.2" fill="currentColor"><title>{state.id} · {formatMidiNote(d.midi)}</title></circle>
          </g>; })}
          {last && <g><circle cx={point(last).x} cy={point(last).y} r="9" fill="currentColor" opacity={state.playing ? .18 : .08}/><circle cx={point(last).x} cy={point(last).y} r="4" fill="currentColor"/><text x={point(last).x+7} y={point(last).y+12} fontSize="9" fill="currentColor">{formatMidiNote(last.midi)}</text></g>}
        </g>;
      })}
      <line x1="150" y1="150" x2={150+134*Math.sin(travel.current/windows*2*Math.PI)} y2={150-134*Math.cos(travel.current/windows*2*Math.PI)} stroke="currentColor" opacity=".16"/>
      {!dots.length && <text x="150" y="155" textAnchor="middle" fontSize="11" fill="currentColor">播放后逐音绘制</text>}
    </svg>
    <p>音越高越靠外，半径按半音距离排列。线随发音顺序逐段出现，亮点标记最近的音，旧线逐渐淡去。</p>
    <p>一圈包含 {windows} 个窗口，每个窗口等于 {a.id} 的一个乐句。两轨沿共同时间向前绘制，音乐相位不重置。适合单旋律对比；依据编排与播放进度绘制，并非录音分析。暂停参考轨、跳转或切换音符会中断轨迹。</p>
  </div>;
}
