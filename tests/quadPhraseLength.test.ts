import assert from 'node:assert/strict';
import test from 'node:test';
import { compileLilyCycle, createQuadLilyWorkspace, getPadCycleDurationMs, parseQuadLilyWorkspace, updateLilyPad } from '../quad/core.ts';
import { QuadCycleRunner, type QuadCycleClock } from '../quad/cycleRunner.ts';

class Clock implements QuadCycleClock {
  now = 0;
  next = 0;
  tasks = new Map<number, { at: number; run: () => void }>();
  nowMs() { return this.now; }
  setTimeout(run: () => void, delay: number) { const id = ++this.next; this.tasks.set(id, { at: this.now + delay, run }); return id; }
  clearTimeout(id: unknown) { this.tasks.delete(Number(id)); }
  advance(ms: number) {
    const end = this.now + ms;
    for (;;) {
      const next = [...this.tasks.entries()].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      this.tasks.delete(next[0]); this.now = next[1].at; next[1].run();
    }
    this.now = end;
  }
}
function chain(phraseSteps = 12) {
  const pad = createQuadLilyWorkspace().pads.A;
  return { ...pad, phraseMode: 'fixed' as const, intervalMs: 800, phraseSteps, nodes: Array.from({ length: 12 }, (_, i) => ({
    id: `n${i}`, x: i * 0.1, y: 0.5, range: 0.101, scaleStep: i, isCenter: i === 0,
  })) };
}

test('automatic phrase adopts a changed chain only at the next boundary', () => {
  const clock = new Clock();
  const starts: number[] = [];
  const pad = { ...chain(), phraseMode: 'auto' as const };
  const runner = new QuadCycleRunner({ clock, onEvent: () => {}, onCycleStart: () => starts.push(clock.now) });
  runner.startPad(pad);
  clock.advance(100);
  runner.updatePad({ ...pad, nodes: pad.nodes.slice(0, 2) });
  clock.advance(2299);
  assert.deepEqual(starts, [0]);
  clock.advance(401);
  assert.deepEqual(starts, [0, 2400, 2800]);
  runner.stopAll();
});

test('twelve sequential notes fit one phrase and restart without overlapping roots', () => {
  const clock = new Clock();
  const fired: Array<{ node: string; cycle: number; at: number }> = [];
  const pad = chain();
  const compiled = compileLilyCycle(pad);
  assert.equal(compiled.intervalMs, 2400);
  assert.equal(compiled.propagationStepMs, 200);
  assert.equal(compiled.nodes.filter(node => node.status === 'active').length, 12);
  assert.equal(compiled.nodes.at(-1)?.phase, 11 / 12);
  const runner = new QuadCycleRunner({ clock, onEvent: (_, event, cycle) => fired.push({ node: event.nodeId, cycle, at: clock.now }) });
  runner.startPad(pad);
  clock.advance(2399);
  assert.deepEqual(fired, Array.from({ length: 12 }, (_, i) => ({ node: `n${i}`, cycle: 0, at: i * 200 })));
  clock.advance(1);
  assert.deepEqual(fired.at(-1), { node: 'n0', cycle: 1, at: 2400 });
  runner.stopAll();
});

test('four-step default retains original cutoff and twelve-step pause uses whole phrase', () => {
  assert.equal(compileLilyCycle(chain(4)).nodes.filter(node => node.status === 'active').length, 4);
  const clock = new Clock();
  const runner = new QuadCycleRunner({ clock, onEvent: () => {} });
  const pad = chain();
  runner.startPad(pad); clock.advance(1200);
  const cursor = runner.pausePad('A');
  assert.equal(cursor?.intervalMs, 2400);
  assert.equal(cursor?.phase, 0.5);
  clock.advance(1000);
  assert.deepEqual(runner.resumePad(pad), cursor);
  runner.stopAll();
});

test('phrase length survives persistence, validates bounds, and migrates old pads', () => {
  let workspace = updateLilyPad(createQuadLilyWorkspace(), 'A', { phraseSteps: 12 });
  assert.equal(parseQuadLilyWorkspace(JSON.stringify(workspace)).pads.A.phraseSteps, 12);
  const old = JSON.parse(JSON.stringify(workspace)); delete old.pads.A.phraseSteps;
  assert.equal(parseQuadLilyWorkspace(old).pads.A.phraseSteps, 4);
  assert.equal(getPadCycleDurationMs({ intervalMs: 600 }), 600);
  workspace = updateLilyPad(workspace, 'A', { phraseSteps: 1000 });
  assert.equal(workspace.pads.A.phraseSteps, 256);
  workspace = updateLilyPad(workspace, 'A', { phraseSteps: 1 });
  assert.equal(workspace.pads.A.phraseSteps, 4);
  old.pads.A.phraseSteps = '12';
  assert.equal(parseQuadLilyWorkspace(old).pads.A.phraseSteps, 4);
});
