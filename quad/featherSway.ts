export type FeatherXY = { x: number; y: number };
export type FeatherWind = ReturnType<typeof sampleFeatherWind>;

export function sampleFeatherWind(seconds: number, phase = 0) {
  const a = seconds * Math.PI * 2 / 8.4 + phase;
  const b = seconds * Math.PI * 2 / 13.2 + phase * .7;
  const c = seconds * Math.PI * 2 / 4.7 + phase;
  return { a: Math.sin(a), ac: Math.cos(a), b: Math.sin(b), bc: Math.cos(b), c: Math.sin(c), cc: Math.cos(c) };
}

/** Precompute spatial weights once; a frame needs only six trigonometric calls. */
export function bindFeatherPoint(point: FeatherXY, root: FeatherXY, tipY: number) {
  const h = Math.max(0, Math.min(1, (root.y - point.y) / Math.max(.1, root.y - tipY)));
  const side = point.x - root.x;
  const flutter = h * 2 + Math.sign(side) * .9;
  return { ...point, bend: h * h, leaf: Math.abs(side) * h, roll: side * h,
    lagC: Math.cos(h * .9), lagS: Math.sin(h * .9),
    gustC: Math.cos(h * .4), gustS: Math.sin(h * .4),
    flutterC: Math.cos(flutter), flutterS: Math.sin(flutter) };
}

export function displaceFeatherPoint(p: ReturnType<typeof bindFeatherPoint>, wind: FeatherWind, strength = 1): FeatherXY {
  const bend = wind.a * p.lagC - wind.ac * p.lagS;
  const gust = wind.b * p.gustC - wind.bc * p.gustS;
  const flutter = wind.c * p.flutterC - wind.cc * p.flutterS;
  return {
    x: p.x + strength * (p.bend * (.03 * bend + .008 * gust) + .009 * p.leaf * flutter),
    y: p.y + strength * (-.028 * p.roll * bend + .005 * p.leaf * flutter),
  };
}

// One bounded display clock for all four pads, independent of audio and React state.
type Painter = (dt: number) => boolean;
const painters = new Set<Painter>();
let frame = 0;
let previous = 0;
const FRAME_MS = 1000 / 30;
function tick(now: number) {
  frame = 0;
  const elapsed = now - previous;
  if (elapsed >= FRAME_MS) {
    previous = now - elapsed % FRAME_MS;
    for (const paint of painters) if (!paint(Math.min(elapsed, 80) / 1000)) painters.delete(paint);
  }
  if (painters.size && !document.hidden) frame = requestAnimationFrame(tick);
  else if (!painters.size) document.removeEventListener('visibilitychange', visibilityChanged);
}
function visibilityChanged() {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  previous = performance.now();
  if (!document.hidden && painters.size) frame = requestAnimationFrame(tick);
}
export function subscribeFeatherPainter(paint: Painter) {
  if (!painters.size) {
    previous = performance.now();
    document.addEventListener('visibilitychange', visibilityChanged);
  }
  painters.add(paint);
  if (!frame && !document.hidden) frame = requestAnimationFrame(tick);
  return () => {
    painters.delete(paint);
    if (!painters.size) {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      document.removeEventListener('visibilitychange', visibilityChanged);
    }
  };
}
