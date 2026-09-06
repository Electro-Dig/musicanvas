import type {
  LilyCycleCompilation,
  LilyCycleCompiledNode,
  QuadLilyPad,
  QuadPadId,
} from './core.ts';
import { compileLilyCycle } from './core.ts';
import { materializePadMotion } from './motionRuntime.ts';

export type CycleMapNodeChange =
  | 'stable'
  | 'retimed'
  | 'rewired'
  | 'repitched'
  | 'entering'
  | 'leaving'
  | 'silent';

export type CycleMapEdgeLayer = 'stable' | 'current' | 'next';

export interface CycleMapNode {
  nodeId: string;
  scaleStep: number;
  isCenter: boolean;
  change: CycleMapNodeChange;
  current: LilyCycleCompiledNode | null;
  next: LilyCycleCompiledNode | null;
  x: number;
  y: number;
  currentX: number | null;
  currentY: number | null;
  nextX: number | null;
  nextY: number | null;
}

export interface CycleMapEdge {
  fromId: string;
  toId: string;
  layer: CycleMapEdgeLayer;
}

export interface CycleMapModel {
  nodes: CycleMapNode[];
  edges: CycleMapEdge[];
  currentActive: number;
  nextActive: number;
  changed: number;
  unreachable: number;
  outsideCycle: number;
}

export interface CycleFlowNode extends CycleMapNode {
  flowX: number;
  flowY: number;
  flowDepth: number;
}

export interface CycleFlowModel {
  nodes: CycleFlowNode[];
  edges: CycleMapEdge[];
  nodeWidthPct: number;
  nodeHeightPct: number;
  compact: boolean;
}

export interface CycleTracePair {
  current: LilyCycleCompilation;
  next: LilyCycleCompilation;
  currentCycle: number;
  nextCycle: number;
}

export function buildCycleTracePair(
  pad: QuadLilyPad,
  cycle: number,
  compiledCurrent: LilyCycleCompilation | null,
  preservePaused = false,
): CycleTracePair {
  const visible = resolveVisibleCycleState(pad, cycle, 0, preservePaused);
  const currentCycle = visible.cycle;
  const current = (pad.playing || preservePaused) && compiledCurrent
    ? compiledCurrent
    : compileLilyCycle(materializePadMotion(pad, currentCycle));
  const nextCycle = currentCycle + 1;
  return {
    current,
    next: compileLilyCycle(materializePadMotion(pad, nextCycle)),
    currentCycle,
    nextCycle,
  };
}

export function resolveVisibleCycleState(
  pad: QuadLilyPad,
  cycle: number,
  phase: number,
  preservePaused = false,
): { cycle: number; phase: number; position: number } {
  if (!pad.playing && !preservePaused) return { cycle: 0, phase: 0, position: 0 };
  const safeCycle = Number.isFinite(cycle) ? Math.max(0, Math.floor(cycle)) : 0;
  const safePhase = Number.isFinite(phase) ? Math.max(0, Math.min(1, phase)) : 0;
  return { cycle: safeCycle, phase: safePhase, position: safeCycle + safePhase };
}

export function advanceCyclePhases(
  previous: Record<QuadPadId, number>,
  pads: Record<QuadPadId, Pick<QuadLilyPad, 'playing'>>,
  startedAt: Record<QuadPadId, number>,
  durations: Record<QuadPadId, number>,
  now: number,
): Record<QuadPadId, number> {
  let changed = false;
  const next = { ...previous };

  (Object.keys(previous) as QuadPadId[]).forEach((padId) => {
    const started = startedAt[padId];
    const duration = durations[padId];
    if (!pads[padId].playing || started <= 0 || !Number.isFinite(duration) || duration <= 0) return;
    const phase = Math.max(0, Math.min(1, (now - started) / duration));
    if (phase === previous[padId]) return;
    next[padId] = phase;
    changed = true;
  });

  return changed ? next : previous;
}

