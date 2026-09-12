import type { DrawMotionKeyframe, LilyNodeMotion } from './motion.ts';
import { parseCanvasDecoration, type CanvasDecoration } from './canvasDecoration.ts';
import {
  detachNodesFromFormations,
  getPadFormations,
  type LilyNoteFormation,
} from './groupMotion.ts';

export type { LilyNoteFormation } from './groupMotion.ts';
export { FORMATION_SHAPES } from './groupMotion.ts';

export const QUAD_PAD_IDS = ['A', 'B', 'C', 'D'] as const;

export type QuadPadId = typeof QUAD_PAD_IDS[number];
export type Fm1ToneSelection = 'follow' | number;

export interface LilyNodeEndpointPitch {
  bStep: number;
}

export interface LilyNode {
  id: string;
  x: number;
  y: number;
  range: number;
  scaleStep: number;
  isCenter: boolean;
  motion?: LilyNodeMotion;
  endpointPitch?: LilyNodeEndpointPitch;
  /** 停留多少传播步后继续传递；显式设置时也作为音符时值。 */
  holdSteps?: number;
  /** 静音：仍参与传播，但不发声 */
  muted?: boolean;
  /** 隐藏：不参与传播与发声（演奏对比用） */
  hidden?: boolean;
}

export interface QuadLilyPad {
  id: QuadPadId;
  nodes: LilyNode[];
  decoration?: CanvasDecoration;
  intervalMs: number;
  /** 每个乐句包含的传播步数；旧图案默认为四步。 */
  phraseSteps: number;
  phraseMode?: 'auto' | 'fixed';
  playing: boolean;
  loop: boolean;
  locked: boolean;
  velocity: number;
  rememberedTone: Fm1ToneSelection;
  soundPresetId?: string;
  rootMidi: number;
  scaleKey: string;
  octaveTranspose: number;
  /** MIDI Channel 1–16（一端口四分轨） */
  midiChannel: number;
  /** 共享编队列表：每个编队是一个可联动的组合单位（G1 / G2 / …） */
  formations?: LilyNoteFormation[];
  /**
   * @deprecated 旧单编队字段；解析时迁移进 formations，新写入请只用 formations
   */
  formation?: LilyNoteFormation | null;
}

export interface QuadLilyWorkspace {
  kind: 'gemidi.quad-lily-workspace';
  version: 1;
  masterPlaying: boolean;
  fm1Tone: Fm1ToneSelection;
  pads: Record<QuadPadId, QuadLilyPad>;
}

export type QuadLilyPadPatch = Partial<Omit<QuadLilyPad, 'id' | 'nodes'>>;

export interface NewLilyNode {
  id: string;
  x: number;
  y: number;
  range?: number;
  scaleStep?: number;
  endpointPitch?: LilyNodeEndpointPitch;
}

export interface LilyNodePatch {
  x?: number;
  y?: number;
  range?: number;
  scaleStep?: number;
  motion?: LilyNodeMotion;
  endpointPitch?: LilyNodeEndpointPitch | null;
  holdSteps?: number | null;
  muted?: boolean | null;
  hidden?: boolean | null;
}

export interface LilyCycleEvent {
  nodeId: string;
  delayMs: number;
  depth: number;
  scaleStep: number;
}

export type LilyCycleNodeStatus = 'active' | 'unreachable' | 'outside-cycle';

export interface LilyCycleCompiledNode {
  nodeId: string;
  parentId: string | null;
  status: LilyCycleNodeStatus;
  offsetMs: number | null;
  phase: number | null;
  depth: number | null;
  order: number | null;
  wave: number | null;
  scaleStep: number;
  isCenter: boolean;
  x: number;
  y: number;
  range: number;
}

export interface LilyCycleEdge {
  fromId: string;
  toId: string;
  distance: number;
  sourceRange: number;
  orderWithinParent: number;
}

export interface LilyCycleWave {
  wave: number;
  offsetMs: number;
  phase: number;
  nodeIds: string[];
}

export interface LilyCycleCompilation {
  kind: 'gemidi.lily-cycle-compilation';
  version: 1;
  padId: QuadPadId;
  intervalMs: number;
  propagationStepMs: number;
  nodes: LilyCycleCompiledNode[];
  edges: LilyCycleEdge[];
  waves: LilyCycleWave[];
  events: LilyCycleEvent[];
}

