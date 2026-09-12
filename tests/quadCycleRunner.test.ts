import assert from 'node:assert/strict';
import test from 'node:test';

import { addLilyNode, createQuadLilyWorkspace as createDefaultWorkspace, updateLilyPad } from '../quad/core.ts';
import { QuadCycleRunner, type QuadCycleClock } from '../quad/cycleRunner.ts';

// These regression cases exercise the original fixed-duration transport.
function createQuadLilyWorkspace() {
  const workspace = createDefaultWorkspace();
  for (const pad of Object.values(workspace.pads)) pad.phraseMode = 'fixed';
  return workspace;
}

class FakeClock implements QuadCycleClock {
  now = 0;
  private nextId = 1;
  private tasks = new Map<number, { due: number; run: () => void }>();

  setTimeout(run: () => void, delayMs: number): number {
    const id = this.nextId++;
    this.tasks.set(id, { due: this.now + Math.max(0, delayMs), run });
    return id;
  }

  clearTimeout(id: unknown): void {
    this.tasks.delete(Number(id));
  }

  nowMs(): number {
    return this.now;
  }

  stall(delayMs: number): void {
    this.now += delayMs;
    for (const [id, task] of [...this.tasks]) {
      if (task.due <= this.now && this.tasks.delete(id)) task.run();
    }
  }

  advance(delayMs: number): void {
    const target = this.now + delayMs;
    while (true) {
      const next = [...this.tasks.entries()]
        .filter(([, task]) => task.due <= target)
        .sort((left, right) => left[1].due - right[1].due || left[0] - right[0])[0];
      if (!next) break;
      this.tasks.delete(next[0]);
      this.now = next[1].due;
      next[1].run();
    }
    this.now = target;
  }
}

test('readPosition follows the transport without rescheduling, and freezes on pause',()=>{
  const clock=new FakeClock();
  const fired:string[]=[];
  const runner=new QuadCycleRunner({clock,onEvent:(_,e)=>fired.push(e.nodeId)});
  const pad=createQuadLilyWorkspace().pads.A;pad.intervalMs=500;pad.phraseSteps=8;
  assert.equal(runner.readPosition('A'),null);
  runner.startPad(pad);clock.advance(325);
  const before=[...fired];
  for(let i=0;i<50;i++)assert.equal(runner.readPosition('A')?.phase,.325);
  assert.deepEqual(fired,before);
  const edited={...pad,rootMidi:pad.rootMidi+1};runner.updatePad(edited);
  assert.equal(runner.readPosition('A')?.sourcePad,pad,'the playing score remains the cycle-start composition');
  runner.pausePad('A');clock.advance(2500);
  assert.equal(runner.readPosition('A')?.phase,.325);assert.equal(runner.readPosition('A')?.paused,true);
  runner.resumePad(edited);clock.advance(675);
  assert.equal(runner.readPosition('A')?.cycle,1);assert.equal(runner.readPosition('A')?.sourcePad,edited);
  runner.stopPad('A');assert.equal(runner.readPosition('A'),null);
});

test('late boundaries retain the original grid and skip fully missed phrases', () => {
  const clock = new FakeClock();
  const starts: Array<[number, number]> = [];
  const pad = createQuadLilyWorkspace().pads.A;
  pad.intervalMs = 500; pad.phraseSteps = 8; pad.loop = true;
  const runner = new QuadCycleRunner({clock, onEvent:()=>{}, onCycleStart:(_id,cycle,_pad,at)=>starts.push([cycle,at])});
  runner.startPad(pad);
  clock.advance(900); clock.stall(250);
  assert.deepEqual(starts, [[0,0],[1,1000]]);
  clock.advance(850);
  assert.deepEqual(starts.at(-1), [2,2000]);
  clock.stall(3500);
  assert.deepEqual(starts.at(-1), [5,5000]);
  clock.advance(500);
  assert.deepEqual(starts.at(-1), [6,6000]);
});

