/**
 * 素材库空间缩略图：把 Pad 几何（含编队形状、双音符标记）编成可绘制的轻量模型。
 */
import type { QuadLilyPad } from '../core.ts';
import {
  buildFormationTrail,
  getPadFormations,
  resolveFormationHomePositions,
  type LilyNoteFormation,
} from '../groupMotion.ts';

export interface LibraryPreviewPoint {
  x: number;
  y: number;
}

export interface LibraryPreviewNodeMark {
  id: string;
  x: number;
  y: number;
  range: number;
  isCenter: boolean;
  /** 节点带双音符（endpointPitch）时为 true */
  dualNote: boolean;
  muted: boolean;
  hidden: boolean;
}

export interface LibraryPreviewFormationMark {
  id: string;
  shape: LilyNoteFormation['shape'];
  center: LibraryPreviewPoint;
  /** 编队外形轨迹（圆/线/闪烁） */
  trail: LibraryPreviewPoint[];
  /** 成员基位连线（闭合多边形，便于看出「一组」） */
  memberRing: LibraryPreviewPoint[];
}

export interface LibraryPadPreviewModel {
  nodes: LibraryPreviewNodeMark[];
  /** 非编队成员之间的顺序连线（旧缩略图行为） */
  freeEdges: Array<{ from: LibraryPreviewPoint; to: LibraryPreviewPoint }>;
  formations: LibraryPreviewFormationMark[];
}

const PREVIEW_W = 100;
const PREVIEW_H = 68;

export function toPreviewPoint(x: number, y: number): LibraryPreviewPoint {
  return {
    x: clamp(x, 0, 1) * PREVIEW_W,
    y: clamp(y, 0, 1) * PREVIEW_H,
  };
}

/** 供素材卡片 SVG 使用的 Pad 预览数据 */
export function buildPadLibraryPreviewModel(pad: QuadLilyPad): LibraryPadPreviewModel {
  const formations = getPadFormations(pad);
  const memberIds = new Set(formations.flatMap((item) => item.nodeIds));

  const nodes: LibraryPreviewNodeMark[] = pad.nodes.map((node) => ({
    id: node.id,
    x: clamp(node.x, 0, 1) * PREVIEW_W,
    y: clamp(node.y, 0, 1) * PREVIEW_H,
    range: Number.isFinite(node.range) ? node.range : 0.12,
    isCenter: node.isCenter,
    dualNote: Boolean(node.endpointPitch && Number.isInteger(node.endpointPitch.bStep)),
    muted: node.muted === true,
    hidden: node.hidden === true,
  }));

  const freeEdges: LibraryPadPreviewModel['freeEdges'] = [];
  const freeNodes = pad.nodes.filter((node) => !memberIds.has(node.id));
  for (let index = 1; index < freeNodes.length; index += 1) {
    const previous = freeNodes[index - 1];
    const current = freeNodes[index];
    freeEdges.push({
      from: toPreviewPoint(previous.x, previous.y),
      to: toPreviewPoint(current.x, current.y),
    });
  }

  const formationMarks: LibraryPreviewFormationMark[] = formations.map((formation) => {
    const homes = resolveFormationHomePositions(formation);
    const memberRing = homes.map((home) => toPreviewPoint(home.x, home.y));
    if (memberRing.length >= 2) {
      memberRing.push({ ...memberRing[0] });
    }
    const trail = buildFormationTrail(formation).map((point) => toPreviewPoint(point.x, point.y));
    return {
      id: formation.id,
      shape: formation.shape,
      center: toPreviewPoint(formation.centerX, formation.centerY),
      trail,
      memberRing,
    };
  });

  return { nodes, freeEdges, formations: formationMarks };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
