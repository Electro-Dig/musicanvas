export interface MotionPoint {
  x: number;
  y: number;
}

export interface OffMotion {
  mode: 'off';
}

export type MotionDirection = number;

interface MotionTiming {
  rateCycles?: number;
  phaseOffset?: number;
  direction?: number;
}

export interface OrbitMotion extends MotionTiming {
  mode: 'orbit';
  amount?: number;
}

export interface PendulumMotion extends MotionTiming {
  mode: 'pendulum';
  amount?: number;
  angleDegrees?: number;
}

export interface DrawMotionKeyframe {
  phase: number;
  dx: number;
  dy: number;
}

export interface DrawMotion extends MotionTiming {
  mode: 'draw';
  path?: DrawMotionKeyframe[];
}

/** 闪烁：周期前半在原点，后半跳到目标点（相对位移） */
export interface FlashMotion extends MotionTiming {
  mode: 'flash';
  targetDx?: number;
  targetDy?: number;
}

export interface AbsoluteDragSample extends MotionPoint {
  timeMs: number;
}

export type LilyNodeMotion = OffMotion | OrbitMotion | PendulumMotion | DrawMotion | FlashMotion;

export interface MotionEndpointPitch {
  bStep: number;
}

export function resolveMotionPosition(
  base: MotionPoint,
  motion: LilyNodeMotion,
  cyclePosition: number,
): MotionPoint {
  const safeBase = {
    x: clampUnit(base.x, 0.5),
    y: clampUnit(base.y, 0.5),
  };
  if (motion.mode === 'off') return safeBase;
  if (
    motion.mode !== 'orbit'
    && motion.mode !== 'pendulum'
    && motion.mode !== 'draw'
    && motion.mode !== 'flash'
  ) {
    return safeBase;
  }

  const phase = resolvePhase(cyclePosition, motion);
  if (motion.mode === 'flash') {
    // 周期内跳转：前半原位，后半目标（闪烁感）
    if (phase < 0.5) return safeBase;
    return {
      x: clampUnit(safeBase.x + (motion.targetDx ?? 0), safeBase.x),
      y: clampUnit(safeBase.y + (motion.targetDy ?? 0), safeBase.y),
    };
  }
  if (motion.mode === 'draw') {
    const displacement = interpolateDrawPath(motion.path ?? [], phase);
    return {
      x: clampUnit(safeBase.x + displacement.dx, safeBase.x),
      y: clampUnit(safeBase.y + displacement.dy, safeBase.y),
    };
  }

  const amount = clampUnit(motion.amount ?? 0, 0);
  if (motion.mode === 'pendulum') {
    const angleDegrees = Number.isFinite(motion.angleDegrees) ? motion.angleDegrees! : 0;
    const angle = angleDegrees * Math.PI / 180;
    const displacement = amount * Math.sin(phase * Math.PI * 2);
    return {
      x: clampUnit(safeBase.x + displacement * Math.cos(angle), safeBase.x),
      y: clampUnit(safeBase.y + displacement * Math.sin(angle), safeBase.y),
    };
  }
  return {
    x: clampUnit(safeBase.x + amount * Math.cos(phase * Math.PI * 2), safeBase.x),
    y: clampUnit(safeBase.y + amount * Math.sin(phase * Math.PI * 2), safeBase.y),
  };
}

/**
 * Converts continuous node motion into one discrete pitch for the next cycle
 * snapshot. A is the node's stored scaleStep; B is an optional alternate step.
 * The small directional bias makes exact half-way positions deterministic.
 */
export function resolveMotionPitchStep(
  baseStep: number,
  motion: LilyNodeMotion,
  endpointPitch: MotionEndpointPitch | undefined,
  cyclePosition: number,
): number {
  if (!Number.isInteger(endpointPitch?.bStep) || motion.mode === 'off') return baseStep;

  const endpoints = resolvePitchEndpointPhases(motion);
  if (!endpoints) return baseStep;

  const phase = resolvePitchTravelPhase(cyclePosition, motion);
  const direction = motion.direction === -1 ? -1 : 1;
  const probe = wrapPhase(phase + direction * 1e-9);
  const distanceToA = cyclicDistance(probe, endpoints.a);
  const distanceToB = cyclicDistance(probe, endpoints.b);
  return distanceToB < distanceToA ? endpointPitch.bStep : baseStep;
}

export function compileDrawPath(
  base: MotionPoint,
  samples: AbsoluteDragSample[],
  loopDurationMs: number,
): DrawMotionKeyframe[] {
  if (!Number.isFinite(loopDurationMs) || loopDurationMs <= 0) return [];
  const safeBase = {
    x: clampUnit(base.x, 0.5),
    y: clampUnit(base.y, 0.5),
  };
  const sorted = samples
    .filter((sample) => (
      Number.isFinite(sample.timeMs)
      && Number.isFinite(sample.x)
      && Number.isFinite(sample.y)
    ))
    .sort((left, right) => left.timeMs - right.timeMs);
  if (sorted.length === 0) return [];
  const startTimeMs = sorted[0].timeMs;

  const frames = sorted
    .filter((sample) => sample.timeMs - startTimeMs <= loopDurationMs)
    .map((sample) => ({
      phase: Math.min(1, Math.max(0, (sample.timeMs - startTimeMs) / loopDurationMs)),
      dx: clampUnit(sample.x, safeBase.x) - safeBase.x,
      dy: clampUnit(sample.y, safeBase.y) - safeBase.y,
    }));

  // 去掉连续重复点，轨迹更干净
  const cleaned: DrawMotionKeyframe[] = [];
  for (const frame of frames) {
    const last = cleaned.at(-1);
    if (
      last
      && Math.abs(last.dx - frame.dx) < 1e-5
      && Math.abs(last.dy - frame.dy) < 1e-5
    ) {
      cleaned[cleaned.length - 1] = frame;
      continue;
    }
    cleaned.push(frame);
  }
  return cleaned;
}

