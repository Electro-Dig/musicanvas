import { useUiText } from '../uiLocale';
import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, LayoutPanelLeft, Map } from 'lucide-react';
import { ROOT_NOTES, SCALES, type ScaleDefinition } from '../musicTheory';
import { MAX_PHRASE_STEPS, normalizePhraseSteps } from '../core';
import type {
  LilyCycleCompilation,
  LilyNode,
  LilyNodePatch,
  QuadLilyPad,
  QuadLilyPadPatch,
  QuadPadId,
} from '../core';
import CycleTrace from '../CycleTrace';
import PhaseComparison, { type PhaseComparisonPad } from '../PhaseComparison';
import MultiPadOverview from '../MultiPadOverview';
import type { LilyNodeMotion } from '../motion';
import {
  FORMATION_SHAPES,
  type FormationShape,
  type LilyNoteFormation,
} from '../groupMotion';
import type { NodePresentation } from '../nodePresentation';
import type { DrawCaptureStatus } from '../NodeMotionControls';
import {
  bpmFromIntervalMs,
  intervalMsFromBpm,
  MAX_BPM,
  MAX_VOLUME,
  MIN_BPM,
  MIN_VOLUME,
  velocityFromVolume,
  volumeFromVelocity,
} from '../tempo';
import { SoftSelect } from '../ui/SoftSelect';
import { PitchDirectInput } from './PitchDirectInput';
import { ScrubbableWheelInput } from './ScrubbableWheelInput';

/** 侧栏默认/最小宽度；可向外拖到 MAX */
export const STUDIO_TOWER_WIDTH_MIN = 317;
export const STUDIO_TOWER_WIDTH_MAX = 560;
export const STUDIO_TOWER_WIDTH_STORAGE_KEY = 'gemidi.studioTowerWidth.v1';

export function clampStudioTowerWidth(value: number): number {
  return Math.max(STUDIO_TOWER_WIDTH_MIN, Math.min(STUDIO_TOWER_WIDTH_MAX, Math.round(value)));
}

const ROOT_NOTE_OPTIONS = ROOT_NOTES.map((r) => ({ value: String(r.midiValue), label: r.name }));
const OCTAVE_OPTIONS = [-2, -1, 0, 1, 2].map((o) => ({
  value: String(o),
  label: `${o > 0 ? `+${o}` : `${o}`} OCT`,
}));
const SCALE_OPTIONS = SCALES.filter((s) => s.intervals.length).map((s) => ({
  value: s.key,
  label: s.name,
}));

export type TowerViewMode = 'controls' | 'map';

export interface StudioSidebarProps {
  sequencePanel?: React.ReactNode;
  sequenceAtlas?: React.ReactNode;
  structureMap?: React.ReactNode;
  melodyFollow?: React.ReactNode;
  allPads?: QuadLilyPad[];
  onPatchAllTiming?: (patch: QuadLilyPadPatch) => void;
  onRestartAll?: () => void;
  comparisonPads?: PhaseComparisonPad[];
  overviewPads?: QuadLilyPad[];
  selectedPadId: QuadPadId;
  selectedPad: QuadLilyPad;
  selectedNode: LilyNode;
  selectedScale: ScaleDefinition;
  selectedMotion: LilyNodeMotion;
  /** 手绘捕获状态：idle/ready 由父级映射；armed=待命 recording=正在拖录 */
  drawStatus?: DrawCaptureStatus | 'idle' | 'ready';
  selectedBasePresentations: Map<string, NodePresentation>;
  selectedBPresentations: Map<string, NodePresentation> | null;
  // Cycle Map props
  currentTrace: LilyCycleCompilation;
  nextTrace: LilyCycleCompilation;
  cyclePhase: number;
  currentTracePresentations: Map<string, NodePresentation>;
  nextTracePresentations: Map<string, NodePresentation> | null;
  showCycleMapLabels: boolean;
  cycleMapOpen: boolean;
  /** 侧栏是否折叠；由父级控制以便给画布打 data-sidebar-collapsed */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  /** 展开宽度（px）；当前默认宽度为下限，可向外拖 */
  widthPx?: number;
  onWidthChange?: (widthPx: number) => void;

  onPatchSelectedPad: (patch: QuadLilyPadPatch) => void;
  onRestartSelectedPad: () => void;
  onPatchSelectedNode: (patch: LilyNodePatch) => void;
  onToggleEndpointPitch: () => void;
  onChangeSelectedMotion: (motion: LilyNodeMotion) => void;
  onSelectNode: (nodeId: string) => void;
  /** 组合音符：Ctrl 点选顺序与批量运动 */
  groupNodeIds?: string[];
  groupMotionMode?: FormationShape | null;
  groupRateCycles?: number;
  groupRadius?: number;
  formationFocus?: boolean;
  padFormations?: LilyNoteFormation[];
  activeFormation?: LilyNoteFormation | null;
  onCopyNotes?: () => void;
  onPasteNotes?: () => void;
  canPasteNotes?: boolean;
  onReorderGroupNode?: (nodeId: string, direction: -1 | 1) => void;
  onSelectGroupPrimary?: (nodeId: string) => void;
  onSelectFormation?: (formationId: string) => void;
  onDissolveFormation?: () => void;
  /** 编队单位：整组静音 / 隐藏（不含双音符） */
  onToggleFormationMuted?: () => void;
  onToggleFormationHidden?: () => void;
  onChangeGroupMotionMode?: (mode: FormationShape) => void;
  onChangeGroupRateCycles?: (rateCycles: number) => void;
  onChangeGroupRadius?: (radius: number) => void;
  onToggleCycleMap: () => void;
}

const MOTION_MODES = [
  { key: 'off', label: '无' },
  { key: 'orbit', label: '圆形' },
  { key: 'pendulum', label: '线段' },
  { key: 'draw', label: '绘制' },
  { key: 'flash', label: '闪烁' },
] as const;

/** 节点卡片标题：中心为 ROOT，其余按非 center 序号 N01… */
function formatNodeInfoTitle(tr: (message: string, ...values: unknown[]) => string, pad: QuadLilyPad, node: LilyNode): string {
  if (node.isCenter) return tr("节点信息：ROOT");
  const index = pad.nodes.filter((n) => !n.isCenter).findIndex((n) => n.id === node.id);
  const serial = index >= 0 ? index + 1 : 0;
  return tr("节点信息：N{0}", String(serial).padStart(2, '0'));
}