export const DEFAULT_PHRASE_STEPS = 4;
export const MIN_PHRASE_STEPS = 4;
export const MAX_PHRASE_STEPS = 256;

export function normalizeNodeHoldSteps(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(1, Math.min(MAX_PHRASE_STEPS, Math.round(value))) : 1;
}

export function normalizePhraseSteps(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(MIN_PHRASE_STEPS, Math.min(MAX_PHRASE_STEPS, Math.round(value)))
    : DEFAULT_PHRASE_STEPS;
}

/** BPM 基准保持不变；一个传播步为四分之一拍，乐句独立决定重新起拍时间。 */
export function getPadCycleDurationMs(pad: Pick<QuadLilyPad, 'intervalMs'> & { phraseSteps?: number; phraseMode?: 'auto' | 'fixed'; nodes?: LilyNode[] }): number {
  if (pad.phraseMode === 'auto' && pad.nodes) return compileLilyCycle(pad as QuadLilyPad).intervalMs;
  return pad.intervalMs / 4 * normalizePhraseSteps(pad.phraseSteps);
}

export function createQuadLilyWorkspace(): QuadLilyWorkspace {
  return {
    kind: 'gemidi.quad-lily-workspace',
    version: 1,
    masterPlaying: false,
    fm1Tone: 'follow',
    pads: {
      A: createDefaultPad('A'),
      B: createDefaultPad('B'),
      C: createDefaultPad('C'),
      D: createDefaultPad('D'),
    },
  };
}

export function updateLilyPad(
  workspace: QuadLilyWorkspace,
  padId: QuadPadId,
  patch: QuadLilyPadPatch,
): QuadLilyWorkspace {
  return replacePad(workspace, padId, {
    ...workspace.pads[padId], ...patch,
    phraseSteps: normalizePhraseSteps(patch.phraseSteps ?? workspace.pads[padId].phraseSteps),
  });
}

export function patchAllPadTiming(workspace: QuadLilyWorkspace, patch: QuadLilyPadPatch): QuadLilyWorkspace {
  const timing: QuadLilyPadPatch = {};
  for (const key of ['intervalMs', 'velocity', 'phraseSteps', 'phraseMode'] as const) {
    if (patch[key] !== undefined) Object.assign(timing, { [key]: patch[key] });
  }
  return QUAD_PAD_IDS.reduce((next, id) => updateLilyPad(next, id, timing), workspace);
}

export function addLilyNode(
  workspace: QuadLilyWorkspace,
  padId: QuadPadId,
  input: NewLilyNode,
): QuadLilyWorkspace {
  const pad = workspace.pads[padId];
  if (pad.locked || input.id.trim().length === 0 || pad.nodes.some(({ id }) => id === input.id)) {
    return workspace;
  }
  const node: LilyNode = {
    id: input.id,
    x: clampPadCoord(input.x, 0.5),
    y: clampPadCoord(input.y, 0.5),
    range: clampUnit(input.range ?? 0.225, 0.225),
    scaleStep: normalizeInteger(input.scaleStep, 0),
    isCenter: false,
    ...(isEndpointPitch(input.endpointPitch)
      ? { endpointPitch: cloneEndpointPitch(input.endpointPitch) }
      : {}),
  };
  return replacePad(workspace, padId, { ...pad, nodes: [...pad.nodes, node] });
}

export function moveLilyNode(
  workspace: QuadLilyWorkspace,
  padId: QuadPadId,
  nodeId: string,
  position: Pick<LilyNodePatch, 'x' | 'y'>,
): QuadLilyWorkspace {
  return updateLilyNode(workspace, padId, nodeId, position);
}