/** 把录制时长折算到更和谐的运动周期（2/4/6/8…） */
export function snapDrawRateCycles(durationMs: number, intervalMs: number): number {
  const safeInterval = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 600;
  const raw = Math.max(0.5, durationMs / safeInterval);
  const presets = [1, 2, 3, 4, 6, 8, 12, 16];
  return presets.reduce((best, candidate) => (
    Math.abs(candidate - raw) < Math.abs(best - raw) ? candidate : best
  ));
}

function clampUnit(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function resolvePhase(
  cyclePosition: number,
  motion: MotionTiming,
): number {
  const cycle = Number.isFinite(cyclePosition) ? cyclePosition : 0;
  const rateCycles = Number.isFinite(motion.rateCycles) && (motion.rateCycles ?? 0) > 0
    ? motion.rateCycles!
    : 1;
  const phaseOffset = Number.isFinite(motion.phaseOffset) ? motion.phaseOffset! : 0;
  const direction = motion.direction === -1 ? -1 : 1;
  const phase = phaseOffset + direction * cycle / rateCycles;
  return ((phase % 1) + 1) % 1;
}

function resolvePitchTravelPhase(
  cyclePosition: number,
  motion: MotionTiming,
): number {
  const cycle = Number.isFinite(cyclePosition) ? cyclePosition : 0;
  const rateCycles = Number.isFinite(motion.rateCycles) && (motion.rateCycles ?? 0) > 0
    ? motion.rateCycles!
    : 1;
  const phaseOffset = Number.isFinite(motion.phaseOffset) ? motion.phaseOffset! : 0;
  const direction = motion.direction === -1 ? -1 : 1;
  return wrapPhase(phaseOffset + direction * cycle / rateCycles);
}

function resolvePitchEndpointPhases(
  motion: Exclude<LilyNodeMotion, OffMotion>,
): { a: number; b: number } | null {
  if (motion.mode === 'orbit') {
    return (motion.amount ?? 0) > Number.EPSILON ? { a: 0, b: 0.5 } : null;
  }
  if (motion.mode === 'pendulum') {
    return (motion.amount ?? 0) > Number.EPSILON ? { a: 0.25, b: 0.75 } : null;
  }
  if (motion.mode === 'flash') {
    const hasTarget = Math.abs(motion.targetDx ?? 0) > 1e-6 || Math.abs(motion.targetDy ?? 0) > 1e-6;
    return hasTarget ? { a: 0.25, b: 0.75 } : null;
  }

  const frames = (motion.path ?? [])
    .filter(frame => (
      Number.isFinite(frame.phase)
      && Number.isFinite(frame.dx)
      && Number.isFinite(frame.dy)
    ))
    .map(frame => ({ ...frame, phase: wrapPhase(frame.phase) }))
    .sort((left, right) => left.phase - right.phase);
  if (frames.length < 2) return null;

  const first = frames[0];
  const last = frames[frames.length - 1];
  if (
    first.phase === last.phase
    || (first.dx === last.dx && first.dy === last.dy)
  ) return null;
  return { a: first.phase, b: last.phase };
}

function cyclicDistance(left: number, right: number): number {
  const distance = Math.abs(left - right);
  return Math.min(distance, 1 - distance);
}

function wrapPhase(value: number): number {
  return ((value % 1) + 1) % 1;
}

function interpolateDrawPath(path: DrawMotionKeyframe[], phase: number): Pick<DrawMotionKeyframe, 'dx' | 'dy'> {
  const usable = path
    .filter((frame) => (
      Number.isFinite(frame.phase)
      && Number.isFinite(frame.dx)
      && Number.isFinite(frame.dy)
    ))
    .map((frame) => ({
      ...frame,
      phase: ((frame.phase % 1) + 1) % 1,
    }));
  if (usable.length === 0) return { dx: 0, dy: 0 };
  if (usable.length === 1) return { dx: usable[0].dx, dy: usable[0].dy };

  const sorted = usable.sort((left, right) => left.phase - right.phase);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  // 开放路径：不到起点/终点之间不做「绕回」插值，避免播放时出现回抽双线感
  if (phase <= first.phase) return { dx: first.dx, dy: first.dy };
  if (phase >= last.phase) return { dx: last.dx, dy: last.dy };

  let previousIndex = 0;
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    if (sorted[index].phase <= phase) {
      previousIndex = index;
      break;
    }
  }
  const previous = sorted[previousIndex];
  const next = sorted[Math.min(sorted.length - 1, previousIndex + 1)];
  if (next.phase <= previous.phase) return { dx: previous.dx, dy: previous.dy };
  const progress = (phase - previous.phase) / (next.phase - previous.phase);

  return {
    dx: previous.dx + (next.dx - previous.dx) * progress,
    dy: previous.dy + (next.dy - previous.dy) * progress,
  };
}