export const StudioSidebar: React.FC<StudioSidebarProps> = ({
  sequencePanel,
  sequenceAtlas,
  structureMap,
  melodyFollow,
  allPads = [], onPatchAllTiming, onRestartAll,
  comparisonPads = [],
  overviewPads = [],
  selectedPadId,
  selectedPad,
  selectedNode,
  selectedScale,
  selectedMotion,
  drawStatus = 'idle',
  selectedBasePresentations,
  selectedBPresentations,
  currentTrace,
  nextTrace,
  cyclePhase,
  currentTracePresentations,
  nextTracePresentations,
  showCycleMapLabels,
  cycleMapOpen,
  collapsed: collapsedProp,
  onToggleCollapsed,
  widthPx = STUDIO_TOWER_WIDTH_MIN,
  onWidthChange,
  onPatchSelectedPad: patchCurrentPad,
  onRestartSelectedPad,
  onPatchSelectedNode,
  onToggleEndpointPitch,
  onChangeSelectedMotion,
  onSelectNode,
  groupNodeIds = [],
  groupMotionMode = null,
  groupRateCycles = 4,
  groupRadius = 0.12,
  formationFocus = false,
  padFormations = [],
  activeFormation = null,
  onCopyNotes, onPasteNotes, canPasteNotes,
  onReorderGroupNode,
  onSelectGroupPrimary,
  onSelectFormation,
  onDissolveFormation,
  onToggleFormationMuted,
  onToggleFormationHidden,
  onChangeGroupMotionMode,
  onChangeGroupRateCycles,
  onChangeGroupRadius,
  onToggleCycleMap,
}) => {
  const tr = useUiText();
  const [timingScope, setTimingScope] = useState<'current' | 'all'>('current');
  const mixed = (key: 'intervalMs' | 'velocity' | 'phraseSteps' | 'phraseMode') => timingScope === 'all' && allPads.some(p => p[key] !== allPads[0]?.[key]);
  const onPatchSelectedPad = (patch: QuadLilyPadPatch) => {
    const keys = Object.keys(patch);
    if (timingScope === 'all' && onPatchAllTiming && keys.every(k => ['intervalMs', 'velocity', 'phraseSteps', 'phraseMode'].includes(k))) onPatchAllTiming(patch);
    else patchCurrentPad(patch);
  };
  const [towerMode, setTowerMode] = useState<TowerViewMode>('map');
  const [mapView, setMapView] = useState<'current' | 'overview' | 'phase' | 'sequence' | 'structure' | 'follow'>('sequence');
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const collapsed = collapsedProp ?? internalCollapsed;
  const dragRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);

  const toggleCollapsed = () => {
    if (onToggleCollapsed) onToggleCollapsed();
    else setInternalCollapsed((value) => !value);
  };

  useEffect(() => {
    if (!isResizing) return;
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const next = clampStudioTowerWidth(drag.startWidth + (event.clientX - drag.startX));
      onWidthChange?.(next);
    };
    const onUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      dragRef.current = null;
      setIsResizing(false);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [isResizing, onWidthChange]);

  const showControls = towerMode === 'controls';
  const showMap = towerMode === 'map';

  const endpointEnabled = !formationFocus
    && selectedNode.endpointPitch !== undefined
    && selectedNode.endpointPitch !== null;
  const currentNoteName = selectedBasePresentations.get(selectedNode.id)?.noteName ?? 'C4';
  const bNoteName = selectedBPresentations?.get(selectedNode.id)?.noteName ?? null;
  const bpm = bpmFromIntervalMs(selectedPad.intervalMs);
  const volume = volumeFromVelocity(selectedPad.velocity);
  const editingFormation = Boolean(formationFocus && activeFormation);
  const formationMemberNodes = editingFormation && activeFormation
    ? activeFormation.nodeIds
      .map((id) => selectedPad.nodes.find((node) => node.id === id))
      .filter((node): node is NonNullable<typeof node> => Boolean(node))
    : [];
  const nodeMuted = editingFormation
    ? formationMemberNodes.length > 0 && formationMemberNodes.every((node) => node.muted === true)
    : selectedNode.muted === true;
  const nodeHidden = editingFormation
    ? formationMemberNodes.length > 0 && formationMemberNodes.every((node) => node.hidden === true)
    : selectedNode.hidden === true;

  return (
    <aside
      className={`quad-studio-tower${collapsed ? ' is-collapsed' : ''}${isResizing ? ' is-resizing' : ''}`}
      data-collapsed={collapsed ? 'true' : undefined}
      aria-label={tr("Pad {0} 控制与图谱面板", selectedPadId)}
      style={
        collapsed
          ? undefined
          : ({ '--studio-tower-width': `${widthPx}px` } as React.CSSProperties)
      }
    >
      {/* --- TOP TOWER NAVIGATION: Mode Segment Controller --- */}
      {!collapsed && (
      <nav className="quad-tower-nav" role="tablist" aria-label={tr("左侧控制塔视图切换")}>
        <button
          type="button"
          role="tab"
          aria-selected={towerMode === 'controls'}
          className={`quad-tower-nav__tab ${towerMode === 'controls' ? 'is-active' : ''}`}
          onClick={() => {
            setTowerMode('controls');
            if (cycleMapOpen) onToggleCycleMap();
          }}
        >
          <LayoutPanelLeft size={13} strokeWidth={2.1} aria-hidden />
          {tr("控制")}</button>
        <button
          type="button"
          role="tab"
          aria-selected={towerMode === 'map'}
          className={`quad-tower-nav__tab ${towerMode === 'map' ? 'is-active' : ''}`}
          onClick={() => {
            setTowerMode('map');
            if (!cycleMapOpen) onToggleCycleMap();
          }}
        >
          <Map size={13} strokeWidth={2.1} aria-hidden />
          {tr("图谱")}</button>
      </nav>
      )}

      {/* 右缘拖宽：上下两段，中间留给折叠钮 */}
      {!collapsed && onWidthChange && (
        <>
          <button
            type="button"
            className="quad-studio-tower__resize-handle quad-studio-tower__resize-handle--top"
            aria-label="Resize sidebar"
            title={tr("拖动调整侧栏宽度")}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.stopPropagation();
              event.currentTarget.setPointerCapture?.(event.pointerId);
              dragRef.current = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startWidth: widthPx,
              };
              setIsResizing(true);
            }}
          />
          <button
            type="button"
            className="quad-studio-tower__resize-handle quad-studio-tower__resize-handle--bottom"
            aria-label="Resize sidebar"
            title={tr("拖动调整侧栏宽度")}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.stopPropagation();
              event.currentTarget.setPointerCapture?.(event.pointerId);
              dragRef.current = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startWidth: widthPx,
              };
              setIsResizing(true);
            }}
          />
        </>
      )}

      {/* 折叠柄：按下即切换，无动画，避免漂移导致 click 丢失 */}
      <button
        type="button"
        className="quad-studio-tower__collapse-handle"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? tr("展开侧栏") : tr("折叠侧栏")}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          toggleCollapsed();
          // 立刻失焦，避免全局 focus 描边造成「跳一下」的错觉
          (event.currentTarget as HTMLButtonElement).blur();
        }}
      >
        {collapsed
          ? <ChevronRight size={16} strokeWidth={2.5} aria-hidden />
          : <ChevronLeft size={16} strokeWidth={2.5} aria-hidden />}
        <span className="quad-studio-tower__collapse-label">{collapsed ? tr("展开参数") : tr("收起参数")}</span>
      </button>

      {/* --- SECTION 1: PRO PARAMETER CARDS (With Direct Typing & Scrubbing Wheels) --- */}
      {!collapsed && showControls && (
        <div className="quad-studio-tower__params is-full">
          {/* Card 1: BPM 速度 */}
          <section className="quad-pro-card quad-pro-card--tempo" data-cat="tempo">
            <div className="quad-timing-scope" role="group" aria-label={tr("参数作用范围")}>
              <button type="button" aria-pressed={timingScope === 'current'} onClick={() => setTimingScope('current')}>{tr("当前画布")}</button>
              <button type="button" aria-pressed={timingScope === 'all'} onClick={() => setTimingScope('all')}>{tr("全部画布")}</button>
            </div>
            <header className="quad-pro-card__header">
              <span className="quad-pro-card__title">{tr("BPM速度")}</span>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <ScrubbableWheelInput
                  value={bpm}
                  formatValue={mixed('intervalMs') ? () => tr("不同") : undefined}
                  min={MIN_BPM}
                  max={MAX_BPM}
                  step={1}
                  unit="BPM"
                  title={tr("点击直接输入 BPM (40–240)；左右拖拽或滚轮增减")}
                  onChange={(nextBpm) => onPatchSelectedPad({ intervalMs: intervalMsFromBpm(nextBpm) })}
                />
                <button
                  type="button"
                  className="quad-pro-mini-btn"
                  onClick={timingScope === 'all' ? onRestartAll : onRestartSelectedPad}
                  title={tr("立即对齐重置起拍")}
                >
                  {tr("起拍 ↺")}</button>
              </div>
            </header>

            {/* Slider 1: BPM */}
            <div className="quad-pro-field">
              <div className="quad-pro-slider-wrap">
                <input
                  type="range"
                  min={MIN_BPM}
                  max={MAX_BPM}
                  step={1}
                  value={bpm}
                  onChange={(e) => onPatchSelectedPad({ intervalMs: intervalMsFromBpm(Number(e.target.value)) })}
                  className="quad-pro-slider"
                  title={`BPM: ${bpm}`}
                />
              </div>
            </div>

            <div className="quad-pro-field" style={{ marginTop: 6 }}>
              <div className="quad-pro-field__meta">
                <span className="quad-pro-field__sublabel">{tr("乐句长度")}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ScrubbableWheelInput formatValue={mixed('phraseSteps') ? () => tr("不同") : undefined} value={selectedPad.phraseSteps ?? 4} min={4} max={MAX_PHRASE_STEPS} step={1} unit={tr("步")} title={tr("乐句长度：4–{0} 步", MAX_PHRASE_STEPS)} onChange={value => onPatchSelectedPad({ phraseMode: 'fixed', phraseSteps: normalizePhraseSteps(value) })} />
                  <button className="quad-pro-mini-btn" type="button" aria-pressed={mixed('phraseMode') ? 'mixed' : selectedPad.phraseMode === 'auto'} onClick={() => onPatchSelectedPad({ phraseMode: mixed('phraseMode') || selectedPad.phraseMode !== 'auto' ? 'auto' : 'fixed' })}>{tr("自动")}{mixed('phraseMode') ? tr(" · 不同") : ''}</button>
                </div>
              </div>
              <div className="quad-pro-slider-wrap"><input className="quad-pro-slider" aria-label={tr("乐句长度")} type="range" min={4} max={MAX_PHRASE_STEPS} step={1} value={selectedPad.phraseSteps ?? 4} onChange={e => onPatchSelectedPad({phraseMode:'fixed', phraseSteps:Number(e.target.value)})} /></div>
            </div>
            {/* Slider 2: 音量（UI 10–200 ↔ 内部 velocity） */}
            <div className="quad-pro-field" style={{ marginTop: '6px' }}>
              <div className="quad-pro-field__meta">
                <span className="quad-pro-field__sublabel">{tr("音量")}</span>
                <ScrubbableWheelInput
                  value={volume}
                  formatValue={mixed('velocity') ? () => tr("不同") : undefined}
                  min={MIN_VOLUME}
                  max={MAX_VOLUME}
                  step={1}
                  title={tr("点击直接输入音量 (10–200)；左右拖拽或滚轮增减")}
                  onChange={(nextVolume) => onPatchSelectedPad({ velocity: velocityFromVolume(nextVolume) })}
                />
              </div>
              <div className="quad-pro-slider-wrap">
                <input
                  type="range"
                  min={MIN_VOLUME}
                  max={MAX_VOLUME}
                  step={1}
                  value={volume}
                  onChange={(e) => onPatchSelectedPad({ velocity: velocityFromVolume(Number(e.target.value)) })}
                  className="quad-pro-slider"
                  title={tr("音量: {0}", volume)}
                />
              </div>
            </div>
          </section>

          {/* Card 2: 调式与音阶预设 (SCALE & HARMONY) */}
          <section className="quad-pro-card quad-pro-card--scale" data-cat="scale">
            <header className="quad-pro-card__header">
              <span className="quad-pro-card__title">{tr("调式与音阶")}</span>
              <span className="quad-pro-card__tag">PAD {selectedPadId}</span>
            </header>

            <div className="quad-pro-grid-3">
              <label className="quad-pro-select-label">
                <span>{tr("根音")}</span>
                <SoftSelect
                  variant="pro"
                  aria-label="Root note"
                  value={String(selectedPad.rootMidi)}
                  options={ROOT_NOTE_OPTIONS}
                  onChange={(next) => onPatchSelectedPad({ rootMidi: Number(next) })}
                />
              </label>

              <label className="quad-pro-select-label">
                <span>{tr("八度")}</span>
                <SoftSelect
                  variant="pro"
                  aria-label="Octave transpose"
                  value={String(selectedPad.octaveTranspose)}
                  options={OCTAVE_OPTIONS}
                  onChange={(next) => onPatchSelectedPad({ octaveTranspose: Number(next) })}
                />
              </label>

              <label className="quad-pro-select-label quad-pro-grid-3__scale">
                <span>{tr("音阶体系")}</span>
                <SoftSelect
                  variant="pro"
                  aria-label="Scale system"
                  value={selectedScale.key}
                  options={SCALE_OPTIONS}
                  onChange={(next) => onPatchSelectedPad({ scaleKey: next })}
                />
              </label>
            </div>
          </section>

          {/* Card 3: 节点音高与光环 */}
          <section className="quad-pro-card quad-pro-card--node" data-cat="node">
            <header className="quad-pro-card__header">
              <span className="quad-pro-card__title">
                {formationFocus && activeFormation
                  ? tr("编队 {0}", activeFormation.id)
                  : formatNodeInfoTitle(tr, selectedPad, selectedNode)}
              </span>
              <div className="quad-pro-card__header-actions">
                {!editingFormation ? (
                  <button
                    type="button"
                    className={`quad-pro-mini-btn ${endpointEnabled ? 'quad-pro-mini-btn--accent' : ''}`}
                    disabled={selectedPad.locked}
                    onClick={onToggleEndpointPitch}
                    title={tr("双音符开关")}
                  >
                    {tr("双音符")}</button>
                ) : null}
                <button
                  type="button"
                  className={`quad-pro-mini-btn ${nodeMuted ? 'quad-pro-mini-btn--accent' : ''}`}
                  disabled={selectedPad.locked || (editingFormation && !onToggleFormationMuted)}
                  onClick={() => {
                    if (editingFormation) onToggleFormationMuted?.();
                    else onPatchSelectedNode({ muted: !nodeMuted });
                  }}
                  title={
                    editingFormation
                      ? (nodeMuted ? 'Unmute formation' : 'Mute formation')
                      : (nodeMuted ? 'Unmute node' : 'Mute node')
                  }
                >
                  {tr("静音")}</button>
                <button
                  type="button"
                  className={`quad-pro-mini-btn ${nodeHidden ? 'quad-pro-mini-btn--accent' : ''}`}
                  disabled={selectedPad.locked || (editingFormation && !onToggleFormationHidden)}
                  onClick={() => {
                    if (editingFormation) onToggleFormationHidden?.();
                    else onPatchSelectedNode({ hidden: !nodeHidden });
                  }}
                  title={
                    editingFormation
                      ? (nodeHidden ? 'Show formation' : 'Hide formation')
                      : (nodeHidden ? 'Show node' : 'Hide node')
                  }
                >
                  {tr("隐藏")}</button>
              </div>
            </header>

            {/* Pitch Direct Input & Stepper Bar */}
            <div className="quad-pro-pitch-bar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span className="quad-pro-field__sublabel">{tr("A 音")}</span>
                <PitchDirectInput
                  scaleStep={selectedNode.scaleStep}
                  noteName={currentNoteName}
                  rootMidi={selectedPad.rootMidi}
                  scaleKey={selectedPad.scaleKey}
                  octaveTranspose={selectedPad.octaveTranspose}
                  disabled={selectedPad.locked}
                  onChangeStep={(scaleStep) => onPatchSelectedNode({ scaleStep })}
                />
                <button
                  type="button"
                  className="quad-pro-btn-step"
                  disabled={selectedPad.locked}
                  onClick={() => onPatchSelectedNode({ scaleStep: selectedNode.scaleStep - 1 })}
                  title={tr("降低半音阶")}
                >
                  -
                </button>
                <button
                  type="button"
                  className="quad-pro-btn-step"
                  disabled={selectedPad.locked}
                  onClick={() => onPatchSelectedNode({ scaleStep: selectedNode.scaleStep + 1 })}
                  title={tr("升高半音阶")}
                >
                  +
                </button>
              </div>

              {endpointEnabled && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', borderLeft: '1px dashed var(--quad-line)', paddingLeft: '8px' }}>
                  <span className="quad-pro-field__sublabel">{tr("B 音")}</span>
                  <PitchDirectInput
                    scaleStep={selectedNode.endpointPitch?.bStep ?? 0}
                    noteName={bNoteName ?? '—'}
                    rootMidi={selectedPad.rootMidi}
                    scaleKey={selectedPad.scaleKey}
                    octaveTranspose={selectedPad.octaveTranspose}
                    disabled={selectedPad.locked}
                    onChangeStep={(bStep) => onPatchSelectedNode({ endpointPitch: { bStep } })}
                  />
                  <button
                    type="button"
                    className="quad-pro-btn-step"
                    disabled={selectedPad.locked}
                    onClick={() => onPatchSelectedNode({ endpointPitch: { bStep: (selectedNode.endpointPitch?.bStep ?? 0) - 1 } })}
                  >
                    -
                  </button>
                  <button
                    type="button"
                    className="quad-pro-btn-step"
                    disabled={selectedPad.locked}
                    onClick={() => onPatchSelectedNode({ endpointPitch: { bStep: (selectedNode.endpointPitch?.bStep ?? 0) + 1 } })}
                  >
                    +
                  </button>
                </div>
              )}
            </div>

            <div className="quad-pro-field" style={{ marginTop: 6 }}>
              <div className="quad-pro-field__meta">
                <span className="quad-pro-field__sublabel">{tr("停留步数")}</span>
                <ScrubbableWheelInput value={selectedNode.holdSteps ?? 1} min={1} max={MAX_PHRASE_STEPS} step={1} unit={tr("步")} disabled={selectedPad.locked} title={tr("节点停留步数：延长时值与传递间隔；和弦成员以整组保持步数为准")} onChange={holdSteps => onPatchSelectedNode({ holdSteps })} />
              </div>
            </div>
            {/* 范围半径比例 */}
            <div className="quad-pro-field" style={{ marginTop: '6px' }}>
              <div className="quad-pro-field__meta">
                <span className="quad-pro-field__sublabel">{tr("范围半径比例")}</span>
                <ScrubbableWheelInput
                  value={Math.round(selectedNode.range * 100)}
                  min={4}
                  max={48}
                  step={1}
                  unit="%"
                  disabled={selectedPad.locked}
                  title={tr("点击直接输入范围半径比例 (4-48%)；左右拖拽或滚轮增减")}
                  onChange={(pct) => onPatchSelectedNode({ range: pct / 100 })}
                />
              </div>
              <div className="quad-pro-slider-wrap">
                <input
                  type="range"
                  min="0.04"
                  max="0.48"
                  step="0.01"
                  value={selectedNode.range}
                  disabled={selectedPad.locked}
                  onChange={(e) => onPatchSelectedNode({ range: Number(e.target.value) })}
                  className="quad-pro-slider"
                  title={tr("范围半径比例: {0}%", Math.round(selectedNode.range * 100))}
                />
              </div>
            </div>
          </section>

          {/* Card 4: 轨迹模式 */}
          <section className="quad-pro-card quad-pro-card--motion" data-cat="motion">
            <header className="quad-pro-card__header">
              <span className="quad-pro-card__title">{tr("轨迹模式")}</span>
              <span className="quad-pro-card__tag">
                {formationFocus && activeFormation
                  ? tr("编辑 {0}", activeFormation.id)
                  : groupNodeIds.length >= 2
                    ? tr("多选 {0}", groupNodeIds.length)
                    : tr(MOTION_MODES.find((m) => m.key === selectedMotion.mode)?.label ?? '无')}
              </span>
            </header>

            {/* Mode Switcher Pills */}
            <div className="quad-pro-modes" role="group" aria-label={tr("轨迹模式选择")}>
              {MOTION_MODES.map((m) => {
                const isActive = selectedMotion.mode === m.key;
                const formationLocked = Boolean(formationFocus && activeFormation);
                const allowedWhenFormation = activeFormation
                  ? (activeFormation.shape === 'circle' && m.key === 'orbit')
                    || (activeFormation.shape === 'line' && m.key === 'pendulum')
                    || (activeFormation.shape === 'flash' && m.key === 'flash')
                    || m.key === 'off'
                  : true;
                return (
                  <button
                    key={m.key}
                    type="button"
                    className={`quad-pro-mode-pill ${isActive ? 'is-active' : ''}`}
                    disabled={selectedPad.locked || (formationLocked && !allowedWhenFormation)}
                    onClick={() => {
                      if (m.key === 'off') {
                        onChangeSelectedMotion({ mode: 'off' });
                      } else if (m.key === 'orbit') {
                        onChangeSelectedMotion({
                          mode: 'orbit',
                          amount: selectedMotion.amount ?? 0.08,
                          rateCycles: selectedMotion.rateCycles ?? 3,
                          direction: selectedMotion.direction ?? 1,
                          phaseOffset: selectedMotion.phaseOffset ?? 0,
                        });
                      } else if (m.key === 'pendulum') {
                        onChangeSelectedMotion({
                          mode: 'pendulum',
                          amount: selectedMotion.amount ?? 0.08,
                          angleDegrees: (selectedMotion as { angleDegrees?: number }).angleDegrees ?? 90,
                          rateCycles: selectedMotion.rateCycles ?? 2,
                          phaseOffset: selectedMotion.phaseOffset ?? 0,
                        });
                      } else if (m.key === 'draw') {
                        onChangeSelectedMotion({
                          mode: 'draw',
                          path: selectedMotion.mode === 'draw' ? (selectedMotion.path ?? []) : [],
                          rateCycles: selectedMotion.rateCycles ?? 4,
                        });
                      } else {
                        onChangeSelectedMotion({
                          mode: 'flash',
                          rateCycles: selectedMotion.rateCycles ?? 2,
                          ...(selectedMotion.mode === 'flash'
                            ? {
                              targetDx: selectedMotion.targetDx,
                              targetDy: selectedMotion.targetDy,
                            }
                            : {}),
                        });
                      }
                    }}
                  >
                    {tr(m.label)}
                  </button>
                );
              })}
            </div>
            {formationFocus && activeFormation ? (
              <div className="quad-pro-help">
                {tr("正在编辑编队")}{activeFormation.id}：{activeFormation.shape==='chord'?tr("任一成员被触达，整组同时触发；隐藏成员不参与。"):tr("调半径/周期即改整组形状。")}
                {activeFormation.shape === 'chord' && <label>{tr("和弦保持")}<ScrubbableWheelInput value={activeFormation.holdSteps ?? 1} min={1} max={64} step={1} unit={tr("步")} title={tr("和弦保持步数")} onChange={holdSteps => onPatchSelectedPad({ formations: (selectedPad.formations ?? []).map(f => f.id === activeFormation.id ? {...f, holdSteps} : f) })} />
                </label>}
              </div>
            ) : null}

            {/* Dynamic Mode Parameters */}
            {selectedMotion.mode === 'orbit' && (
              <div className="quad-pro-motion-params">
                {/* 轨道半径 */}
                <div className="quad-pro-field">
                  <div className="quad-pro-field__meta">
                    <span className="quad-pro-field__sublabel">
                      {formationFocus ? tr("编队半径") : tr("轨道半径")}
                    </span>
                    <ScrubbableWheelInput
                      value={Math.round((selectedMotion.amount ?? 0.08) * 100)}
                      min={2}
                      max={formationFocus ? 42 : 25}
                      step={1}
                      unit="%"
                      disabled={selectedPad.locked}
                      title={formationFocus ? tr("编队圆半径") : tr("点击直接输入轨道半径百分比 (2-25%)；左右拖拽滚轮调节")}
                      onChange={(pct) => onChangeSelectedMotion({ ...selectedMotion, amount: pct / 100 })}
                    />
                  </div>
                  <input
                    type="range"
                    min="0.02"
                    max={formationFocus ? '0.42' : '0.22'}
                    step="0.005"
                    value={Math.min(selectedMotion.amount ?? 0.08, formationFocus ? 0.42 : 0.22)}
                    disabled={selectedPad.locked}
                    onChange={(e) => onChangeSelectedMotion({ ...selectedMotion, amount: Number(e.target.value) })}
                    className="quad-pro-slider"
                  />
                </div>

                {/* 运动周期 (Scrubbable Wheel + Slider + Direction) */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' }}>
                  <div className="quad-pro-field" style={{ flex: 1 }}>
                    <div className="quad-pro-field__meta">
                      <span className="quad-pro-field__sublabel">{tr("运动周期")}</span>
                      <ScrubbableWheelInput
                        value={selectedMotion.rateCycles ?? 3}
                        min={1}
                        max={32}
                        step={1}
                        unit={tr("周期")}
                        disabled={selectedPad.locked}
                        title={tr("点击直接输入数字周期 (如 2, 3, 4, 6, 8)；左右拖拽滚轮调节")}
                        onChange={(rateCycles) => onChangeSelectedMotion({ ...selectedMotion, rateCycles })}
                      />
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="16"
                      step="1"
                      value={selectedMotion.rateCycles ?? 3}
                      disabled={selectedPad.locked}
                      onChange={(e) => onChangeSelectedMotion({ ...selectedMotion, rateCycles: Number(e.target.value) })}
                      className="quad-pro-slider"
                    />
                  </div>

                  <button
                    type="button"
                    className="quad-pro-btn"
                    disabled={selectedPad.locked}
                    onClick={() =>
                      onChangeSelectedMotion({
                        ...selectedMotion,
                        direction: selectedMotion.direction === 'ccw' ? 'cw' : 'ccw',
                      })
                    }
                    title={tr("切换运动方向")}
                    style={{ marginTop: '12px' }}
                  >
                    {selectedMotion.direction === 'ccw' ? tr("↺ 逆时针") : tr("↻ 顺时针")}
                  </button>
                </div>
              </div>
            )}

            {selectedMotion.mode === 'pendulum' && (
              <div className="quad-pro-motion-params">
                {/* 摆动幅度 */}
                <div className="quad-pro-field">
                  <div className="quad-pro-field__meta">
                    <span className="quad-pro-field__sublabel">{tr("摆动幅度")}</span>
                    <ScrubbableWheelInput
                      value={Math.round((selectedMotion.amount ?? 0.08) * 100)}
                      min={2}
                      max={25}
                      step={1}
                      unit="%"
                      disabled={selectedPad.locked}
                      title={tr("点击直接输入摆动幅度百分比 (2-25%)；左右拖拽滚轮调节")}
                      onChange={(pct) => onChangeSelectedMotion({ ...selectedMotion, amount: pct / 100 })}
                    />
                  </div>
                  <input
                    type="range"
                    min="0.02"
                    max="0.22"
                    step="0.005"
                    value={selectedMotion.amount ?? 0.08}
                    disabled={selectedPad.locked}
                    onChange={(e) => onChangeSelectedMotion({ ...selectedMotion, amount: Number(e.target.value) })}
                    className="quad-pro-slider"
                  />
                </div>

                {/* 摆动角度 + 运动周期 (左右双滚轮) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '6px' }}>
                  <div className="quad-pro-field">
                    <div className="quad-pro-field__meta">
                      <span className="quad-pro-field__sublabel">{tr("摆动角度")}</span>
                      <ScrubbableWheelInput
                        value={(selectedMotion as any).angleDegrees ?? (selectedMotion as any).angleDeg ?? 90}
                        min={0}
                        max={360}
                        step={5}
                        unit="°"
                        disabled={selectedPad.locked}
                        title={tr("点击直接输入摆动角度 (0-360°)；左右拖拽滚轮调节")}
                        onChange={(angle) =>
                          onChangeSelectedMotion({
                            ...selectedMotion,
                            angleDegrees: angle,
                            angleDeg: angle,
                          } as any)
                        }
                      />
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="360"
                      step="5"
                      value={(selectedMotion as any).angleDegrees ?? (selectedMotion as any).angleDeg ?? 90}
                      disabled={selectedPad.locked}
                      onChange={(e) =>
                        onChangeSelectedMotion({
                          ...selectedMotion,
                          angleDegrees: Number(e.target.value),
                          angleDeg: Number(e.target.value),
                        } as any)
                      }
                      className="quad-pro-slider"
                    />
                  </div>

                  <div className="quad-pro-field">
                    <div className="quad-pro-field__meta">
                      <span className="quad-pro-field__sublabel">{tr("运动周期")}</span>
                      <ScrubbableWheelInput
                        value={selectedMotion.rateCycles ?? 2}
                        min={1}
                        max={32}
                        step={1}
                        unit={tr("周期")}
                        disabled={selectedPad.locked}
                        title={tr("点击直接输入运动周期 (如 2, 3, 4, 6, 8)；左右拖拽滚轮调节")}
                        onChange={(rateCycles) => onChangeSelectedMotion({ ...selectedMotion, rateCycles })}
                      />
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="16"
                      step="1"
                      value={selectedMotion.rateCycles ?? 2}
                      disabled={selectedPad.locked}
                      onChange={(e) => onChangeSelectedMotion({ ...selectedMotion, rateCycles: Number(e.target.value) })}
                      className="quad-pro-slider"
                    />
                  </div>
                </div>
              </div>
            )}

            {selectedMotion.mode === 'draw' && (
              <div className="quad-pro-motion-params">
                <div className="quad-pro-help">
                  {drawStatus === 'recording'
                    ? tr("录制中：按住节点拖动，松手结束")
                    : drawStatus === 'armed'
                      ? tr("待命中：请在画布上按住节点拖动开始录制（点 D / 绘制不会立刻开录）")
                      : selectedMotion.path?.length
                        ? tr("已录制 {0} 关键帧 · 播放周期 {1}", selectedMotion.path.length, selectedMotion.rateCycles ?? 4)
                        : tr("选手绘后，在画布按住节点拖动才开始录制")}
                </div>

                <div className="quad-pro-field" style={{ marginTop: '6px' }}>
                  <div className="quad-pro-field__meta">
                    <span className="quad-pro-field__sublabel">{tr("运动周期")}</span>
                    <ScrubbableWheelInput
                      value={selectedMotion.rateCycles ?? 4}
                      min={1}
                      max={32}
                      step={1}
                      unit={tr("周期")}
                      disabled={selectedPad.locked}
                      title={tr("手绘轨迹走完一遍需要多少个 Pad 周期；常用 2 / 4 / 6 / 8")}
                      onChange={(rateCycles) => onChangeSelectedMotion({ ...selectedMotion, rateCycles })}
                    />
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="16"
                    step="1"
                    value={selectedMotion.rateCycles ?? 4}
                    disabled={selectedPad.locked}
                    onChange={(e) => onChangeSelectedMotion({ ...selectedMotion, rateCycles: Number(e.target.value) })}
                    className="quad-pro-slider"
                  />
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                  {[2, 4, 6, 8].map((cycles) => (
                    <button
                      key={cycles}
                      type="button"
                      className={`quad-pro-mini-btn ${(selectedMotion.rateCycles ?? 4) === cycles ? 'quad-pro-mini-btn--accent' : ''}`}
                      disabled={selectedPad.locked}
                      onClick={() => onChangeSelectedMotion({ ...selectedMotion, rateCycles: cycles })}
                      title={tr("设为 {0} 周期", cycles)}
                    >
                      {cycles}
                    </button>
                  ))}
                  {selectedMotion.path?.length ? (
                    <button
                      type="button"
                      className="quad-pro-btn quad-pro-btn--danger"
                      style={{ marginLeft: 'auto' }}
                      disabled={selectedPad.locked}
                      onClick={() => onChangeSelectedMotion({ ...selectedMotion, path: [] })}
                    >
                      {tr("清除重录")}</button>
                  ) : null}
                </div>
              </div>
            )}

            {selectedMotion.mode === 'flash' && (
              <div className="quad-pro-motion-params">
                <div className="quad-pro-help">
                  {drawStatus === 'armed'
                    ? tr("待命中：再点击画布上的目标位置（F / 闪烁 可取消）")
                    : Math.abs(selectedMotion.targetDx ?? 0) > 1e-6
                      || Math.abs(selectedMotion.targetDy ?? 0) > 1e-6
                      ? tr("目标已设定 · 周期前半原位 / 后半跳转 · 播放周期 {0}", selectedMotion.rateCycles ?? 2)
                      : tr("选闪烁后，再点击画布位置设定跳转目标")}
                </div>

                <div className="quad-pro-field" style={{ marginTop: '6px' }}>
                  <div className="quad-pro-field__meta">
                    <span className="quad-pro-field__sublabel">{tr("运动周期")}</span>
                    <ScrubbableWheelInput
                      value={selectedMotion.rateCycles ?? 2}
                      min={1}
                      max={32}
                      step={1}
                      unit={tr("周期")}
                      disabled={selectedPad.locked}
                      title={tr("完成一次原位↔目标跳转需要多少个 Pad 周期；常用 2 / 4 / 6 / 8")}
                      onChange={(rateCycles) => onChangeSelectedMotion({ ...selectedMotion, rateCycles })}
                    />
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="16"
                    step="1"
                    value={selectedMotion.rateCycles ?? 2}
                    disabled={selectedPad.locked}
                    onChange={(e) => onChangeSelectedMotion({ ...selectedMotion, rateCycles: Number(e.target.value) })}
                    className="quad-pro-slider"
                  />
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                  {[2, 4, 6, 8].map((cycles) => (
                    <button
                      key={cycles}
                      type="button"
                      className={`quad-pro-mini-btn ${(selectedMotion.rateCycles ?? 2) === cycles ? 'quad-pro-mini-btn--accent' : ''}`}
                      disabled={selectedPad.locked}
                      onClick={() => onChangeSelectedMotion({ ...selectedMotion, rateCycles: cycles })}
                      title={tr("设为 {0} 周期", cycles)}
                    >
                      {cycles}
                    </button>
                  ))}
                  {(Math.abs(selectedMotion.targetDx ?? 0) > 1e-6
                    || Math.abs(selectedMotion.targetDy ?? 0) > 1e-6) ? (
                    <button
                      type="button"
                      className="quad-pro-btn quad-pro-btn--danger"
                      style={{ marginLeft: 'auto' }}
                      disabled={selectedPad.locked}
                      onClick={() => onChangeSelectedMotion({
                        mode: 'flash',
                        rateCycles: selectedMotion.rateCycles ?? 2,
                      })}
                    >
                      {tr("清除目标")}</button>
                  ) : null}
                </div>
              </div>
            )}
          </section>

          {/* Card 5: 组合音符 — 共形编队；周期/半径在选中枢纽后用上方「轨迹模式」调 */}
          <section className="quad-pro-card quad-pro-card--group" data-cat="group">
            <header className="quad-pro-card__header">
              <span className="quad-pro-card__title">{tr("组合音符")}</span>
              <span className="quad-pro-card__tag">
                {padFormations.length > 0
                  ? tr("{0} 编队", padFormations.length)
                  : groupNodeIds.length >= 2
                    ? tr("{0} 选中", groupNodeIds.length)
                    : tr("Ctrl 点选")}
              </span>
            </header>

            <div className="quad-pro-motion-params">
              {padFormations.length > 0 ? (
                <>
                  <div className="quad-pro-field__sublabel" style={{ marginBottom: 4 }}>
                    {tr("已有编队")}</div>
                  <div className="quad-pro-group-chips" role="list" aria-label={tr("编队列表")}>
                    {padFormations.map((formation) => {
                      const isActive = activeFormation?.id === formation.id && formationFocus;
                      return (
                        <div
                          key={formation.id}
                          className={`quad-pro-group-chip ${isActive ? 'is-primary' : ''}`}
                          role="listitem"
                        >
                          <button
                            type="button"
                            className="quad-pro-group-chip__main"
                            disabled={selectedPad.locked || !onSelectFormation}
                            onClick={() => onSelectFormation?.(formation.id)}
                            title={tr("{0} · {1} 音 · {2}", formation.id, formation.nodeIds.length, formation.shape)}
                          >
                            <span className="quad-pro-group-chip__text">{formation.id}</span>
                            <span className="quad-pro-group-chip__index">{formation.nodeIds.length}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  {activeFormation && formationFocus ? (
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                      <span className="quad-pro-field__sublabel">
                        {tr("焦点")}{activeFormation.id}
                      </span>
                      <button
                        type="button"
                        className="quad-pro-btn quad-pro-btn--danger"
                        style={{ marginLeft: 'auto' }}
                        disabled={selectedPad.locked || !onDissolveFormation}
                        onClick={() => onDissolveFormation?.()}
                        title={tr("解散当前编队（音符保留）")}
                      >
                        {tr("解散")}</button>
                    </div>
                  ) : null}
                </>
              ) : null}

              <div
                className="quad-pro-field__sublabel"
                style={{ marginBottom: 4, marginTop: padFormations.length > 0 ? 10 : 0 }}
              >
                {tr("音符顺序")}</div>
              <div style={{ display: 'flex', gap: 8, margin: '8px 0' }}>
                <button className="quad-pro-mini-btn" type="button" disabled={!groupNodeIds.length || !onCopyNotes} onClick={onCopyNotes} title={tr("复制所选音符与完整编队（Ctrl+C）")}>{tr("复制选中")}</button>
                <button className="quad-pro-mini-btn" type="button" disabled={!canPasteNotes || selectedPad.locked} onClick={onPasteNotes} title={tr("粘贴到当前 Pad（Ctrl+V）")}>{tr("粘贴")}</button>
              </div>
              <p className="quad-experiment-hint">{tr("Ctrl 多选后复制；完整编队保留关系，部分成员单独粘贴。")}</p>
              {groupNodeIds.length === 0 ? (
                <div className="quad-pro-help">
                  {tr("按住 Ctrl（Mac：⌘）点选音符；选形状可新建编队（G1/G2…可并存）。点枢纽切换编辑对象。")}</div>
              ) : (
                <div className="quad-pro-group-chips" role="list" aria-label={tr("组合音符顺序")}>
                  {groupNodeIds.map((nodeId, index) => {
                    const node = selectedPad.nodes.find((candidate) => candidate.id === nodeId);
                    if (!node) return null;
                    const shortId = selectedBasePresentations.get(nodeId)?.shortId
                      ?? (node.isCenter ? 'ROOT' : nodeId);
                    const noteName = selectedBasePresentations.get(nodeId)?.noteName ?? '';
                    const isPrimary = selectedNode.id === nodeId;
                    return (
                      <div
                        key={nodeId}
                        className={`quad-pro-group-chip ${isPrimary ? 'is-primary' : ''}`}
                        role="listitem"
                      >
                        <button
                          type="button"
                          className="quad-pro-group-chip__main"
                          disabled={selectedPad.locked}
                          onClick={() => onSelectGroupPrimary?.(nodeId)}
                          title={`${index + 1}. ${shortId}${noteName ? ` ${noteName}` : ''}`}
                        >
                          <span className="quad-pro-group-chip__index">{index + 1}</span>
                          <span className="quad-pro-group-chip__text">{shortId}</span>
                        </button>
                        <div className="quad-pro-group-chip__move">
                          <button
                            type="button"
                            disabled={selectedPad.locked || index === 0 || !onReorderGroupNode}
                            onClick={() => onReorderGroupNode?.(nodeId, -1)}
                            title={tr("前移")}
                            aria-label={tr("前移顺序")}
                          >
                            ‹
                          </button>
                          <button
                            type="button"
                            disabled={
                              selectedPad.locked
                              || index >= groupNodeIds.length - 1
                              || !onReorderGroupNode
                            }
                            onClick={() => onReorderGroupNode?.(nodeId, 1)}
                            title={tr("后移")}
                            aria-label={tr("后移顺序")}
                          >
                            ›
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="quad-pro-field__sublabel" style={{ marginTop: 10, marginBottom: 4 }}>
                {tr("编队形状")}</div>
              <div className="quad-pro-modes quad-pro-modes--group" role="group" aria-label={tr("编队形状")}>
                {FORMATION_SHAPES.map((m) => {
                  const isActive = groupMotionMode === m.key && groupNodeIds.length >= 2;
                  return (
                    <button
                      key={m.key}
                      type="button"
                      className={`quad-pro-mode-pill ${isActive ? 'is-active' : ''}`}
                      disabled={selectedPad.locked || groupNodeIds.length < 2 || !onChangeGroupMotionMode}
                      onClick={() => onChangeGroupMotionMode?.(m.key)}
                      title={groupNodeIds.length < 2 ? tr("请先 Ctrl 选中至少 2 个音符") : undefined}
                    >
                      {tr(m.label)}
                    </button>
                  );
                })}
              </div>
              <div className="quad-pro-help">
                {groupNodeIds.length < 2
                  ? tr("至少 2 个音符 → 选和弦/圆形/线段/闪烁。换一组音符再选形状，可再建 G2/G3…")
                  : activeFormation && formationFocus
                    && activeFormation.nodeIds.length === groupNodeIds.length
                    && groupNodeIds.every((id) => activeFormation.nodeIds.includes(id))
                    ? tr("更新 {0}：再点其他音符组 + 形状可新建下一编队。", activeFormation.id)
                    : tr("将生成新编队（现有 {0} 个）。选中枢纽后用轨迹模式调半径/周期。", padFormations.length)}
              </div>
            </div>
          </section>

          {/* 快捷键卡已迁到主画布工具条下方；锁定/清空已迁到画布抬头 */}
        </div>
      )}

      {/* --- SECTION 2: CYCLE MAP（图谱 tab 保留；底部「展开周期图谱」已移除） --- */}
      {!collapsed && showMap && (
        <div className="quad-studio-tower__map is-fullscreen">
          <header className="quad-tower-map-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="quad-tower-map-title">{tr("周期图谱")}</span>
              <span className="quad-pro-card__tag" style={{ color: 'var(--selected-pad-color, var(--quad-stamen))' }}>
                PAD {selectedPadId}
              </span>
              <span
                style={{
                  display: 'inline-block',
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: selectedPad.playing ? 'var(--selected-pad-color, var(--quad-stamen))' : 'var(--quad-muted)',
                  boxShadow: 'none',
                }}
                title={selectedPad.playing ? tr("正在实时演化 (周期相位: {0}%)", Math.round(cyclePhase * 100)) : tr("已暂停")}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                className="quad-pro-mini-btn"
                onClick={() => {
                  setTowerMode('controls');
                  if (cycleMapOpen) onToggleCycleMap();
                }}
                title={tr("返回控制面板")}
              >
                {tr("返回控制")}</button>
            </div>
          </header>

          {/* Map Content Container */}
          <nav className="quad-map-view-switch" aria-label={tr("图谱视图")}>
            {([['current',tr("当前轨")],['overview',tr("四轨总览")],['phase',tr("相位对比")],['sequence',tr("音序全图")],['structure',tr("结构对照")],['follow',tr("旋律追随")]] as const).map(([id,label]) => <button key={id} type="button" className="quad-pro-mini-btn" aria-pressed={mapView===id} onClick={()=>setMapView(id)}>{label}</button>)}
          </nav>
          <div className="quad-tower-map-body">
            {mapView === 'follow' ? melodyFollow : mapView === 'structure' ? structureMap : mapView === 'sequence' ? sequenceAtlas : mapView === 'phase' ? <PhaseComparison pads={comparisonPads} sources={overviewPads} /> : mapView === 'overview' ? <MultiPadOverview pads={overviewPads} progress={comparisonPads} /> : <CycleTrace
              padId={selectedPadId}
              current={currentTrace}
              next={nextTrace}
              cyclePhase={cyclePhase}
              selectedNodeId={selectedNode.id}
              nodePresentations={currentTracePresentations}
              nextNodePresentations={nextTracePresentations}
              showNodeLabels={showCycleMapLabels}
              onSelectNode={onSelectNode}
            />}
            {mapView !== 'sequence' && mapView !== 'structure' && mapView !== 'follow' && sequencePanel}
          </div>
        </div>
      )}
    </aside>
  );
};