export function updateLilyNode(
  workspace: QuadLilyWorkspace,
  padId: QuadPadId,
  nodeId: string,
  patch: LilyNodePatch,
): QuadLilyWorkspace {
  const pad = workspace.pads[padId];
  const nodeIndex = pad.nodes.findIndex(({ id }) => id === nodeId);
  if (nodeIndex < 0) return workspace;

  const source = pad.nodes[nodeIndex];
  const next: LilyNode = {
    ...source,
    ...(source.endpointPitch ? { endpointPitch: cloneEndpointPitch(source.endpointPitch) } : {}),
    ...(!pad.locked && patch.x !== undefined ? { x: clampPadCoord(patch.x, source.x) } : {}),
    ...(!pad.locked && patch.y !== undefined ? { y: clampPadCoord(patch.y, source.y) } : {}),
    ...(!pad.locked && patch.range !== undefined ? { range: clampUnit(patch.range, source.range) } : {}),
    ...(patch.scaleStep !== undefined ? {
      scaleStep: normalizeInteger(patch.scaleStep, source.scaleStep),
    } : {}),
    ...(!pad.locked && patch.motion !== undefined ? { motion: cloneMotion(patch.motion) } : {}),
  };
  if (patch.endpointPitch === null) {
    delete next.endpointPitch;
  } else if (isEndpointPitch(patch.endpointPitch)) {
    next.endpointPitch = cloneEndpointPitch(patch.endpointPitch);
  }
  if (patch.holdSteps === null) delete next.holdSteps;
  else if (patch.holdSteps !== undefined) next.holdSteps = normalizeNodeHoldSteps(patch.holdSteps);
  if (patch.muted === null) delete next.muted;
  else if (typeof patch.muted === 'boolean') next.muted = patch.muted;
  if (patch.hidden === null) delete next.hidden;
  else if (typeof patch.hidden === 'boolean') next.hidden = patch.hidden;
  const nodes = pad.nodes.map((node, index) => index === nodeIndex ? next : node);
  return replacePad(workspace, padId, { ...pad, nodes });
}

export function deleteLilyNode(
  workspace: QuadLilyWorkspace,
  padId: QuadPadId,
  nodeId: string,
): QuadLilyWorkspace {
  const pad = workspace.pads[padId];
  const target = pad.nodes.find(({ id }) => id === nodeId);
  if (pad.locked || !target || target.isCenter) return workspace;
  return replacePad(workspace, padId, {
    ...pad,
    nodes: pad.nodes.filter(({ id }) => id !== nodeId),
    formations: detachNodesFromFormations(getPadFormations(pad), [nodeId]),
  });
}

