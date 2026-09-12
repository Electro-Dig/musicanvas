import {
  compileLilyCycle,
  getPadCycleDurationMs,
  type LilyCycleCompilation,
  type LilyCycleEvent,
  type QuadLilyPad,
  type QuadPadId,
} from './core.ts';

/** 提前唤醒并排入 AudioContext 的窗口（毫秒）；测试时钟无 audioNowSec 时关闭 */
export const AUDIO_LOOKAHEAD_MS = 60;

export interface QuadCycleClock {
  setTimeout(run: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
  nowMs?(): number;
  /** 可选：AudioContext.currentTime（秒）。提供后启用 look-ahead 发声排程 */
  audioNowSec?(): number | null;
}

export interface QuadCycleCursor {
  padId: QuadPadId;
  cycle: number;
  elapsedMs: number;
  intervalMs: number;
  phase: number;
}

/** onEvent 附带的调度时序：用于把发声排进音频时钟，减轻 setTimeout 抖动 */
export interface QuadCycleEventTiming {
  /** 墙钟上理论触发点（performance.now 域） */
  dueAtMs: number;
  /**
   * AudioContext 绝对时间（秒）。look-ahead 唤醒时计算：
   * audioNow + remainingWallMs/1000；无音频时钟则为 null。
   */
  audioWhenSec: number | null;
}

export interface QuadCycleRunnerOptions {
  clock?: QuadCycleClock;
  resolveCycleSnapshot?(pad: QuadLilyPad, cycle: number): QuadLilyPad;
  /** 延续：超出本周期的节点仍按绝对 delay 播完；下一圈仍按乐句长度开始（BPM 仍定跳时） */
  continueBeyondCycle?: () => boolean;
  onEvent(
    padId: QuadPadId,
    event: LilyCycleEvent,
    cycle: number,
    snapshot: QuadLilyPad,
    timing?: QuadCycleEventTiming,
  ): void;
  onCycleStart?(padId: QuadPadId, cycle: number, snapshot: QuadLilyPad, startedAtMs: number): void;
  onCycleCompiled?(
    padId: QuadPadId,
    cycle: number,
    compilation: LilyCycleCompilation,
    snapshot: QuadLilyPad,
  ): void;
  onPadStop?(padId: QuadPadId): void;
}

interface PendingTask {
  armed: boolean;
  dueAtMs: number;
  handle: unknown;
  remainingMs: number;
  /** 仅音符发声允许提前唤醒；周期重启等结构任务必须准点 */
  allowLookahead: boolean;
  run: (timing: QuadCycleEventTiming) => void;
}

interface ActivePadClock {
  pad: QuadLilyPad;
  sourcePad?: QuadLilyPad;
  cycle: number;
  cycleIntervalMs: number;
  cycleStartedAtMs: number;
  paused: boolean;
  pausedCursor: QuadCycleCursor | null;
  tasks: Set<PendingTask>;
}

const browserClock: QuadCycleClock = {
  setTimeout: (run, delayMs) => globalThis.setTimeout(run, delayMs),
  clearTimeout: handle => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  nowMs: () => globalThis.performance?.now() ?? Date.now(),
};

export class QuadCycleRunner {
  private readonly clock: QuadCycleClock;
  private readonly onEvent: QuadCycleRunnerOptions['onEvent'];
  private readonly resolveCycleSnapshot?: QuadCycleRunnerOptions['resolveCycleSnapshot'];
  private readonly continueBeyondCycle: () => boolean;
  private readonly onCycleStart?: QuadCycleRunnerOptions['onCycleStart'];
  private readonly onCycleCompiled?: QuadCycleRunnerOptions['onCycleCompiled'];
  private readonly onPadStop?: QuadCycleRunnerOptions['onPadStop'];
  private readonly active = new Map<QuadPadId, ActivePadClock>();