export function buildCycleMapModel(
  current: LilyCycleCompilation,
  next: LilyCycleCompilation,
): CycleMapModel {
  const currentById = new Map(current.nodes.map(node => [node.nodeId, node] as const));
  const nextById = new Map(next.nodes.map(node => [node.nodeId, node] as const));
  const ids = [
    ...current.nodes.map(node => node.nodeId),
    ...next.nodes.map(node => node.nodeId).filter(nodeId => !currentById.has(nodeId)),
  ];
  const drafts: CycleMapDraft[] = ids.map(nodeId => {
    const currentNode = currentById.get(nodeId) ?? null;
    const nextNode = nextById.get(nodeId) ?? null;
    return {
      nodeId,
      current: currentNode,
      next: nextNode,
      scaleStep: currentNode?.scaleStep ?? nextNode?.scaleStep ?? 0,
      isCenter: currentNode?.isCenter ?? nextNode?.isCenter ?? false,
      change: classifyNodeChange(currentNode, nextNode),
    };
  });
  const { currentPositions, nextPositions } = layoutCyclePair(drafts);
  const currentActiveIds = activeNodeIds(current);
  const nextActiveIds = activeNodeIds(next);
  const currentEdges = activeEdgeKeys(current, currentActiveIds);
  const nextEdges = activeEdgeKeys(next, nextActiveIds);
  const edgeKeys = [...currentEdges, ...[...nextEdges].filter(key => !currentEdges.has(key))];
  const edges = edgeKeys.flatMap<CycleMapEdge>(key => {
    const [fromId, toId] = splitEdgeKey(key);
    const inCurrent = currentEdges.has(key);
    const inNext = nextEdges.has(key);
    if (inCurrent && inNext && edgeGeometryChanged(
      fromId,
      toId,
      currentPositions,
      nextPositions,
    )) {
      return [
        { fromId, toId, layer: 'current' },
        { fromId, toId, layer: 'next' },
      ];
    }
    return [{
      fromId,
      toId,
      layer: inCurrent && inNext ? 'stable' : inCurrent ? 'current' : 'next',
    }];
  });

  return {
    nodes: drafts.map(draft => {
      const currentPosition = currentPositions.get(draft.nodeId) ?? null;
      const nextPosition = nextPositions.get(draft.nodeId) ?? null;
      const position = currentPosition ?? nextPosition ?? { x: 92, y: 50 };
      return {
        ...draft,
        ...position,
        currentX: currentPosition?.x ?? null,
        currentY: currentPosition?.y ?? null,
        nextX: nextPosition?.x ?? null,
        nextY: nextPosition?.y ?? null,
      };
    }),
    edges,
    currentActive: currentActiveIds.size,
    nextActive: nextActiveIds.size,
    changed: drafts.filter(node => node.change !== 'stable' && node.change !== 'silent').length,
    unreachable: next.nodes.filter(node => node.status === 'unreachable').length,
    outsideCycle: next.nodes.filter(node => node.status === 'outside-cycle').length,
  };
}

/**
 * Places CURRENT and NEXT on one stable relationship map.
 *
 * Unlike the time view, a musical identity owns exactly one position here.
 * Depth determines the horizontal branch column; ordering only separates
 * siblings.  Nodes that cannot sound in either cycle stay in the same figure,
 * collected in a quiet shelf at the bottom.
 */
export function buildCycleFlowModel(graph: CycleMapModel): CycleFlowModel {
  const audible = graph.nodes
    .map(node => ({
      node,
      depth: resolveFlowDepth(node),
    }))
    .filter(item => item.depth >= 0);
  const quiet = graph.nodes
    .map(node => ({
      node,
      depth: resolveFlowDepth(node),
    }))
    .filter(item => item.depth < 0)
    .sort(compareFlowItems);
  const maximumDepth = Math.max(0, ...audible.map(item => item.depth));
  const positions = new Map<string, { x: number; y: number; depth: number }>();
  const columns = new Map<number, typeof audible>();

  audible.forEach(item => {
    const column = columns.get(item.depth) ?? [];
    column.push(item);
    columns.set(item.depth, column);
  });

  [...columns.entries()]
    .sort(([left], [right]) => left - right)
    .forEach(([depth, column]) => {
      column.sort(compareFlowItems);
      column.forEach((item, index) => {
        positions.set(item.node.nodeId, {
          x: maximumDepth === 0 ? 50 : 10 + (depth / maximumDepth) * 80,
          y: spreadFlowY(index, column.length, 16, 70),
          depth,
        });
      });
    });

  quiet.forEach((item, index) => {
    positions.set(item.node.nodeId, {
      x: spreadFlowY(index, quiet.length, 22, 82),
      y: 90,
      depth: -1,
    });
  });

  const depthGap = maximumDepth > 0 ? 80 / maximumDepth : 80;
  const quietGap = quiet.length > 1 ? 60 / (quiet.length - 1) : 80;
  const maximumColumnSize = Math.max(1, ...[...columns.values()].map(column => column.length));
  const rowGap = maximumColumnSize > 1 ? 54 / (maximumColumnSize - 1) : 54;
  const nodeWidthPct = Math.max(Number.EPSILON, Math.min(16, depthGap * 0.64, quietGap * 0.64));
  const nodeHeightPct = Math.max(Number.EPSILON, Math.min(14, rowGap * 0.64));

  return {
    nodes: graph.nodes.map(node => {
      const position = positions.get(node.nodeId) ?? { x: 50, y: 90, depth: -1 };
      return {
        ...node,
        flowX: position.x,
        flowY: position.y,
        flowDepth: position.depth,
      };
    }),
    edges: buildFlowEdges(graph.nodes),
    nodeWidthPct,
    nodeHeightPct,
    compact: nodeWidthPct < 9 || nodeHeightPct < 8,
  };
}