test('pauses inside a cycle and resumes only the pending events from the frozen cursor', () => {
  const clock = new FakeClock();
  const events: Array<{ nodeId: string; cycle: number; at: number }> = [];
  const cycleStarts: Array<{ cycle: number; at: number }> = [];
  const runner = new QuadCycleRunner({
    clock,
    onCycleStart: (_padId, cycle) => cycleStarts.push({ cycle, at: clock.now }),
    onEvent: (_padId, event, cycle) => events.push({ nodeId: event.nodeId, cycle, at: clock.now }),
  });
  let workspace = updateLilyPad(createQuadLilyWorkspace(), 'A', {
    intervalMs: 800,
    loop: true,
  });
  workspace = addLilyNode(workspace, 'A', {
    id: 'later', x: 0.6, y: 0.5, range: 0.2, scaleStep: 2,
  });

  runner.startPad(workspace.pads.A);
  clock.advance(100);
  const pausePad = (runner as unknown as {
    pausePad?: (padId: 'A') => unknown;
  }).pausePad;
  assert.equal(typeof pausePad, 'function', 'runner 需要真正的 pausePad，而不是把暂停当停止');
  const cursor = pausePad!.call(runner, 'A');

  assert.deepEqual(cursor, {
    padId: 'A', cycle: 0, elapsedMs: 100, intervalMs: 800, phase: 0.125,
  });
  assert.equal((runner as unknown as { isPaused?: (padId: 'A') => boolean }).isPaused?.('A'), true);
  clock.advance(1000);
  assert.deepEqual(events, [{ nodeId: 'center', cycle: 0, at: 0 }]);

  const resumePad = (runner as unknown as {
    resumePad?: (pad: typeof workspace.pads.A) => unknown;
  }).resumePad;
  assert.equal(typeof resumePad, 'function');
  assert.deepEqual(resumePad!.call(runner, workspace.pads.A), cursor);
  clock.advance(100);
  assert.deepEqual(events.at(-1), { nodeId: 'later', cycle: 0, at: 1200 });
  clock.advance(600);
  assert.deepEqual(cycleStarts, [
    { cycle: 0, at: 0 },
    { cycle: 1, at: 1800 },
  ], 'resume 不能重新编译或重播当前 cycle 的开头');
});

test('runs every Pad on its native cycle and stopping one Pad cancels only that clock', () => {
  const clock = new FakeClock();
  const events: Array<{ padId: string; nodeId: string; cycle: number; at: number }> = [];
  const stopped: string[] = [];
  const runner = new QuadCycleRunner({
    clock,
    onEvent: (padId, event, cycle) => events.push({
      padId,
      nodeId: event.nodeId,
      cycle,
      at: clock.now,
    }),
    onPadStop: padId => stopped.push(padId),
  });
  let workspace = createQuadLilyWorkspace();
  workspace = updateLilyPad(workspace, 'A', { intervalMs: 800, loop: true });
  workspace = addLilyNode(workspace, 'A', {
    id: 'near', x: 0.6, y: 0.5, range: 0.3, scaleStep: 1,
  });

  runner.startPad(workspace.pads.A);
  clock.advance(0);
  clock.advance(200);
  assert.deepEqual(events, [
    { padId: 'A', nodeId: 'center', cycle: 0, at: 0 },
    { padId: 'A', nodeId: 'near', cycle: 0, at: 200 },
  ]);

  clock.advance(600);
  assert.deepEqual(events.at(-1), { padId: 'A', nodeId: 'center', cycle: 1, at: 800 });

  runner.stopPad('A');
  clock.advance(1600);
  assert.equal(events.filter(event => event.cycle > 1).length, 0);
  assert.deepEqual(stopped, ['A']);
});