export function compileLilyCycle(pad: QuadLilyPad): LilyCycleCompilation {
  const center = pad.nodes.find(({ isCenter }) => isCenter);
  const propagationStepMs = pad.intervalMs / 4;
  let cycleDurationMs = propagationStepMs * normalizePhraseSteps(pad.phraseSteps);
  if (!center) {
    return {
      kind: 'gemidi.lily-cycle-compilation',
      version: 1,
      padId: pad.id,
      intervalMs: cycleDurationMs,
      propagationStepMs,
      nodes: pad.nodes.map(node => ({
        nodeId: node.id,
        parentId: null,
        status: 'unreachable',
        offsetMs: null,
        phase: null,
        depth: null,
        order: null,
        wave: null,
        scaleStep: node.scaleStep,
        isCenter: node.isCenter,
        x: node.x,
        y: node.y,
        range: node.range,
      })),
      edges: [],
      waves: [],
      events: [],
    };
  }

  type ScheduledNode = LilyCycleEvent & {
    node: LilyNode;
    parentId: string | null;
    sequence: number;
  };
  let sequence = 0;
  const first: ScheduledNode = {
    node: center,
    nodeId: center.id,
    parentId: null,
    delayMs: 0,
    depth: 0,
    scaleStep: center.scaleStep,
    sequence: sequence++,
  };
  const pending = [first];
  const scheduled = [first];
  const edges: LilyCycleEdge[] = [];
  const visited = new Set([center.id]);

  const chordByNode = new Map<string, LilyNoteFormation>();
  for (const f of getPadFormations(pad)) if (f.shape === 'chord') for (const id of f.nodeIds) if (!chordByNode.has(id)) chordByNode.set(id, f);
  const chordFor = (id: string) => chordByNode.get(id);
  const holdStepsFor = (node: LilyNode) => normalizeNodeHoldSteps(chordFor(node.id)?.holdSteps ?? node.holdSteps);
  const joinChord = (anchor: ScheduledNode) => {
    const chord=chordFor(anchor.nodeId);
    if(!chord)return;
    for(const id of chord.nodeIds){
      const node=pad.nodes.find(n=>n.id===id&&!n.hidden);
      if(!node||visited.has(id))continue;
      visited.add(id);
      const event:ScheduledNode={...anchor,node,nodeId:id,scaleStep:node.scaleStep,parentId:anchor.nodeId,sequence:sequence++};
      pending.push(event);scheduled.push(event);
      edges.push({fromId:anchor.nodeId,toId:id,distance:distance(anchor.node,node),sourceRange:anchor.node.range,orderWithinParent:0});
    }
  };
  joinChord(first);

  while (pending.length > 0) {
    pending.sort(compareScheduledNodes);
    const sourceEvent = pending.shift()!;
    const neighbors = pad.nodes
      .filter((node) => (
        !node.hidden
        && !visited.has(node.id)
        && distance(sourceEvent.node, node) <= sourceEvent.node.range
      ))
      .sort((left, right) => (
        distance(sourceEvent.node, left) - distance(sourceEvent.node, right)
        || left.id.localeCompare(right.id)
      ));

    let targetIndex=0;
    neighbors.forEach((node) => {
      if(visited.has(node.id))return;
      const index=targetIndex++;
      visited.add(node.id);
      const event: ScheduledNode = {
        node,
        nodeId: node.id,
        parentId: sourceEvent.nodeId,
        delayMs: sourceEvent.delayMs + (index + holdStepsFor(sourceEvent.node)) * propagationStepMs,
        depth: sourceEvent.depth + 1,
        scaleStep: node.scaleStep,
        sequence: sequence++,
      };
      edges.push({
        fromId: sourceEvent.nodeId,
        toId: node.id,
        distance: distance(sourceEvent.node, node),
        sourceRange: sourceEvent.node.range,
        orderWithinParent: index,
      });
      pending.push(event);
      scheduled.push(event);
      joinChord(event);
    });
  }

  const ordered = scheduled.sort(compareScheduledNodes);
  if (pad.phraseMode === 'auto') {
    const sounding = ordered.filter(event => !event.node.muted && !event.node.hidden);
    cycleDurationMs = Math.max(1, ...sounding.map(event => Math.round(event.delayMs / propagationStepMs) + holdStepsFor(event.node))) * propagationStepMs;
  }
  const waveByOffset = new Map<number, number>();
  ordered.forEach(({ delayMs }) => {
    if (!waveByOffset.has(delayMs)) waveByOffset.set(delayMs, waveByOffset.size);
  });
  const eventByNodeId = new Map(ordered.map((event, order) => [event.nodeId, { event, order }]));
  const waves = [...waveByOffset.entries()].map(([offsetMs, wave]): LilyCycleWave => ({
    wave,
    offsetMs,
    phase: cycleDurationMs > 0 ? offsetMs / cycleDurationMs : 0,
    nodeIds: ordered.filter(event => event.delayMs === offsetMs).map(event => event.nodeId),
  }));
  const nodes = pad.nodes.map((node): LilyCycleCompiledNode => {
    const scheduledNode = eventByNodeId.get(node.id);
    if (!scheduledNode) {
      return {
        nodeId: node.id,
        parentId: null,
        status: 'unreachable',
        offsetMs: null,
        phase: null,
        depth: null,
        order: null,
        wave: null,
        scaleStep: node.scaleStep,
        isCenter: node.isCenter,
        x: node.x,
        y: node.y,
        range: node.range,
      };
    }
    const { event, order } = scheduledNode;
    return {
      nodeId: node.id,
      parentId: event.parentId,
      status: event.delayMs < cycleDurationMs ? 'active' : 'outside-cycle',
      offsetMs: event.delayMs,
      phase: cycleDurationMs > 0 ? event.delayMs / cycleDurationMs : 0,
      depth: event.depth,
      order,
      wave: waveByOffset.get(event.delayMs) ?? null,
      scaleStep: node.scaleStep,
      isCenter: node.isCenter,
      x: node.x,
      y: node.y,
      range: node.range,
    };
  });

  return {
    kind: 'gemidi.lily-cycle-compilation',
    version: 1,
    padId: pad.id,
    intervalMs: cycleDurationMs,
    propagationStepMs,
    nodes,
    edges,
    waves,
    events: ordered.map(({ nodeId, delayMs, depth, scaleStep }) => ({
      nodeId,
      delayMs,
      depth,
      scaleStep,
    })),
  };
}

export function planLilyCycle(pad: QuadLilyPad): LilyCycleEvent[] {
  return compileLilyCycle(pad).events;
}

