import React from 'react';
import type {LilyNode} from './core.ts';
import type {PlaybackVisualFrame} from './playbackVisual.ts';

/** Bounded SVG overlay; reuses the application's existing transport renders, with no timers or audio side effects. */
export function PlaybackVisualLayer({frame,nodes}:{frame?:PlaybackVisualFrame;nodes:readonly LilyNode[]}) {
  if(!frame)return null;
  const byId=new Map(nodes.filter(n=>!n.hidden&&!n.muted).map(n=>[n.id,n]));
  return <g className="quad-playback-visual" aria-hidden="true" pointerEvents="none">
    {frame.recent.flatMap((event,i)=>{
      const previous=frame.recent[i-1];
      if(!previous||previous.notes.length!==1||event.notes.length!==1)return [];
      const a=byId.get(previous.notes[0].nodeId),b=byId.get(event.notes[0].nodeId);if(!a||!b)return [];
      return <line key={`trail-${i}`} data-playback-edge="true" data-from-node-id={a.id} data-to-node-id={b.id} x1={a.x*100} y1={a.y*100} x2={b.x*100} y2={b.y*100} opacity={.25+i*.18}/>;
    })}
    {frame.recent.slice(0,-1).flatMap((event,i)=>event.notes.map(n=>{
      const node=byId.get(n.nodeId);if(!node)return null;
      return <g key={`past-${n.nodeId}`} data-visual-node-id={node.id} transform={`translate(${node.x*100} ${node.y*100})`}><rect className="quad-playback-past" x="-1.4" y="-1.4" width="2.8" height="2.8" opacity={.2+i*.18}/></g>;
    }))}
    {frame.focusIds.map(id=>{
      const node=byId.get(id);if(!node)return null;
      return <g key={`focus-${id}`} data-visual-node-id={id} data-playback-focus={id} transform={`translate(${node.x*100} ${node.y*100})`}><circle className="quad-playback-halo" r="4.6"/><circle className="quad-playback-ring" r="3.2"/></g>;
    })}
    {frame.echoes.map(({nodeId,sourcePad},i)=>{
      const node=byId.get(nodeId);if(!node)return null;
      const slot=sourcePad.charCodeAt(0)-65;
      return <g key={`${sourcePad}-${nodeId}-${i}`} data-visual-node-id={nodeId} data-playback-echo={sourcePad} transform={`translate(${node.x*100} ${node.y*100})`} style={{color:`var(--quad-pad-${sourcePad.toLowerCase()})`}}>
        <circle className="quad-playback-echo-ring" r={3.7+slot*.35}/>
        <text className="quad-playback-echo-label" x={(slot-1.5)*2.8} y="-5.3" textAnchor="middle">{sourcePad}</text>
      </g>;
    })}
  </g>;
}
