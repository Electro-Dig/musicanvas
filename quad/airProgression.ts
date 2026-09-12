import { createQuadLilyWorkspace, type QuadLilyPad } from './core.ts';
import { materializePadMotion } from './motionRuntime.ts';

export function createAirBass(): QuadLilyPad {
  const pad=createQuadLilyWorkspace().pads.D;
  const roots=[33,29,36,35,38,36,29,28];
  const hits=new Map<number,number>();
  roots.forEach((root,i)=>{hits.set(i*8,root);if(i%2===1)hits.set(i*8+6,root+12);});
  return {...pad,intervalMs:1000,phraseSteps:64,phraseMode:'fixed',scaleKey:'chromatic',
    rootMidi:60,octaveTranspose:0,velocity:.36,soundPresetId:'soft-pluck-bass',playing:false,
    nodes:Array.from({length:64},(_,i)=>({id:i===0?'center':`bass-${i}`,isCenter:i===0,
      x:.2+(Math.floor(i/8)%2===0?i%8:7-i%8)*.085,y:.15+Math.floor(i/8)*.1,
      range:i%8===7&&i<63?.105:.09,scaleStep:(hits.get(i)??roots[Math.floor(i/8)])-60,muted:!hits.has(i)}))};
}

export function createAirRhythm(): QuadLilyPad {
  const pad=createQuadLilyWorkspace().pads.B;
  const hits=new Map([[0,76],[3,83],[4,76],[6,88],[8,76],[10,83],[11,88],[14,83]]);
  return {...pad,intervalMs:500,phraseSteps:16,phraseMode:'fixed',scaleKey:'chromatic',
    rootMidi:60,octaveTranspose:0,velocity:.24,soundPresetId:'marimba',playing:false,
    nodes:Array.from({length:16},(_,i)=>({id:i===0?'center':`pulse-${i}`,isCenter:i===0,
      x:.2+(i<8?i:15-i)*.085,y:i<8?.36:.55,range:i===7?.2:.09,
      scaleStep:(hits.get(i)??76)-60,muted:!hits.has(i)}))};
}

/** Two connected phrases: open minor colours, then a dominant return. */
export function createAirEightProgression(): QuadLilyPad {
  const pad = createAirProgression();
  const pitches = [[45,52,59,60],[41,52,57,60],[48,52,55,59],[47,50,55,57],
    [50,53,57,64],[48,52,55,57],[41,52,57,60],[40,50,56,59]];
  const centers = pitches.map((_,i)=>({x:.17+(i<4?i:7-i)*.22,y:i<4?.25:.65}));
  const nodes = pitches.flatMap((notes,group)=>notes.map((midi,member)=>({
    id:group===0&&member===0?'center':`chord-${group}-${member}`,
    ...centers[group],range:group===3?.28:.18,scaleStep:midi-60,isCenter:group===0&&member===0,
  })));
  return materializePadMotion({...pad,nodes,phraseSteps:64,
    formations:pitches.map((_,group)=>({id:`G${group+1}`,shape:'chord',holdSteps:8,
      nodeIds:nodes.slice(group*4,group*4+4).map(n=>n.id),centerX:centers[group].x,
      centerY:centers[group].y,radius:.05,rateCycles:4}))},0);
}

/** Eight-second, four-chord study for the Air Pad sound. */
export function createAirProgression(): QuadLilyPad {
  const pad = createQuadLilyWorkspace().pads.A;
  const pitches = [[45, 52, 59, 60], [41, 52, 57, 60], [48, 52, 55, 59], [40, 50, 55, 59]];
  const nodes = pitches.flatMap((notes, group) => notes.map((midi, member) => {
    const angle = member * Math.PI / 2;
    return { id: group === 0 && member === 0 ? 'center' : `chord-${group}-${member}`,
      x: .17 + group * .22 + .05 * Math.cos(angle), y: .5 + .05 * Math.sin(angle),
      range: .18, scaleStep: midi - 60, isCenter: group === 0 && member === 0 };
  }));
  return { ...pad, nodes, intervalMs: 1000, phraseSteps: 32, phraseMode: 'fixed',
    scaleKey: 'chromatic', rootMidi: 60, octaveTranspose: 0, velocity: .4, playing: false, soundPresetId:'air-pad',
    formations: pitches.map((_, group) => ({ id: `G${group + 1}`, shape: 'chord',
      nodeIds: nodes.slice(group * 4, group * 4 + 4).map(n => n.id),
      centerX: .17 + group * .22, centerY: .5, radius: .05, rateCycles: 4, holdSteps: 8 })) };
}
