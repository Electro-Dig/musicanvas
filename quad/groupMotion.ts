/**
 * 组合 / 批量运动
 *
 * 两套互不混淆的逻辑：
 * 1) 批量各自运动（轨迹模式 + Ctrl 多选）：每个节点仍有自己的圆/线/闪烁，相位均匀错开
 * 2) 共享编队（组合音符面板）：多个音符共同组成一个圆形 / 线段 / 闪烁单位
 */
import type { LilyNode } from './core.ts';
import type { LilyNodeMotion } from './motion.ts';

export type GroupMotionMode = 'orbit' | 'pendulum' | 'flash';
export type FormationShape = 'circle' | 'line' | 'flash';

export const GROUP_MOTION_MODES: ReadonlyArray<{ key: GroupMotionMode; label: string }> = [
  { key: 'orbit', label: '圆形' },
  { key: 'pendulum', label: '线段' },
  { key: 'flash', label: '闪烁' },
];

export const FORMATION_SHAPES: ReadonlyArray<{ key: FormationShape; label: string }> = [
  { key: 'circle', label: '圆形' },
  { key: 'line', label: '线段' },
  { key: 'flash', label: '闪烁' },
];

const DEFAULT_AMOUNT = 0.08;
const DEFAULT_RATE_CYCLES = 4;
const DEFAULT_FORMATION_RADIUS = 0.12;

/** Pad 上的共享编队：多音符合成一个可调单位 */
export interface LilyNoteFormation {
  /** 画布标识，如 G1 */
  id: string;
  nodeIds: string[];
  shape: FormationShape;
  centerX: number;
  centerY: number;
  /** 圆形半径；线段半长；闪烁时作占位半径 */
  radius: number;
  rateCycles: number;
  phaseOffset?: number;
  direction?: number;
  /** 线段朝向（度） */
  angleDegrees?: number;
  /** 编队闪烁的共享位移（相对各节点编队基位） */
  flashDx?: number;
  flashDy?: number;
}

export interface MotionPoint {
  x: number;
  y: number;
}

/** 轨迹模式多选：各自一套 motion，phaseOffset = i/N */
export function buildBatchIndividualMotions(
  orderedNodes: readonly LilyNode[],
  mode: GroupMotionMode,
  rateCycles = DEFAULT_RATE_CYCLES,
  sharedFlash?: { targetDx: number; targetDy: number },
): Array<{ nodeId: string; motion: LilyNodeMotion }> {
  const count = orderedNodes.length;
  if (count < 2) return [];

  const safeRate = Math.max(1, Math.round(Number.isFinite(rateCycles) ? rateCycles : DEFAULT_RATE_CYCLES));
  const angleDegrees = resolveSpanAngle(orderedNodes);

  return orderedNodes.map((node, index) => {
    const phaseOffset = index / count;
    if (mode === 'orbit') {
      return {
        nodeId: node.id,
        motion: {
          mode: 'orbit',
          amount: DEFAULT_AMOUNT,
          rateCycles: safeRate,
          phaseOffset,
          direction: 1,
        },
      };
    }
    if (mode === 'pendulum') {
      return {
        nodeId: node.id,
        motion: {
          mode: 'pendulum',
          amount: DEFAULT_AMOUNT,
          angleDegrees,
          rateCycles: safeRate,
          phaseOffset,
          direction: 1,
        },
      };
    }

    const targetDx = sharedFlash?.targetDx ?? 0;
    const targetDy = sharedFlash?.targetDy ?? 0;
    return {
      nodeId: node.id,
      motion: {
        mode: 'flash',
        rateCycles: safeRate,
        phaseOffset,
        direction: 1,
        ...(Math.abs(targetDx) > 1e-6 || Math.abs(targetDy) > 1e-6
          ? { targetDx, targetDy }
          : {}),
      },
    };
  });
}

/** @deprecated 使用 buildBatchIndividualMotions */
export const buildGroupedNodeMotions = buildBatchIndividualMotions;

/** 分配下一个未占用的编队编号：G1、G2、G3… */
export function allocateFormationId(
  existing: readonly Pick<LilyNoteFormation, 'id'>[],
): string {
  const used = new Set(existing.map((item) => item.id));
  let index = 1;
  while (used.has(`G${index}`)) index += 1;
  return `G${index}`;
}

/**
 * 读取 Pad 上的编队列表。
 * 兼容旧存档的单字段 `formation`；新数据以 `formations` 为准。
 */