export function clearLilyPad(
  workspace: QuadLilyWorkspace,
  padId: QuadPadId,
): QuadLilyWorkspace {
  const pad = workspace.pads[padId];
  const center = pad.nodes.find(({ isCenter }) => isCenter) ?? createDefaultPad(padId).nodes[0];
  return replacePad(workspace, padId, { ...pad, nodes: [center], formations: [], decoration: undefined });
}

export function resetLilyPad(
  workspace: QuadLilyWorkspace,
  padId: QuadPadId,
): QuadLilyWorkspace {
  return replacePad(workspace, padId, createDefaultPad(padId));
}

export function parseQuadLilyWorkspace(value: unknown): QuadLilyWorkspace {
  const defaults = createQuadLilyWorkspace();
  if (typeof value !== 'string') return defaults;

  let decoded: unknown;
  try {
    decoded = JSON.parse(value) as unknown;
  } catch {
    return defaults;
  }
  if (!isRecord(decoded)) return defaults;
  const storedPads = isRecord(decoded.pads) ? decoded.pads : {};

  return {
    kind: 'gemidi.quad-lily-workspace',
    version: 1,
    masterPlaying: readBoolean(decoded.masterPlaying, defaults.masterPlaying),
    fm1Tone: readTone(decoded.fm1Tone, defaults.fm1Tone),
    pads: {
      A: parseStoredPad(storedPads.A, defaults.pads.A),
      B: parseStoredPad(storedPads.B, defaults.pads.B),
      C: parseStoredPad(storedPads.C, defaults.pads.C),
      D: parseStoredPad(storedPads.D, defaults.pads.D),
    },
  };
}

function createDefaultPad(id: QuadPadId): QuadLilyPad {
  return {
    id,
    nodes: [{
      id: 'center',
      x: 0.5,
      y: 0.5,
      range: 0.225,
      scaleStep: 0,
      isCenter: true,
    }],
    intervalMs: 600,
    phraseSteps: DEFAULT_PHRASE_STEPS,
    phraseMode: 'fixed',
    playing: false,
    loop: true,
    locked: false,
    velocity: 100 / 127,
    rememberedTone: 'follow',
    rootMidi: 60,
    scaleKey: 'majorPentatonic',
    octaveTranspose: 0,
    midiChannel: ({ A: 1, B: 2, C: 3, D: 4 } as const)[id],
    formations: [],
  };
}

function replacePad(
  workspace: QuadLilyWorkspace,
  padId: QuadPadId,
  pad: QuadLilyPad,
): QuadLilyWorkspace {
  return {
    ...workspace,
    pads: {
      ...workspace.pads,
      [padId]: pad,
    },
  };
}

