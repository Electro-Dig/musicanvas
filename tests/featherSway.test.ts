import test from 'node:test';
import assert from 'node:assert/strict';
import { bindFeatherPoint, displaceFeatherPoint, sampleFeatherWind, subscribeFeatherPainter } from '../quad/featherSway.ts';

test('feather sway anchors the root, bends toward the tip and returns exactly to rest', () => {
  const root = { x: .5, y: .95 };
  const base = bindFeatherPoint(root, root, .08);
  const lower = bindFeatherPoint({ x: .5, y: .90 }, root, .08);
  const tip = bindFeatherPoint({ x: .5, y: .08 }, root, .08);
  let maxLower = 0, maxTip = 0;
  for (let time = 0; time < 48; time += .1) {
    const wind = sampleFeatherWind(time);
    assert.deepEqual(displaceFeatherPoint(base, wind), root);
    assert.deepEqual(displaceFeatherPoint(tip, wind, 0), { x: tip.x, y: tip.y });
    maxLower = Math.max(maxLower, Math.abs(displaceFeatherPoint(lower, wind).x - lower.x));
    maxTip = Math.max(maxTip, Math.abs(displaceFeatherPoint(tip, wind).x - tip.x));
    const next = displaceFeatherPoint(tip, sampleFeatherWind(time + 1 / 60));
    assert(Math.abs(next.x - displaceFeatherPoint(tip, wind).x) < .001);
  }
  assert(maxTip > .025 && maxTip < .045);
  assert(maxLower < maxTip / 20);
});

test('leaf deformation remains bounded and never mutates musical coordinates', () => {
  const root = { x: .5, y: .95 };
  const source = Object.freeze({ x: .85, y: .2 });
  const point = Object.freeze(bindFeatherPoint(source, root, .08));
  for (let t = 0; t < 48; t += .17) {
    const q = displaceFeatherPoint(point, sampleFeatherWind(t, .28));
    assert(Math.abs(q.x - source.x) < .045);
    assert(Math.abs(q.y - source.y) < .015);
  }
  assert.deepEqual(source, { x: .85, y: .2 });
});

test('all pads share one bounded frame clock and the last unsubscribe stops it', () => {
  const names = ['requestAnimationFrame', 'cancelAnimationFrame', 'document'] as const;
  const descriptors = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  let id = 0;
  const queued = new Map<number, (time: number) => void>();
  const listeners = new Set<() => void>();
  const document = { hidden: false, addEventListener: (_: string, fn: () => void) => listeners.add(fn), removeEventListener: (_: string, fn: () => void) => listeners.delete(fn) };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: (fn: (time: number) => void) => { queued.set(++id, fn); return id; } });
  Object.defineProperty(globalThis, 'cancelAnimationFrame', { configurable: true, value: (key: number) => queued.delete(key) });
  const calls = [0, 0, 0, 0];
  const removers = calls.map((_, i) => subscribeFeatherPainter(() => { calls[i]++; return true; }));
  try {
    assert.equal(queued.size, 1);
    const now = performance.now();
    const frame = (at: number) => { const [key, fn] = [...queued][0]; queued.delete(key); fn(at); };
    frame(now + 40);
    assert.deepEqual(calls, [1, 1, 1, 1]);
    frame(now + 41);
    assert.deepEqual(calls, [1, 1, 1, 1]);
    document.hidden = true;
    for (const listener of listeners) listener();
    assert.equal(queued.size, 0);
    document.hidden = false;
    for (const listener of listeners) listener();
    assert.equal(queued.size, 1);
    removers.forEach(remove => remove());
    assert.equal(queued.size, 0);
    assert.equal(listeners.size, 0);
  } finally {
    removers.forEach(remove => remove());
    names.forEach((name, i) => { if (descriptors[i]) Object.defineProperty(globalThis, name, descriptors[i]!); else delete (globalThis as any)[name]; });
  }
});