interface FlowLayoutItem {
  node: CycleMapNode;
  depth: number;
}

function resolveFlowDepth(node: CycleMapNode): number {
  const depths = [node.current, node.next]
    .filter(candidate => candidate && candidate.status !== 'unreachable')
    .map(candidate => candidate?.depth)
    .filter((depth): depth is number => typeof depth === 'number' && Number.isFinite(depth));
  return depths.length ? Math.max(0, Math.min(...depths)) : -1;
}

function compareFlowItems(left: FlowLayoutItem, right: FlowLayoutItem): number {
  return left.node.nodeId.localeCompare(right.node.nodeId);
}

function spreadFlowY(index: number, count: number, start: number, end: number): number {
  if (count <= 1) return (start + end) / 2;
  return start + (index / (count - 1)) * (end - start);
}

function buildFlowEdges(nodes: readonly CycleMapNode[]): CycleMapEdge[] {
  const currentEdges = structuralEdgeKeys(nodes, 'current');
  const nextEdges = structuralEdgeKeys(nodes, 'next');
  const keys = [...currentEdges, ...[...nextEdges].filter(key => !currentEdges.has(key))];
  return keys.map(key => {
    const [fromId, toId] = splitEdgeKey(key);
    const inCurrent = currentEdges.has(key);
    const inNext = nextEdges.has(key);
    const layer: CycleMapEdgeLayer = inCurrent && inNext ? 'stable' : inNext ? 'next' : 'current';
    return { fromId, toId, layer };
  });
}

function structuralEdgeKeys(
  nodes: readonly CycleMapNode[],
  side: 'current' | 'next',
): Set<string> {
  const structuralIds = new Set(nodes
    .filter(node => node[side] && node[side]?.status !== 'unreachable')
    .map(node => node.nodeId));
  return new Set(nodes.flatMap(node => {
    const appearance = node[side];
    if (!appearance || appearance.status === 'unreachable' || !appearance.parentId) return [];
    if (!structuralIds.has(appearance.parentId)) return [];
    return [edgeKey(appearance.parentId, node.nodeId)];
  }));
}

interface CycleMapDraft {
  nodeId: string;
  current: LilyCycleCompiledNode | null;
  next: LilyCycleCompiledNode | null;
  scaleStep: number;
  isCenter: boolean;
  change: CycleMapNodeChange;
}

function classifyNodeChange(
  current: LilyCycleCompiledNode | null,
  next: LilyCycleCompiledNode | null,
): CycleMapNodeChange {
  const currentActive = current?.status === 'active';
  const nextActive = next?.status === 'active';
  if (!currentActive && !nextActive) return 'silent';
  if (!currentActive) return 'entering';
  if (!nextActive) return 'leaving';
  if (current.parentId !== next.parentId) return 'rewired';
  if (current.offsetMs !== next.offsetMs) return 'retimed';
  if (current.scaleStep !== next.scaleStep) return 'repitched';
  return 'stable';
}