export function getPadFormations(pad: {
  formations?: readonly LilyNoteFormation[] | null;
  formation?: LilyNoteFormation | null;
}): LilyNoteFormation[] {
  if (Array.isArray(pad.formations)) {
    return pad.formations
      .filter((item) => item && Array.isArray(item.nodeIds) && item.nodeIds.length >= 2)
      .map((item) => ({ ...item, nodeIds: [...item.nodeIds] }));
  }
  if (pad.formation && pad.formation.nodeIds.length >= 2) {
    return [{ ...pad.formation, nodeIds: [...pad.formation.nodeIds] }];
  }
  return [];
}

export function findFormationById(
  formations: readonly LilyNoteFormation[],
  id: string | null | undefined,
): LilyNoteFormation | null {
  if (!id) return null;
  return formations.find((item) => item.id === id) ?? null;
}

/** 查找节点所属编队（一个节点最多属于一个编队） */
export function findFormationForNode(
  formations: readonly LilyNoteFormation[],
  nodeId: string,
): { formation: LilyNoteFormation; memberIndex: number } | null {
  for (const formation of formations) {
    const memberIndex = formation.nodeIds.indexOf(nodeId);
    if (memberIndex >= 0) return { formation, memberIndex };
  }
  return null;
}

/** 从编队中剥离节点；成员不足 2 的编队自动删除 */
export function detachNodesFromFormations(
  formations: readonly LilyNoteFormation[],
  nodeIds: readonly string[],
): LilyNoteFormation[] {
  if (nodeIds.length === 0) return formations.map((item) => ({ ...item, nodeIds: [...item.nodeIds] }));
  const remove = new Set(nodeIds);
  return formations
    .map((item) => ({
      ...item,
      nodeIds: item.nodeIds.filter((id) => !remove.has(id)),
    }))
    .filter((item) => item.nodeIds.length >= 2);
}

/** 写入/更新编队：同 id 覆盖；成员从其他编队互斥剥离 */
export function upsertFormation(
  formations: readonly LilyNoteFormation[],
  formation: LilyNoteFormation,
): LilyNoteFormation[] {
  const withoutSelf = formations.filter((item) => item.id !== formation.id);
  const cleared = detachNodesFromFormations(withoutSelf, formation.nodeIds);
  return [...cleared, { ...formation, nodeIds: [...formation.nodeIds] }];
}

export function removeFormationById(
  formations: readonly LilyNoteFormation[],
  id: string,
): LilyNoteFormation[] {
  return formations.filter((item) => item.id !== id);
}