  constructor(options: QuadCycleRunnerOptions) {
    this.clock = options.clock ?? browserClock;
    this.onEvent = options.onEvent;
    this.resolveCycleSnapshot = options.resolveCycleSnapshot;
    this.continueBeyondCycle = options.continueBeyondCycle ?? (() => false);
    this.onCycleStart = options.onCycleStart;
    this.onCycleCompiled = options.onCycleCompiled;
    this.onPadStop = options.onPadStop;
  }

  startPad(pad: QuadLilyPad): void {
    this.cancelPad(pad.id, false);
    const active = this.createActivePad(pad);
    this.active.set(pad.id, active);
    this.runCycle(active);
  }

  startPads(pads: readonly QuadLilyPad[]): void {
    pads.forEach(pad => this.cancelPad(pad.id, false));
    const startedAt = this.nowMs();
    pads.forEach(pad => {
      const active = this.createActivePad(pad);
      this.active.set(pad.id, active);
      this.runCycle(active, startedAt);
    });
  }

  updatePad(pad: QuadLilyPad): void {
    const active = this.active.get(pad.id);
    if (active) active.pad = pad;
  }

  pausePad(padId: QuadPadId): QuadCycleCursor | null {
    const active = this.active.get(padId);
    if (!active) return null;
    if (active.paused) return active.pausedCursor;

    const now = this.nowMs();
    const elapsedMs = Math.min(
      active.cycleIntervalMs,
      Math.max(0, now - active.cycleStartedAtMs),
    );
    const cursor: QuadCycleCursor = {
      padId,
      cycle: active.cycle,
      elapsedMs,
      intervalMs: active.cycleIntervalMs,
      phase: active.cycleIntervalMs > 0 ? elapsedMs / active.cycleIntervalMs : 0,
    };

    active.tasks.forEach(task => {
      if (!task.armed) return;
      this.clock.clearTimeout(task.handle);
      task.armed = false;
      task.remainingMs = Math.max(0, task.dueAtMs - now);
    });
    active.paused = true;
    active.pausedCursor = cursor;
    return cursor;
  }

  resumePad(pad: QuadLilyPad): QuadCycleCursor | null {
    const active = this.active.get(pad.id);
    if (!active) return null;
    active.pad = pad;
    if (!active.paused || !active.pausedCursor) return null;

    const cursor = active.pausedCursor;
    const now = this.nowMs();
    active.cycleStartedAtMs = now - cursor.elapsedMs;
    active.paused = false;
    active.pausedCursor = null;
    active.tasks.forEach(task => this.armTask(active, task, task.remainingMs));
    return cursor;
  }

  stopPad(padId: QuadPadId): void {
    this.cancelPad(padId, true);
  }

  stopAll(): void {
    [...this.active.keys()].forEach(padId => this.cancelPad(padId, true));
  }

  isRunning(padId: QuadPadId): boolean {
    const active = this.active.get(padId);
    return Boolean(active && !active.paused);
  }

  isPaused(padId: QuadPadId): boolean {
    return this.active.get(padId)?.paused ?? false;
  }

  /** Read-only transport position. Reading does not schedule, pause or compile anything. */
  readPosition(padId: QuadPadId) {
    const active=this.active.get(padId);
    if(!active)return null;
    const elapsedMs=active.paused?active.pausedCursor?.elapsedMs??0:
      Math.max(0,Math.min(active.cycleIntervalMs,this.nowMs()-active.cycleStartedAtMs));
    return {cycle:active.cycle,phase:active.cycleIntervalMs>0?elapsedMs/active.cycleIntervalMs:0,
      playing:!active.paused,paused:active.paused,sourcePad:active.sourcePad};
  }