test('live geometry changes enter on the next cycle without disturbing the current one', () => {
  const clock = new FakeClock();
  const events: Array<{ nodeId: string; cycle: number; at: number }> = [];
  const runner = new QuadCycleRunner({
    clock,
    onEvent: (_padId, event, cycle) => events.push({ nodeId: event.nodeId, cycle, at: clock.now }),
  });
  const original = updateLilyPad(createQuadLilyWorkspace(), 'B', {
    intervalMs: 400,
    loop: true,
  });

  runner.startPad(original.pads.B);
  clock.advance(0);
  const changed = addLilyNode(original, 'B', {
    id: 'late-edit', x: 0.6, y: 0.5, range: 0.2, scaleStep: 2,
  });
  runner.updatePad(changed.pads.B);
  clock.advance(400);

  assert.deepEqual(events, [
    { nodeId: 'center', cycle: 0, at: 0 },
    { nodeId: 'center', cycle: 1, at: 400 },
  ]);
  clock.advance(100);
  assert.deepEqual(events.at(-1), { nodeId: 'late-edit', cycle: 1, at: 500 });
});

test('an in-flight cycle keeps the musical Pad snapshot captured at its boundary', () => {
  const clock = new FakeClock();
  const roots: Array<{ cycle: number; nodeId: string; rootMidi: number }> = [];
  const runner = new QuadCycleRunner({
    clock,
    onEvent: (_padId, event, cycle, snapshot) => roots.push({
      cycle,
      nodeId: event.nodeId,
      rootMidi: snapshot.rootMidi,
    }),
  });
  let workspace = updateLilyPad(createQuadLilyWorkspace(), 'C', { intervalMs: 400 });
  workspace = addLilyNode(workspace, 'C', {
    id: 'delayed', x: 0.6, y: 0.5, range: 0.2, scaleStep: 1,
  });
  runner.startPad(workspace.pads.C);
  clock.advance(0);

  const retuned = updateLilyPad(workspace, 'C', { rootMidi: 67 });
  runner.updatePad(retuned.pads.C);
  clock.advance(100);
  clock.advance(300);

  assert.deepEqual(roots, [
    { cycle: 0, nodeId: 'center', rootMidi: 60 },
    { cycle: 0, nodeId: 'delayed', rootMidi: 60 },
    { cycle: 1, nodeId: 'center', rootMidi: 67 },
  ]);
});

test('resolves automated node geometry once at each cycle boundary', () => {
  const clock = new FakeClock();
  const resolvedCycles: number[] = [];
  const cycleStarts: Array<{ cycle: number; x: number; intervalMs: number }> = [];
  const events: Array<{ cycle: number; nodeId: string; x: number }> = [];
  const runner = new QuadCycleRunner({
    clock,
    resolveCycleSnapshot: (pad, cycle) => {
      resolvedCycles.push(cycle);
      return {
        ...pad,
        nodes: pad.nodes.map(node => node.id === 'moving'
          ? { ...node, x: cycle === 0 ? 0.6 : 0.9 }
          : node),
      };
    },
    onCycleStart: (_padId, cycle, snapshot) => cycleStarts.push({
      cycle,
      x: snapshot.nodes.find(node => node.id === 'moving')?.x ?? -1,
      intervalMs: snapshot.intervalMs,
    }),
    onEvent: (_padId, event, cycle, snapshot) => events.push({
      cycle,
      nodeId: event.nodeId,
      x: snapshot.nodes.find(node => node.id === 'moving')?.x ?? -1,
    }),
  });
  let workspace = updateLilyPad(createQuadLilyWorkspace(), 'D', {
    intervalMs: 400,
    loop: true,
  });
  workspace = addLilyNode(workspace, 'D', {
    id: 'moving', x: 0.9, y: 0.5, range: 0.2, scaleStep: 2,
  });

  runner.startPad(workspace.pads.D);
  clock.advance(0);
  clock.advance(100);
  clock.advance(300);

  assert.deepEqual(resolvedCycles, [0, 1]);
  assert.deepEqual(cycleStarts, [
    { cycle: 0, x: 0.6, intervalMs: 400 },
    { cycle: 1, x: 0.9, intervalMs: 400 },
  ]);
  assert.deepEqual(events, [
    { cycle: 0, nodeId: 'center', x: 0.6 },
    { cycle: 0, nodeId: 'moving', x: 0.6 },
    { cycle: 1, nodeId: 'center', x: 0.9 },
  ]);
});

