import { compileLilyCycle, getPadCycleDurationMs, type QuadLilyPad } from './core';
import { buildNodePresentations } from './nodePresentation';

export function phaseReturnMs(a: QuadLilyPad, b: QuadLilyPad): number {
  const x=getPadCycleDurationMs(a), y=getPadCycleDurationMs(b);
  return x===y ? x : 1/Math.abs(1/x-1/y);
}
export function buildPhaseScroll(a: QuadLilyPad,b: QuadLilyPad,duration:number):string {
  if(!Number.isFinite(duration)||duration<=0||duration>600000) throw Error('请选择十分钟以内的导出时长');
  const tracks=[a,b].map(p=>{
    const names=buildNodePresentations(p.nodes,p);
    const events=compileLilyCycle(p).nodes.filter(n=>n.status==='active'&&!p.nodes.find(v=>v.id===n.nodeId)?.muted);
    const result:{t:number;m:number}[]=[];
    for(let start=0;start<=duration;start+=getPadCycleDurationMs(p))for(const e of events){const m=names.get(e.nodeId)?.midiNote,t=start+(e.offsetMs??0);if(m!=null&&t<=duration)result.push({t,m});if(result.length>50000)throw Error('音符过多，请缩短导出时长');}
    return result.sort((x,y)=>x.t-y.t);
  });
  const notes=tracks.flat().map(v=>v.m),lo=notes.length?Math.min(...notes):60,hi=notes.length?Math.max(...notes):72;
  const width=Math.max(1200,duration*.1+160),x=(t:number)=>80+t*(width-160)/duration,y=(m:number)=>310-(m-lo)*190/Math.max(1,hi-lo);
  const paths=tracks.map((track,i)=>`<path d="${track.map((v,j)=>`${j?'L':'M'}${x(v.t).toFixed(2)},${y(v.m).toFixed(2)}`).join(' ')}" fill="none" stroke="${i?'#329d7d':'#c95f80'}" stroke-width="1.5" opacity=".8"/>`).join('');
  const ticks=Array.from({length:13},(_,i)=>`<line x1="${x(duration*i/12)}" x2="${x(duration*i/12)}" y1="95" y2="330" stroke="#d6dfd9"/><text x="${x(duration*i/12)}" y="355" font-size="11">${(duration*i/12000).toFixed(2)}s</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="420" viewBox="0 0 ${width} 420"><rect width="100%" height="100%" fill="#f4f7f3"/><g font-family="sans-serif" fill="#293e34"><text x="30" y="35" font-size="24">旋律长卷 · ${a.id} × ${b.id}</text><text x="30" y="62" font-size="12">共同起点 · ${(duration/1000).toFixed(2)} 秒 · 粉色 ${a.id} / 绿色 ${b.id} · 纵轴音高，横轴时间</text>${ticks}${paths}<text x="30" y="395" font-size="12">根据当前静态编排生成，非录音实测；连线表示音符顺序，不表示滑音。移动节点与延续事件不包含在此导出中。</text></g></svg>`;
}