export function sameFormationMembership(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

/** 由当前点选节点创建共享编队（圆心=质心，半径=平均距质心） */
export function createNoteFormation(
  orderedNodes: readonly LilyNode[],
  shape: FormationShape,
  rateCycles = DEFAULT_RATE_CYCLES,
  options?: { id?: string },
): LilyNoteFormation | null {
  if (orderedNodes.length < 2) return null;
  const center = resolveCentroid(orderedNodes);
  const meanRadius = resolveMeanRadius(orderedNodes, center);
  const radius = Math.max(DEFAULT_FORMATION_RADIUS, Math.min(0.42, meanRadius || DEFAULT_FORMATION_RADIUS));
  const angleDegrees = resolveSpanAngle(orderedNodes);
  const safeRate = Math.max(1, Math.round(Number.isFinite(rateCycles) ? rateCycles : DEFAULT_RATE_CYCLES));

  return {
    id: options?.id ?? 'G1',
    nodeIds: orderedNodes.map((node) => node.id),
    shape,
    centerX: center.x,
    centerY: center.y,
    radius,
    rateCycles: safeRate,
    phaseOffset: 0,
    direction: 1,
    angleDegrees,
    ...(shape === 'flash' ? { flashDx: 0, flashDy: 0 } : {}),
  };
}

export function patchNoteFormation(
  formation: LilyNoteFormation,
  patch: Partial<Omit<LilyNoteFormation, 'nodeIds' | 'id'>> & { nodeIds?: string[]; id?: string },
): LilyNoteFormation {
  return {
    ...formation,
    ...patch,
    id: patch.id ?? formation.id,
    nodeIds: patch.nodeIds ? [...patch.nodeIds] : [...formation.nodeIds],
    radius: clampUnit(patch.radius ?? formation.radius, formation.radius),
    rateCycles: Math.max(1, Math.round(patch.rateCycles ?? formation.rateCycles)),
    centerX: clampUnit(patch.centerX ?? formation.centerX, formation.centerX),
    centerY: clampUnit(patch.centerY ?? formation.centerY, formation.centerY),
  };
}

/** 编队 ↔ 轨迹面板：把编队参数映射成可编辑的假 motion */
export function formationToEditorMotion(formation: LilyNoteFormation): LilyNodeMotion {
  if (formation.shape === 'circle') {
    return {
      mode: 'orbit',
      amount: formation.radius,
      rateCycles: formation.rateCycles,
      phaseOffset: formation.phaseOffset ?? 0,
      direction: formation.direction === -1 ? -1 : 1,
    };
  }
  if (formation.shape === 'line') {
    return {
      mode: 'pendulum',
      amount: formation.radius,
      angleDegrees: formation.angleDegrees ?? 0,
      rateCycles: formation.rateCycles,
      phaseOffset: formation.phaseOffset ?? 0,
      direction: formation.direction === -1 ? -1 : 1,
    };
  }
  return {
    mode: 'flash',
    rateCycles: formation.rateCycles,
    phaseOffset: formation.phaseOffset ?? 0,
    direction: 1,
    targetDx: formation.flashDx ?? 0,
    targetDy: formation.flashDy ?? 0,
  };
}

/** 轨迹面板改动写回编队（形状不变，只调半径/周期/角度/闪烁位移） */
export function applyEditorMotionToFormation(
  formation: LilyNoteFormation,
  motion: LilyNodeMotion,
): LilyNoteFormation {
  if (motion.mode === 'off' || motion.mode === 'draw') return formation;
  if (formation.shape === 'circle' && motion.mode === 'orbit') {
    return patchNoteFormation(formation, {
      radius: motion.amount ?? formation.radius,
      rateCycles: motion.rateCycles ?? formation.rateCycles,
      phaseOffset: motion.phaseOffset ?? formation.phaseOffset,
      direction: motion.direction === -1 ? -1 : 1,
    });
  }
  if (formation.shape === 'line' && motion.mode === 'pendulum') {
    return patchNoteFormation(formation, {
      radius: motion.amount ?? formation.radius,
      angleDegrees: motion.angleDegrees ?? formation.angleDegrees,
      rateCycles: motion.rateCycles ?? formation.rateCycles,
      phaseOffset: motion.phaseOffset ?? formation.phaseOffset,
      direction: motion.direction === -1 ? -1 : 1,
    });
  }
  if (formation.shape === 'flash' && motion.mode === 'flash') {
    return patchNoteFormation(formation, {
      rateCycles: motion.rateCycles ?? formation.rateCycles,
      flashDx: motion.targetDx ?? formation.flashDx,
      flashDy: motion.targetDy ?? formation.flashDy,
    });
  }
  return formation;
}

/** 编队在周期相位下，第 index 个成员的位置 */
export function resolveFormationNodePosition(
  formation: LilyNoteFormation,
  index: number,
  cyclePosition: number,
): MotionPoint {
  const count = Math.max(2, formation.nodeIds.length);
  const phase = resolveFormationPhase(cyclePosition, formation);
  const cx = clampUnit(formation.centerX, 0.5);
  const cy = clampUnit(formation.centerY, 0.5);
  const radius = clampUnit(formation.radius, DEFAULT_FORMATION_RADIUS);

  if (formation.shape === 'circle') {
    const slot = index / count;
    const angle = (slot + phase) * Math.PI * 2;
    return {
      x: clampUnit(cx + radius * Math.cos(angle), cx),
      y: clampUnit(cy + radius * Math.sin(angle), cy),
    };
  }

  if (formation.shape === 'line') {
    const angleDeg = Number.isFinite(formation.angleDegrees) ? formation.angleDegrees! : 0;
    const angle = (angleDeg * Math.PI) / 180;
    const span = count === 1 ? 0 : (index / (count - 1) - 0.5) * 2;
    // 基位在线段上均匀分布；整段随相位做垂直方向的钟摆
    const along = span * radius;
    const swing = radius * Math.sin(phase * Math.PI * 2);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: clampUnit(cx + along * cos - swing * sin, cx),
      y: clampUnit(cy + along * sin + swing * cos, cy),
    };
  }

  // 闪烁：前半在编队基位（按顺序围成小圆/保持相对），后半整体平移 flash 位移
  const slot = index / count;
  const baseAngle = slot * Math.PI * 2;
  const home = {
    x: clampUnit(cx + radius * Math.cos(baseAngle), cx),
    y: clampUnit(cy + radius * Math.sin(baseAngle), cy),
  };
  if (phase < 0.5) return home;
  return {
    x: clampUnit(home.x + (formation.flashDx ?? 0), home.x),
    y: clampUnit(home.y + (formation.flashDy ?? 0), home.y),
  };
}