function clampUnit(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

/** 节点坐标：宽幅画布可远超出 0–1；仅防极端异常值 */
function clampPadCoord(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(-8, Math.min(9, value));
}

function normalizeInteger(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
}

function distance(left: LilyNode, right: LilyNode): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function compareScheduledNodes(
  left: LilyCycleEvent & { sequence: number },
  right: LilyCycleEvent & { sequence: number },
): number {
  return left.delayMs - right.delayMs || left.depth - right.depth || left.sequence - right.sequence;
}

function parseStoredPad(value: unknown, defaults: QuadLilyPad): QuadLilyPad {
  if (!isRecord(value)) return defaults;
  const decoration = parseCanvasDecoration(value.decoration);
  return {
    id: defaults.id,
    nodes: parseStoredNodes(value.nodes, defaults.nodes[0]),
    ...(decoration ? { decoration } : {}),
    intervalMs: readClampedInteger(value.intervalMs, defaults.intervalMs, 100, 1_500),
    phraseSteps: normalizePhraseSteps(value.phraseSteps),
    phraseMode: value.phraseMode === 'auto' ? 'auto' : 'fixed',
    playing: readBoolean(value.playing, defaults.playing),
    loop: readBoolean(value.loop, defaults.loop),
    locked: readBoolean(value.locked, defaults.locked),
    velocity: readClampedNumber(value.velocity, defaults.velocity, 0, 200 / 127),
    rememberedTone: readTone(value.rememberedTone, defaults.rememberedTone),
    ...(typeof value.soundPresetId === 'string' && value.soundPresetId.trim() ? {soundPresetId:value.soundPresetId} : {}),
    rootMidi: readClampedInteger(value.rootMidi, defaults.rootMidi, 0, 127),
    scaleKey: readNonEmptyString(value.scaleKey, defaults.scaleKey),
    octaveTranspose: readClampedInteger(value.octaveTranspose, defaults.octaveTranspose, -3, 3),
    midiChannel: readClampedInteger(value.midiChannel, defaults.midiChannel, 1, 16),
    formations: parseStoredFormations(value),
  };
}

function parseStoredNodes(value: unknown, defaultCenter: LilyNode): LilyNode[] {
  if (!Array.isArray(value)) return [{ ...defaultCenter }];
  const seenIds = new Set<string>();
  let center: LilyNode | null = null;
  const nodes: LilyNode[] = [];

  value.forEach((candidate) => {
    if (!isRecord(candidate)) return;
    if (
      typeof candidate.id !== 'string'
      || candidate.id.trim().length === 0
      || seenIds.has(candidate.id)
      || !Number.isFinite(candidate.x)
      || !Number.isFinite(candidate.y)
      || !Number.isFinite(candidate.range)
      || !Number.isInteger(candidate.scaleStep)
      || typeof candidate.isCenter !== 'boolean'
    ) return;
    if (candidate.isCenter && center) return;

    const motion = parseStoredMotion(candidate.motion);
    const endpointPitch = parseStoredEndpointPitch(candidate.endpointPitch);
    const node: LilyNode = {
      id: candidate.id,
      x: clampPadCoord(candidate.x as number, defaultCenter.x),
      y: clampPadCoord(candidate.y as number, defaultCenter.y),
      range: clampUnit(candidate.range as number, defaultCenter.range),
      scaleStep: candidate.scaleStep as number,
      isCenter: candidate.isCenter,
      ...(motion ? { motion } : {}),
      ...(endpointPitch ? { endpointPitch } : {}),
      ...(isFiniteNumber(candidate.holdSteps) ? { holdSteps: normalizeNodeHoldSteps(candidate.holdSteps) } : {}),
      ...(candidate.muted === true ? { muted: true } : {}),
      ...(candidate.hidden === true ? { hidden: true } : {}),
    };
    seenIds.add(node.id);
    if (node.isCenter) center = node;
    else nodes.push(node);
  });

  return [center ?? { ...defaultCenter }, ...nodes];
}

function parseStoredMotion(value: unknown): LilyNodeMotion | undefined {
  if (!isRecord(value) || typeof value.mode !== 'string') return undefined;
  if (value.mode === 'off') return { mode: 'off' };

  const timing = {
    ...(isFiniteNumber(value.rateCycles) && value.rateCycles > 0
      ? { rateCycles: Math.max(0.25, Math.min(64, value.rateCycles)) }
      : {}),
    ...(isFiniteNumber(value.phaseOffset) ? { phaseOffset: value.phaseOffset } : {}),
    ...(value.direction === 1 || value.direction === -1 ? { direction: value.direction } : {}),
  };

  if (value.mode === 'orbit') {
    return {
      mode: 'orbit',
      ...timing,
      ...(isFiniteNumber(value.amount) ? { amount: clampUnit(value.amount, 0) } : {}),
    };
  }

  if (value.mode === 'pendulum') {
    return {
      mode: 'pendulum',
      ...timing,
      ...(isFiniteNumber(value.amount) ? { amount: clampUnit(value.amount, 0) } : {}),
      ...(isFiniteNumber(value.angleDegrees) ? { angleDegrees: value.angleDegrees } : {}),
    };
  }

  if (value.mode === 'draw') {
    const normalizedPath = Array.isArray(value.path)
      ? value.path.flatMap((frame): DrawMotionKeyframe[] => {
        if (!isRecord(frame)
          || !isFiniteNumber(frame.phase)
          || !isFiniteNumber(frame.dx)
          || !isFiniteNumber(frame.dy)) return [];
        return [{
          phase: Math.max(0, Math.min(1, frame.phase)),
          dx: Math.max(-1, Math.min(1, frame.dx)),
          dy: Math.max(-1, Math.min(1, frame.dy)),
        }];
      })
      : [];
    const byPhase = new Map<number, DrawMotionKeyframe>();
    normalizedPath
      .sort((left, right) => left.phase - right.phase)
      .forEach(frame => byPhase.set(frame.phase, frame));
    const uniquePath = [...byPhase.values()];
    const path = uniquePath.length <= 256
      ? uniquePath
      : Array.from({ length: 256 }, (_, index) => (
        uniquePath[Math.round(index * (uniquePath.length - 1) / 255)]
      ));
    return { mode: 'draw', ...timing, ...(path.length ? { path } : {}) };
  }

  if (value.mode === 'flash') {
    return {
      mode: 'flash',
      ...timing,
      ...(isFiniteNumber(value.targetDx) ? { targetDx: Math.max(-1, Math.min(1, value.targetDx)) } : {}),
      ...(isFiniteNumber(value.targetDy) ? { targetDy: Math.max(-1, Math.min(1, value.targetDy)) } : {}),
    };
  }

  return undefined;
}

function parseStoredFormations(value: Record<string, unknown>): LilyNoteFormation[] {
  if (Array.isArray(value.formations)) {
    const parsed = value.formations
      .map((item) => parseStoredFormation(item))
      .filter((item): item is LilyNoteFormation => Boolean(item));
    if (parsed.length > 0) return dedupeFormationsById(parsed);
  }
  const legacy = parseStoredFormation(value.formation);
  return legacy ? [legacy] : [];
}

function dedupeFormationsById(formations: LilyNoteFormation[]): LilyNoteFormation[] {
  const seen = new Set<string>();
  const result: LilyNoteFormation[] = [];
  for (const formation of formations) {
    if (seen.has(formation.id)) continue;
    seen.add(formation.id);
    result.push(formation);
  }
  return result;
}

function parseStoredFormation(value: unknown): LilyNoteFormation | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) return null;
  if (!Array.isArray(value.nodeIds) || value.nodeIds.length < 2) return null;
  const nodeIds = value.nodeIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
  if (nodeIds.length < 2) return null;
  const shape = value.shape === 'circle' || value.shape === 'line' || value.shape === 'flash' || value.shape === 'chord'
    ? value.shape
    : null;
  if (!shape) return null;
  if (!isFiniteNumber(value.centerX) || !isFiniteNumber(value.centerY) || !isFiniteNumber(value.radius)) {
    return null;
  }
  return {
    nodeIds,
    shape,
    ...(isFiniteNumber(value.holdSteps) ? { holdSteps: Math.max(1, Math.min(64, Math.round(value.holdSteps))) } : {}),
    id: typeof value.id === 'string' && value.id.trim() ? value.id.trim() : 'G1',
    centerX: clampUnit(value.centerX, 0.5),
    centerY: clampUnit(value.centerY, 0.5),
    radius: clampUnit(value.radius, 0.12),
    rateCycles: isFiniteNumber(value.rateCycles) && value.rateCycles > 0
      ? Math.max(1, Math.min(64, Math.round(value.rateCycles)))
      : 4,
    ...(isFiniteNumber(value.phaseOffset) ? { phaseOffset: value.phaseOffset } : {}),
    ...(value.direction === 1 || value.direction === -1 ? { direction: value.direction } : {}),
    ...(isFiniteNumber(value.angleDegrees) ? { angleDegrees: value.angleDegrees } : {}),
    ...(isFiniteNumber(value.flashDx) ? { flashDx: Math.max(-1, Math.min(1, value.flashDx)) } : {}),
    ...(isFiniteNumber(value.flashDy) ? { flashDy: Math.max(-1, Math.min(1, value.flashDy)) } : {}),
  };
}

function cloneMotion(motion: LilyNodeMotion): LilyNodeMotion {
  return motion.mode === 'draw'
    ? { ...motion, ...(motion.path ? { path: motion.path.map(frame => ({ ...frame })) } : {}) }
    : { ...motion };
}

function parseStoredEndpointPitch(value: unknown): LilyNodeEndpointPitch | undefined {
  return isEndpointPitch(value) ? cloneEndpointPitch(value) : undefined;
}

function isEndpointPitch(value: unknown): value is LilyNodeEndpointPitch {
  return isRecord(value) && Number.isInteger(value.bStep);
}

function cloneEndpointPitch(endpointPitch: LilyNodeEndpointPitch): LilyNodeEndpointPitch {
  return { bStep: endpointPitch.bStep };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readTone(value: unknown, fallback: Fm1ToneSelection): Fm1ToneSelection {
  return value === 'follow' || (Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 128)
    ? value as Fm1ToneSelection
    : fallback;
}

function readNonEmptyString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function readClampedInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.round(value)))
    : fallback;
}

function readClampedNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