function edgeGeometryChanged(
  fromId: string,
  toId: string,
  currentPositions: Map<string, { x: number; y: number }>,
  nextPositions: Map<string, { x: number; y: number }>,
): boolean {
  const currentFrom = currentPositions.get(fromId);
  const currentTo = currentPositions.get(toId);
  const nextFrom = nextPositions.get(fromId);
  const nextTo = nextPositions.get(toId);
  if (!currentFrom || !currentTo || !nextFrom || !nextTo) return true;
  return !samePosition(currentFrom, nextFrom) || !samePosition(currentTo, nextTo);
}

function samePosition(
  left: { x: number; y: number },
  right: { x: number; y: number },
): boolean {
  return Math.abs(left.x - right.x) < 0.001 && Math.abs(left.y - right.y) < 0.001;
}

function activeNodeIds(compilation: LilyCycleCompilation): Set<string> {
  return new Set(compilation.nodes
    .filter(node => node.status === 'active')
    .map(node => node.nodeId));
}

function activeEdgeKeys(compilation: LilyCycleCompilation, activeIds: Set<string>): Set<string> {
  return new Set(compilation.edges
    .filter(edge => activeIds.has(edge.fromId) && activeIds.has(edge.toId))
    .map(edge => edgeKey(edge.fromId, edge.toId)));
}

function edgeKey(fromId: string, toId: string): string {
  return `${fromId}\u0000${toId}`;
}

function splitEdgeKey(key: string): [string, string] {
  const split = key.indexOf('\u0000');
  return [key.slice(0, split), key.slice(split + 1)];
}

type LayoutSide = 'shared' | 'current' | 'next';

interface LayoutAppearance {
  nodeId: string;
  node: LilyCycleCompiledNode;
  side: LayoutSide;
  order: number;
}

function layoutCyclePair(
  drafts: readonly CycleMapDraft[],
): {
  currentPositions: Map<string, { x: number; y: number }>;
  nextPositions: Map<string, { x: number; y: number }>;
} {
  const columns = new Map<number, LayoutAppearance[]>();
  const addAppearance = (appearance: LayoutAppearance) => {
    const wave = appearance.node.wave ?? 0;
    const column = columns.get(wave) ?? [];
    column.push(appearance);
    columns.set(wave, column);
  };

  drafts.forEach(draft => {
    const currentActive = draft.current?.status === 'active';
    const nextActive = draft.next?.status === 'active';
    const shared = currentActive
      && nextActive
      && (draft.change === 'stable' || draft.change === 'repitched');
    if (shared) {
      const node = draft.current!;
      addAppearance({
        nodeId: draft.nodeId,
        node,
        side: 'shared',
        order: Math.min(
          draft.current?.order ?? Number.MAX_SAFE_INTEGER,
          draft.next?.order ?? Number.MAX_SAFE_INTEGER,
        ),
      });
      return;
    }
    if (currentActive) {
      addAppearance({
        nodeId: draft.nodeId,
        node: draft.current!,
        side: 'current',
        order: draft.current?.order ?? Number.MAX_SAFE_INTEGER,
      });
    }
    if (nextActive) {
      addAppearance({
        nodeId: draft.nodeId,
        node: draft.next!,
        side: 'next',
        order: draft.next?.order ?? Number.MAX_SAFE_INTEGER,
      });
    }
  });

  const currentPositions = new Map<string, { x: number; y: number }>();
  const nextPositions = new Map<string, { x: number; y: number }>();
  [...columns.entries()].sort(([left], [right]) => left - right).forEach(([wave, column]) => {
    column.sort((left, right) => (
      left.order - right.order
      || left.nodeId.localeCompare(right.nodeId)
      || sideOrder(left.side) - sideOrder(right.side)
    ));
    column.forEach((appearance, index) => {
      const position = {
        x: phaseToX(appearance.node.phase ?? wave / 4),
        y: column.length === 1 ? 50 : 18 + (index / (column.length - 1)) * 64,
      };
      if (appearance.side !== 'next') currentPositions.set(appearance.nodeId, position);
      if (appearance.side !== 'current') nextPositions.set(appearance.nodeId, position);
    });
  });
  return { currentPositions, nextPositions };
}

function sideOrder(side: LayoutSide): number {
  if (side === 'shared') return 0;
  return side === 'current' ? 1 : 2;
}

export function phaseToX(phase: number): number {
  const safe = Number.isFinite(phase) ? Math.max(0, Math.min(1, phase)) : 0;
  return 12 + safe * 76;
}