  private runCycle(active: ActivePadClock, startedAt = this.nowMs()): void {
    if (this.active.get(active.pad.id) !== active || active.paused) return;
    const cycle = active.cycle;
    active.sourcePad=active.pad;
    const snapshot = this.resolveCycleSnapshot?.(active.pad, cycle) ?? active.pad;
    const compilation = compileLilyCycle(snapshot);
    active.cycleStartedAtMs = startedAt;
    active.cycleIntervalMs = compilation.intervalMs;
    this.onCycleStart?.(snapshot.id, cycle, snapshot, startedAt);
    this.onCycleCompiled?.(snapshot.id, cycle, compilation, snapshot);

    const continueBeyond = this.continueBeyondCycle();
    // 默认：只播本周期内；延续：超周期事件仍按时触发，但 ROOT 不为此等待
    const playable = continueBeyond
      ? compilation.events
      : compilation.events.filter((event) => event.delayMs < compilation.intervalMs);

    playable.forEach((event) => {
      this.schedule(active, Math.max(0, startedAt + event.delayMs - this.nowMs()), (timing) => (
        this.onEvent(snapshot.id, event, cycle, snapshot, timing)
      ), true);
    });

    if (snapshot.loop) {
      // ROOT 严格按乐句周期重启；延续模式下超周期节点的定时器继续跑，不阻塞下一圈
      this.schedule(active, Math.max(0, startedAt + compilation.intervalMs - this.nowMs()), () => {
        // Skip fully missed phrases rather than bursting their notes after a stall.
        const missed = Math.max(1, Math.floor((this.nowMs() - active.cycleStartedAtMs) / compilation.intervalMs));
        active.cycle += missed;
        this.runCycle(active, active.cycleStartedAtMs + missed * compilation.intervalMs);
      }, false);
    }
  }

  private schedule(
    active: ActivePadClock,
    delayMs: number,
    run: (timing: QuadCycleEventTiming) => void,
    allowLookahead: boolean,
  ): void {
    const task: PendingTask = {
      armed: false,
      dueAtMs: this.nowMs(),
      handle: undefined,
      remainingMs: Math.max(0, delayMs),
      allowLookahead,
      run,
    };
    active.tasks.add(task);
    this.armTask(active, task, task.remainingMs);
  }

  private cancelPad(padId: QuadPadId, notify: boolean): void {
    const active = this.active.get(padId);
    if (!active) return;
    this.active.delete(padId);
    active.tasks.forEach(task => {
      if (task.armed) this.clock.clearTimeout(task.handle);
      task.armed = false;
    });
    active.tasks.clear();
    if (notify) this.onPadStop?.(padId);
  }

  private createActivePad(pad: QuadLilyPad): ActivePadClock {
    return {
      pad,
      cycle: 0,
      cycleIntervalMs: getPadCycleDurationMs(pad),
      cycleStartedAtMs: this.nowMs(),
      paused: false,
      pausedCursor: null,
      tasks: new Set(),
    };
  }

  private armTask(active: ActivePadClock, task: PendingTask, delayMs: number): void {
    if (active.paused || this.active.get(active.pad.id) !== active) return;
    const delay = Math.max(0, delayMs);
    task.remainingMs = delay;
    task.dueAtMs = this.nowMs() + delay;
    task.armed = true;

    // 有音频时钟且允许 look-ahead 时提前唤醒，把发声排进 AudioContext；周期边界不准提前
    const lookaheadEnabled = task.allowLookahead && typeof this.clock.audioNowSec === 'function';
    const wakeDelay = lookaheadEnabled
      ? Math.max(0, delay - AUDIO_LOOKAHEAD_MS)
      : delay;

    task.handle = this.clock.setTimeout(() => {
      task.armed = false;
      active.tasks.delete(task);
      if (this.active.get(active.pad.id) !== active || active.paused) return;

      const remainingMs = Math.max(0, task.dueAtMs - this.nowMs());
      const audioNow = this.clock.audioNowSec?.() ?? null;
      const audioWhenSec = audioNow == null ? null : audioNow + remainingMs / 1000;
      task.run({ dueAtMs: task.dueAtMs, audioWhenSec });
    }, wakeDelay);
  }

  private nowMs(): number {
    return this.clock.nowMs?.() ?? Date.now();
  }
}