/** 写入编队时，把节点基位落到 phase=0 的槽位，便于传播图与解除编队后仍合理 */
export function resolveFormationHomePositions(
  formation: LilyNoteFormation,
): Array<{ nodeId: string; x: number; y: number }> {
  return formation.nodeIds.map((nodeId, index) => {
    const point = resolveFormationNodePosition(
      { ...formation, phaseOffset: 0, rateCycles: 1 },
      index,
      0,
    );
    return { nodeId, ...point };
  });
}

export function buildFormationTrail(
  formation: LilyNoteFormation,
  sampleCount = 48,
): MotionPoint[] {
  if (formation.shape === 'circle') {
    return Array.from({ length: sampleCount }, (_, index) => {
      const angle = (index / sampleCount) * Math.PI * 2;
      return {
        x: clampUnit(formation.centerX + formation.radius * Math.cos(angle), formation.centerX),
        y: clampUnit(formation.centerY + formation.radius * Math.sin(angle), formation.centerY),
      };
    });
  }
  if (formation.shape === 'line') {
    const angle = ((formation.angleDegrees ?? 0) * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return [
      {
        x: clampUnit(formation.centerX - formation.radius * cos, formation.centerX),
        y: clampUnit(formation.centerY - formation.radius * sin, formation.centerY),
      },
      {
        x: clampUnit(formation.centerX + formation.radius * cos, formation.centerX),
        y: clampUnit(formation.centerY + formation.radius * sin, formation.centerY),
      },
    ];
  }
  const dx = formation.flashDx ?? 0;
  const dy = formation.flashDy ?? 0;
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return [];
  return [
    { x: clampUnit(formation.centerX, 0.5), y: clampUnit(formation.centerY, 0.5) },
    { x: clampUnit(formation.centerX + dx, 0.5), y: clampUnit(formation.centerY + dy, 0.5) },
  ];
}

export function findFormationMemberIndex(
  formation: LilyNoteFormation | null | undefined,
  nodeId: string,
): number {
  if (!formation) return -1;
  return formation.nodeIds.indexOf(nodeId);
}

export function moveGroupOrderItem(
  orderedIds: readonly string[],
  nodeId: string,
  direction: -1 | 1,
): string[] {
  const index = orderedIds.indexOf(nodeId);
  if (index < 0) return [...orderedIds];
  const target = index + direction;
  if (target < 0 || target >= orderedIds.length) return [...orderedIds];
  const next = [...orderedIds];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

export function resolveGroupSelectionClick(
  current: readonly string[],
  nodeId: string,
  multi: boolean,
): string[] {
  if (!multi) return [nodeId];
  const index = current.indexOf(nodeId);
  if (index >= 0) {
    if (current.length <= 1) return current.length ? [...current] : [nodeId];
    return current.filter((id) => id !== nodeId);
  }
  return [...current, nodeId];
}

function resolveCentroid(nodes: readonly LilyNode[]): MotionPoint {
  const count = nodes.length || 1;
  const sum = nodes.reduce(
    (acc, node) => ({ x: acc.x + node.x, y: acc.y + node.y }),
    { x: 0, y: 0 },
  );
  return { x: sum.x / count, y: sum.y / count };
}

function resolveMeanRadius(nodes: readonly LilyNode[], center: MotionPoint): number {
  if (!nodes.length) return DEFAULT_FORMATION_RADIUS;
  const total = nodes.reduce(
    (sum, node) => sum + Math.hypot(node.x - center.x, node.y - center.y),
    0,
  );
  return total / nodes.length;
}

function resolveSpanAngle(orderedNodes: readonly LilyNode[]): number {
  const first = orderedNodes[0];
  const last = orderedNodes[orderedNodes.length - 1];
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  if (Math.hypot(dx, dy) < 1e-6) return 0;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

function resolveFormationPhase(
  cyclePosition: number,
  formation: Pick<LilyNoteFormation, 'rateCycles' | 'phaseOffset' | 'direction'>,
): number {
  const cycle = Number.isFinite(cyclePosition) ? cyclePosition : 0;
  const rateCycles = Number.isFinite(formation.rateCycles) && (formation.rateCycles ?? 0) > 0
    ? formation.rateCycles!
    : 1;
  const phaseOffset = Number.isFinite(formation.phaseOffset) ? formation.phaseOffset! : 0;
  const direction = formation.direction === -1 ? -1 : 1;
  const phase = phaseOffset + direction * cycle / rateCycles;
  return ((phase % 1) + 1) % 1;
}

function clampUnit(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}