test('does not let delayed events from an old topology leak across the next cycle boundary', () => {
  const clock = new FakeClock();
  const events: Array<{ cycle: number; nodeId: string; at: number }> = [];
  const runner = new QuadCycleRunner({
    clock,
    onEvent: (_padId, event, cycle) => events.push({ cycle, nodeId: event.nodeId, at: clock.now }),
  });
  let workspace = updateLilyPad(createQuadLilyWorkspace(), 'A', {
    intervalMs: 400,
    loop: true,
  });
  [0.59, 0.68, 0.77, 0.86, 0.95].forEach((x, index) => {
    workspace = addLilyNode(workspace, 'A', {
      id: `chain-${index + 1}`,
      x,
      y: 0.5,
      range: 0.11,
      scaleStep: index + 1,
    });
  });

  runner.startPad(workspace.pads.A);
  clock.advance(500);

  assert.equal(events.some(event => event.cycle === 0 && event.at >= 400), false);
  assert.equal(events.some(event => event.cycle === 1 && event.nodeId === 'center' && event.at === 400), true);
});

test('reports the exact compiled cycle object whose active events are sent to MIDI consumers', () => {
  const clock = new FakeClock();
  const compilations: Array<{
    cycle: number;
    compiled: { events: Array<{ nodeId: string }> };
  }> = [];
  const emitted: Array<{ event: { nodeId: string }; cycle: number }> = [];
  const runner = new QuadCycleRunner({
    clock,
    onCycleCompiled: (_padId: string, cycle: number, compiled: { events: Array<{ nodeId: string }> }) => {
      compilations.push({ cycle, compiled });
    },
    onEvent: (_padId, event, cycle) => emitted.push({ event, cycle }),
  } as ConstructorParameters<typeof QuadCycleRunner>[0]);
  let workspace = updateLilyPad(createQuadLilyWorkspace(), 'A', {
    intervalMs: 400,
    loop: false,
  });
  workspace = addLilyNode(workspace, 'A', {
    id: 'next', x: 0.6, y: 0.5, range: 0.2, scaleStep: 1,
  });

  runner.startPad(workspace.pads.A);
  clock.advance(100);

  assert.equal(compilations.length, 1);
  assert.equal(compilations[0].cycle, 0);
  assert.deepEqual(emitted.map(({ event, cycle }) => ({ nodeId: event.nodeId, cycle })), [
    { nodeId: 'center', cycle: 0 },
    { nodeId: 'next', cycle: 0 },
  ]);
  assert.equal(emitted[0].event, compilations[0].compiled.events[0]);
  assert.equal(emitted[1].event, compilations[0].compiled.events[1]);
});

test('look-ahead clock wakes early but preserves dueAt timing metadata', () => {
  const clock = new FakeClock() as FakeClock & { audioNowSec?: () => number };
  clock.audioNowSec = () => clock.now / 1000;
  const timings: Array<{ nodeId: string; at: number; dueAtMs: number; audioWhenSec: number | null }> = [];
  const runner = new QuadCycleRunner({
    clock,
    onEvent: (_padId, event, _cycle, _snapshot, timing) => {
      timings.push({
        nodeId: event.nodeId,
        at: clock.now,
        dueAtMs: timing?.dueAtMs ?? -1,
        audioWhenSec: timing?.audioWhenSec ?? null,
      });
    },
  });
  let workspace = updateLilyPad(createQuadLilyWorkspace(), 'A', {
    intervalMs: 800,
    loop: false,
  });
  workspace = addLilyNode(workspace, 'A', {
    id: 'later', x: 0.6, y: 0.5, range: 0.2, scaleStep: 2,
  });

  runner.startPad(workspace.pads.A);
  // center delay=0 → 立即；later delay=200 → 在 200-60=140 唤醒
  clock.advance(140);
  const later = timings.find((item) => item.nodeId === 'later');
  assert.ok(later);
  assert.equal(later!.at, 140);
  assert.equal(later!.dueAtMs, 200);
  assert.ok(later!.audioWhenSec !== null);
  assert.ok(Math.abs((later!.audioWhenSec ?? 0) - 0.2) < 1e-9);
});
