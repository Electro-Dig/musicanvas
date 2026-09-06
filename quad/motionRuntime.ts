import type { LilyNode, QuadLilyPad } from './core.ts';
import {
  buildFormationTrail,
  findFormationForNode,
  getPadFormations,
  resolveFormationNodePosition,
  type LilyNoteFormation,
} from './groupMotion.ts';
import { resolveMotionPitchStep, resolveMotionPosition, type MotionPoint } from './motion.ts';

/** 轨迹缓存：播放期每帧重渲染时避免重复采样 */
const nodeTrailCache = new WeakMap<LilyNode, { key: string; trail: MotionPoint[] }>();
const formationTrailCache = new WeakMap<LilyNoteFormation, MotionPoint[]>();

export function materializePadMotion(pad: QuadLilyPad, cyclePosition: number): QuadLilyPad {
  const formations = getPadFormations(pad);
  return {
    ...pad,
    nodes: pad.nodes.map((node) => materializeNodeMotion(node, cyclePosition, formations)),
  };
}

export function materializeNodeMotion(
  node: LilyNode,
  cyclePosition: number,
  formations?: readonly LilyNoteFormation[] | LilyNoteFormation | null,
): LilyNode {
  const list = Array.isArray(formations)
    ? formations
    : formations
      ? [formations]
      : [];
  const hit = findFormationForNode(list, node.id);
  if (hit) {
    // 编队优先：共享形状覆盖单节点 motion
    const position = resolveFormationNodePosition(hit.formation, hit.memberIndex, cyclePosition);
    return { ...node, ...position };
  }
  if (!node.motion || node.motion.mode === 'off') return { ...node };
  const position = resolveMotionPosition(node, node.motion, cyclePosition);
  const scaleStep = resolveMotionPitchStep(
    node.scaleStep,
    node.motion,
    node.endpointPitch,
    cyclePosition,
  );
  return { ...node, ...position, scaleStep };
}

export function buildNodeMotionTrail(node: LilyNode, sampleCount = 33): MotionPoint[] {
  if (!node.motion || node.motion.mode === 'off') return [];

  const cacheKey = [
    node.x.toFixed(5),
    node.y.toFixed(5),
    sampleCount,
    JSON.stringify(node.motion),
  ].join('|');
  const cached = nodeTrailCache.get(node);
  if (cached && cached.key === cacheKey) return cached.trail;

  let trail: MotionPoint[] = [];
  if (node.motion.mode === 'flash') {
    const dx = node.motion.targetDx ?? 0;
    const dy = node.motion.targetDy ?? 0;
    if (Math.abs(dx) > 1e-6 || Math.abs(dy) > 1e-6) {
      trail = [
        { x: Math.max(0, Math.min(1, node.x)), y: Math.max(0, Math.min(1, node.y)) },
        { x: Math.max(0, Math.min(1, node.x + dx)), y: Math.max(0, Math.min(1, node.y + dy)) },
      ];
    }
  } else if (node.motion.mode === 'draw') {
    const path = (node.motion.path ?? [])
      .filter((frame) => (
        Number.isFinite(frame.phase)
        && Number.isFinite(frame.dx)
        && Number.isFinite(frame.dy)
      ))
      .slice()
      .sort((left, right) => left.phase - right.phase);
    if (path.length >= 2) {
      trail = path.map((frame) => ({
        x: Math.max(0, Math.min(1, node.x + frame.dx)),
        y: Math.max(0, Math.min(1, node.y + frame.dy)),
      }));
    }
  } else {
    const count = Math.max(2, Math.min(256, Math.round(sampleCount)));
    const rateCycles = Number.isFinite(node.motion.rateCycles) && (node.motion.rateCycles ?? 0) > 0
      ? node.motion.rateCycles!
      : 1;
    // 包含完整周期端点；不增加采样数，同时保证钟摆/圆轨迹覆盖真实极值。
    trail = Array.from({ length: count }, (_, index) => (
      resolveMotionPosition(node, node.motion!, rateCycles * index / Math.max(1, count - 1))
    ));
  }

  nodeTrailCache.set(node, { key: cacheKey, trail });
  return trail;
}

/** 编队共用一条轨迹（只渲染一次） */
export function buildPadFormationTrail(formation: LilyNoteFormation | null | undefined): MotionPoint[] {
  if (!formation || formation.nodeIds.length < 2) return [];
  const cached = formationTrailCache.get(formation);
  if (cached) return cached;
  const trail = buildFormationTrail(formation);
  formationTrailCache.set(formation, trail);
  return trail;
}
