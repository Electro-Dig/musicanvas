import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';

test('stopping ordinary long voices is track-local, cancels queued notes and cleans on the audio clock', async t => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  t.after(() => server.close());
  const { QuadSynthEngine } = await server.ssrLoadModule('/quad/synth/quadSynthEngine.ts');
  const oscillators: any[] = [];
  const gains: any[] = [];
  const param = () => ({ value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {},
    linearRampToValueAtTime() {}, cancelAndHoldAtTime() {} });
  const node = () => ({ disconnected: false, connect() {}, disconnect() { this.disconnected = true; } });
  class Context {
    currentTime = 10;
    state = 'running';
    destination = node();
    audioWorklet = { addModule: async () => {} };
    createGain() { const n = { ...node(), gain: param() }; gains.push(n); return n; }
    createDynamicsCompressor() { return { ...node(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }; }
    createBiquadFilter() { return { ...node(), frequency: param(), Q: param() }; }
    createOscillator() { const n = { ...node(), frequency: param(), detune: param(), onended: null as any,
      startAt: 0, stopAt: 0, start(at: number) { this.startAt = at; }, stop(at: number) { this.stopAt = at; } };
      oscillators.push(n); return n;
    }
  }
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { AudioContext: Context } });
  t.after(() => { if (prior) Object.defineProperty(globalThis, 'window', prior); else Reflect.deleteProperty(globalThis, 'window'); });
  const engine = new QuadSynthEngine();
  engine.playNote(60, 90, 96, 'air-pad', 10, 'A');
  const a = [...oscillators];
  engine.playNote(64, 90, 96, 'air-pad', 10, 'B');
  const b = oscillators.slice(a.length);
  engine.playNote(67, 90, 96, 'air-pad', 12, 'A');
  const queued = oscillators.slice(a.length + b.length);
  assert(a.length > 0 && b.length > 0 && queued.length > 0);
  assert(a.every(o => o.stopAt > 106));
  engine.stopTrack('A');
  assert([...a, ...queued].every(o => o.stopAt === 10.015));
  assert(b.every(o => o.stopAt > 106));
  for (const o of [...a, ...queued]) o.onended();
  assert([...a, ...queued].every(o => o.disconnected));
  assert(b.every(o => !o.disconnected));
  engine.stopTrack('A'); // repeat stop must leave B intact
  engine.setMuted(true);
  assert(b.every(o => o.stopAt === 10.015));
  for (const o of b) o.onended();
  assert(b.every(o => o.disconnected));
  assert(gains.slice(1).every(g => g.disconnected)); // master remains connected
});
