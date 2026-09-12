import { useUiText } from './uiLocale';
import React from 'react';
import { Info, Lock, LockOpen, Pause, Play, Save, Trash2 } from 'lucide-react';

import type { LilyCycleCompilation, LilyCycleEdge, LilyNode, LilyNodePatch, QuadLilyPad, QuadPadId } from './core.ts';
import {playbackVisualFrames, playbackVisualScore, type PlaybackVisualMode, type PlaybackVisualFrame} from './playbackVisual.ts';
import {PlaybackVisualLayer} from './PlaybackVisualLayer.tsx';
import type { CanvasBackgroundPattern } from './canvasBackground.ts';
import { DEFAULT_CANVAS_BACKGROUND } from './canvasBackground.ts';
import type { CanvasDecoration } from './canvasDecoration.ts';
import { CanvasDecorationLayer } from './CanvasDecorationLayer.tsx';
import { useFeatherSway } from './useFeatherSway.ts';
import type { NodePresentation } from './nodePresentation.ts';
import { bpmFromIntervalMs, volumeFromVelocity } from './tempo.ts';
import { SOUND_PRESETS, DEFAULT_SOUND_PRESET_ID, EXTERNAL_SOUND_PRESET_ID } from './synth/soundPresets.ts';
import { SoftSelect } from './ui/SoftSelect.tsx';
import { t, type AppLocale } from './i18n.ts';
import './quad.css';

/** MIDI Channel 1–16（一端口四分轨） */
const MIDI_CHANNEL_OPTIONS = Array.from({ length: 16 }, (_, index) => {
  const channel = index + 1;
  return { value: String(channel), label: String(channel) };
});

/** 内置音色平铺、按名称 A→Z */
const BUILTIN_SOUND_OPTIONS = [...SOUND_PRESETS]
  .sort((a, b) => a.name.localeCompare(b.name, 'en'))
  .map((preset) => ({ value: preset.id, label: preset.name, category:preset.id.startsWith('dx7-')?'fm':preset.kind==='piano'||preset.kind==='marimba'?'acoustic':'electronic' }));

const SOUND_CATEGORIES=[{value:'fm',label:'FM'},{value:'electronic',label:'电子'},{value:'acoustic',label:'原声'}];

const EXTERNAL_SOUND_OPTION = {
  value: EXTERNAL_SOUND_PRESET_ID,
  label: '外接音色',
};
const CONNECTED_SOUND_OPTIONS = [EXTERNAL_SOUND_OPTION, ...BUILTIN_SOUND_OPTIONS];

const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/** 调性简写：抬头 HUD 空间有限，长音阶名截断成 3–6 字符 */
const SCALE_SHORT_LABELS: Record<string, string> = {
  major: 'Maj',
  minor: 'min',
  majorPentatonic: 'MajP',
  minorPentatonic: 'minP',
  maj7: 'Maj7',
  min7: 'min7',
  dom7: 'Dom7',
  diminished: 'Dim',
  chromatic: 'Chr',
  wholeTone: 'Whole',
};

export type QuadLilyCanvasLayout = 'quad' | 'single';

/** 画布缩放：80%–120%，默认 100%（过宽易误点） */
const ZOOM_MIN = 0.8;
const ZOOM_MAX = 1.2;
/** 每像素滚动量对应的缩放增量 */
const ZOOM_PER_PIXEL = 0.0009;

/** 滚轮调音节流：累计 deltaY 超过该阈值才走一个步进，避免过于灵敏 */
const WHEEL_STEP_THRESHOLD = 40;
/** 同一节点连续滚动的合并窗口（毫秒）：窗口内以本地草稿值为基准，避免播放期音高锁定吞掉步进 */
const WHEEL_DRAFT_WINDOW_MS = 900;
/** 防御性音阶步进边界 */
const SCALE_STEP_LIMIT = 36;

export interface QuadLilyPadViewModel {
  id: QuadPadId;
  nodes: readonly LilyNode[];
  decoration?: CanvasDecoration;
  intervalMs: number;
  playing: boolean;
  paused?: boolean;
  locked: boolean;
  selected: boolean;
  cyclePhase: number;
  activeNodeIds?: readonly string[];
  playedNodeIds?: readonly string[];
  timingPad?: QuadLilyPad;
  selectedNodeId?: string | null;
  /** Ctrl 多选高亮：包含选中的全部节点 id */
  selectedNodeIds?: readonly string[];
  /** @deprecated 单编队枢纽；优先读 formationHubs */
  formationHub?: {
    id: string;
    x: number;
    y: number;
    shape: 'circle' | 'line' | 'flash';
    selected: boolean;
  } | null;
  /** 多编队中心枢纽 */
  formationHubs?: readonly {
    id: string;
    x: number;
    y: number;
    shape: 'circle' | 'line' | 'flash';
    selected: boolean;
  }[];
  motionRenderStates?: readonly LilyMotionRenderState[];
  cycleCompilation?: {
    edges: readonly Pick<LilyCycleEdge, 'fromId' | 'toId'>[];
  } & Partial<LilyCycleCompilation>;
  nodePresentations?: ReadonlyMap<string, NodePresentation>;
  /** 抬头 HUD：音量（内部 velocity，0–1 可超出） */
  velocity?: number;
  /** 抬头 HUD：调性根音 MIDI */
  rootMidi?: number;
  /** 抬头 HUD：音阶 key */
  scaleKey?: string;
  /** 单轨抬头：该 Pad 的 MIDI Channel 1–16 */
  midiChannel?: number;
}

export interface QuadLilyPoint {
  x: number;
  y: number;
}

export interface LilyMotionRenderState {
  nodeId: string;
  mode: 'orbit' | 'pendulum' | 'draw' | 'flash' | 'formation';
  base: QuadLilyPoint;
  current: QuadLilyPoint;
  trail: readonly QuadLilyPoint[];
  drawStatus?: 'idle' | 'armed' | 'recording' | 'ready';
}

export interface QuadLilyCanvasProps {
  pads: readonly QuadLilyPadViewModel[];
  layout?: QuadLilyCanvasLayout;
  /** Opt-in: reuse the single-pad controls in every quadrant. */
  showQuadToolbar?: boolean;
  featherSway?: boolean;
  playbackVisualMode?: PlaybackVisualMode;
  mobilePadId?: QuadPadId;
  className?: string;
  showNodeLabels?: boolean;
  onSelectPad: (padId: QuadPadId) => void;
  onFocusPad?: (padId: QuadPadId) => void;
  onAddNode: (padId: QuadPadId, point: QuadLilyPoint) => void;
  onNodePointerDown: (
    padId: QuadPadId,
    nodeId: string,
    event: React.PointerEvent<SVGGElement>,
  ) => void;
  /** 点击编队中心枢纽 */
  onSelectFormation?: (padId: QuadPadId, formationId?: string) => void;
  /** 按下编队枢纽开始拖动整组 */
  onFormationPointerDown?: (
    padId: QuadPadId,
    event: React.PointerEvent<SVGGElement>,
    formationId?: string,
  ) => void;
  onDeleteNode: (padId: QuadPadId, nodeId: string) => void;
  onTogglePlaying: (padId: QuadPadId) => void;
  onToggleLocked: (padId: QuadPadId) => void;
  /** 任意节点的局部补丁；滚轮调音需要它（指针悬停的节点不一定是侧栏选中的节点） */
  onPatchNode?: (padId: QuadPadId, nodeId: string, patch: LilyNodePatch) => void;
  /** 画布背景图案，默认 'none' */
  canvasBackgroundPattern?: CanvasBackgroundPattern;

  /* --- 单轨抬头工具条（single 布局）；不传则沿用旧版 PLAY / LOCK 抬头 --- */
  /** 界面语言 */
  locale?: AppLocale;
  /** 当前音色 id（含外接音色） */
  soundPresetId?: string;
  /** 切换音色（全局单音色引擎） */
  onSetSoundPreset?: (presetId: string, padId?: QuadPadId) => void;
  /** 已连接外部 MIDI 端口时，音色列表出现「外接音色」 */
  midiConnected?: boolean;
  /** 设置该 Pad 的 MIDI Channel */
  onSetPadMidiChannel?: (padId: QuadPadId, channel: number) => void;
  /** 清空该 Pad 的外部节点 */
  onClearPad?: (padId: QuadPadId) => void;
  /** 把该 Pad 存成单轨图案卡片 */
  onSavePad?: (padId: QuadPadId) => void;
  /** 切换节点信息标签显示 */
  onToggleInfo?: () => void;
}

interface LilyConnection {
  from: LilyNode;
  to: LilyNode;
  fromId: string;
  toId: string;
}

export const QuadLilyCanvas: React.FC<QuadLilyCanvasProps> = ({
  onFocusPad,
  pads,
  layout = 'quad',
  showQuadToolbar = false,
  featherSway = false,
  playbackVisualMode = 'original' as PlaybackVisualMode,
  mobilePadId = 'A',
  className,
  showNodeLabels = true,
  onSelectPad,
  onAddNode,
  onNodePointerDown,
  onSelectFormation,
  onFormationPointerDown,
  onDeleteNode,
  onTogglePlaying,
  onToggleLocked,
  onPatchNode,
  canvasBackgroundPattern = DEFAULT_CANVAS_BACKGROUND,
  locale = 'zh',
  soundPresetId,
  onSetSoundPreset,
  midiConnected = false,
  onSetPadMidiChannel,
  onClearPad,
  onSavePad,
  onToggleInfo,
}) => {
  const tr = useUiText();
  const classes = ['quad-lily-canvas', className].filter(Boolean).join(' ');
  const visualFrames = playbackVisualFrames(playbackVisualMode === 'original' ? [] : pads.map(pad=>({
    ...pad,
    score:pad.timingPad&&pad.cycleCompilation?.events&&pad.cycleCompilation.intervalMs
      ?playbackVisualScore(pad.cycleCompilation as LilyCycleCompilation,pad.timingPad):null,
  })),playbackVisualMode);

  return (
    <section
      className={classes}
      data-layout={layout}
      data-playback-visual={playbackVisualMode}
      data-quad-toolbar={layout === 'quad' && showQuadToolbar ? 'true' : undefined}
      data-active-pad={mobilePadId}
      data-canvas-bg={canvasBackgroundPattern}
      aria-label={tr("四组 Lily Pad 舞台")}
    >
      {pads.map((pad) => (
        <LilyQuadrant
          key={pad.id}
          pad={pad}
          layout={layout}
          showQuadToolbar={showQuadToolbar}
          featherSway={featherSway}
          visualFrame={visualFrames.get(pad.id)}
          mobileActive={pad.id === mobilePadId}
          showNodeLabels={showNodeLabels}
          onSelectPad={onSelectPad}
          onFocusPad={onFocusPad}
          onAddNode={onAddNode}
          onNodePointerDown={onNodePointerDown}
          onSelectFormation={onSelectFormation}
          onFormationPointerDown={onFormationPointerDown}
          onDeleteNode={onDeleteNode}
          onTogglePlaying={onTogglePlaying}
          onToggleLocked={onToggleLocked}
          onPatchNode={onPatchNode}
          locale={locale}
          soundPresetId={pad.soundPresetId ?? soundPresetId}
          onSetSoundPreset={onSetSoundPreset}
          midiConnected={midiConnected}
          onSetPadMidiChannel={onSetPadMidiChannel}
          onClearPad={onClearPad}
          onSavePad={onSavePad}
          onToggleInfo={onToggleInfo}
        />
      ))}
    </section>
  );
};

const LilyQuadrant: React.FC<{
  pad: QuadLilyPadViewModel;
  layout: QuadLilyCanvasLayout;
  showQuadToolbar: boolean;
  featherSway: boolean;
  visualFrame?: PlaybackVisualFrame;
  mobileActive: boolean;
  showNodeLabels: boolean;
  onSelectPad: QuadLilyCanvasProps['onSelectPad'];
  onFocusPad?: QuadLilyCanvasProps['onFocusPad'];
  onAddNode: QuadLilyCanvasProps['onAddNode'];
  onNodePointerDown: QuadLilyCanvasProps['onNodePointerDown'];
  onSelectFormation?: QuadLilyCanvasProps['onSelectFormation'];
  onFormationPointerDown?: QuadLilyCanvasProps['onFormationPointerDown'];
  onDeleteNode: QuadLilyCanvasProps['onDeleteNode'];
  onTogglePlaying: QuadLilyCanvasProps['onTogglePlaying'];
  onToggleLocked: QuadLilyCanvasProps['onToggleLocked'];
  onPatchNode?: QuadLilyCanvasProps['onPatchNode'];
  locale: AppLocale;
  soundPresetId?: string;
  onSetSoundPreset?: QuadLilyCanvasProps['onSetSoundPreset'];
  midiConnected?: boolean;
  onSetPadMidiChannel?: QuadLilyCanvasProps['onSetPadMidiChannel'];
  onClearPad?: QuadLilyCanvasProps['onClearPad'];
  onSavePad?: QuadLilyCanvasProps['onSavePad'];
  onToggleInfo?: QuadLilyCanvasProps['onToggleInfo'];
}> = ({
  onFocusPad,
  pad,
  layout,
  showQuadToolbar,
  featherSway,
  visualFrame,
  mobileActive,
  showNodeLabels,
  onSelectPad,
  onAddNode,
  onNodePointerDown,
  onSelectFormation,
  onFormationPointerDown,
  onDeleteNode,
  onTogglePlaying,
  onToggleLocked,
  onPatchNode,
  locale,
  soundPresetId,
  onSetSoundPreset,
  midiConnected = false,
  onSetPadMidiChannel,
  onClearPad,
  onSavePad,
  onToggleInfo,
}) => {
  const tr = useUiText();
  const activeNodes = new Set(pad.activeNodeIds ?? []);
  const nodeById = new Map<string, LilyNode>(pad.nodes.map(node => [node.id, node] as const));
  const connections = (pad.cycleCompilation?.edges ?? []).flatMap((edge): LilyConnection[] => {
    const from = nodeById.get(edge.fromId);
    const to = nodeById.get(edge.toId);
    return from && to ? [{ from, to, fromId: edge.fromId, toId: edge.toId }] : [];
  });
  const phase = clampUnit(pad.cyclePhase);
  const motionRenderStates = pad.motionRenderStates ?? [];
  const arrowId = `quad-lily-arrow-${pad.id}`;

  /**
   * 单轨工具条也可由宿主显式开启到四宫格；
   * 缺省时保持旧版 PLAY / LOCK 抬头，避免影响 Floating / Performer / 原版机架。
   */
  const compactHeader = (layout === 'single' || showQuadToolbar)
    && Boolean(onSavePad || onClearPad || onSetSoundPreset || onSetPadMidiChannel || onToggleInfo);
  const bpm = bpmFromIntervalMs(pad.intervalMs);
  const volume = pad.velocity === undefined ? null : volumeFromVelocity(pad.velocity);
  const keyLabel = pad.rootMidi === undefined ? null : formatKeyLabel(pad.rootMidi, pad.scaleKey);
  const playLabel = pad.playing
    ? t(locale, 'pause')
    : pad.paused
      ? t(locale, 'resume')
      : t(locale, 'play');

  /* --- 滚轮：空白处缩放画布，节点上步进音阶 --- */
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const unprojectSway = useFeatherSway(svgRef, featherSway, pad.decoration, pad.nodes, pad.id);
  const [zoom, setZoom] = React.useState(1);
  /** 与视口宽高比匹配的 viewBox，消除 meet letterbox 造成的两侧空气墙 */
  const [viewBox, setViewBox] = React.useState(() => zoomViewBox(1, 16 / 9));
  const wheelAccumRef = React.useRef(0);
  /** 连续滚动期间的本地音高草稿，避免播放时读到上一周期的锁定值 */
  const pitchDraftRef = React.useRef<{ nodeId: string; value: number; at: number } | null>(null);
  /** 用 ref 承接最新 props，非被动监听器只需绑定一次 */
  const wheelContextRef = React.useRef({
    padId: pad.id,
    locked: pad.locked,
    nodes: pad.nodes,
    onPatchNode,
    onSelectPad,
  });
  wheelContextRef.current = { padId: pad.id, locked: pad.locked, nodes: pad.nodes, onPatchNode, onSelectPad };

  React.useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const syncViewBox = () => {
      const width = viewport.clientWidth;
      const height = viewport.clientHeight;
      if (width <= 0 || height <= 0) return;
      setViewBox(zoomViewBox(zoom, width / height));
    };
    syncViewBox();
    const observer = new ResizeObserver(syncViewBox);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [zoom]);

  React.useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleWheel = (event: WheelEvent) => {
      // React 把 wheel 注册成 passive，必须用原生非被动监听器才能阻止页面滚动
      event.preventDefault();
      const context = wheelContextRef.current;
      const target = event.target as Element | null;
      const nodeGroup = target?.closest?.('.quad-lily-node') as SVGGElement | null;
      const nodeId = nodeGroup?.getAttribute('data-node-id') ?? null;

      // 指针不在节点上（或该 Pad 已锁定 / 宿主没接 onPatchNode）→ 缩放画布
      if (!nodeId || context.locked || !context.onPatchNode) {
        wheelAccumRef.current = 0;
        pitchDraftRef.current = null;
        setZoom(previous => clampZoom(previous - event.deltaY * ZOOM_PER_PIXEL));
        return;
      }

      wheelAccumRef.current += event.deltaY;
      if (Math.abs(wheelAccumRef.current) < WHEEL_STEP_THRESHOLD) return;
      // 一次阈值只走一个半音，快速滚动不会跳段
      const direction = wheelAccumRef.current > 0 ? -1 : 1;
      wheelAccumRef.current = 0;

      const node = context.nodes.find(candidate => candidate.id === nodeId);
      if (!node) return;
      const draft = pitchDraftRef.current;
      const base = draft && draft.nodeId === nodeId && event.timeStamp - draft.at < WHEEL_DRAFT_WINDOW_MS
        ? draft.value
        : node.scaleStep;
      const scaleStep = clampScaleStep(base + direction);
      pitchDraftRef.current = { nodeId, value: scaleStep, at: event.timeStamp };
      context.onSelectPad(context.padId);
      context.onPatchNode(context.padId, nodeId, { scaleStep });
    };

    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel);
  }, []);

  return (
    <article
      className="quad-lily-pad"
      data-pad-id={pad.id}
      data-selected={pad.selected ? 'true' : 'false'}
      data-playing={pad.playing ? 'true' : 'false'}
      data-paused={pad.paused ? 'true' : 'false'}
      data-locked={pad.locked ? 'true' : 'false'}
      data-mobile-active={mobileActive ? 'true' : 'false'}
      aria-label={`Pad ${pad.id}`}
    >
      <span className="quad-lily-pad__corner quad-lily-pad__corner--tl" aria-hidden="true" />
      <span className="quad-lily-pad__corner quad-lily-pad__corner--tr" aria-hidden="true" />
      <span className="quad-lily-pad__corner quad-lily-pad__corner--bl" aria-hidden="true" />
      <span className="quad-lily-pad__corner quad-lily-pad__corner--br" aria-hidden="true" />

      <header className="quad-lily-pad__header" data-compact={compactHeader ? 'true' : 'false'}>
        <button
          type="button"
          className="quad-lily-pad__identity"
          aria-label={onFocusPad ? (layout === 'single' ? tr("Pad {0} · 返回四宫格", pad.id) : tr("单独查看 Pad {0}", pad.id)) : tr("选择 Pad {0}", pad.id)}
          title={onFocusPad ? (layout === 'single' ? tr("点击返回四宫格") : tr("点击单独查看 {0}", pad.id)) : undefined}
          aria-pressed={pad.selected}
          onClick={() => (onFocusPad ?? onSelectPad)(pad.id)}
        >
          <span className="quad-lily-pad__state" aria-hidden="true" />
          <strong>{pad.id}</strong>
          {!compactHeader && <span>{Math.round(pad.intervalMs)} ms</span>}
        </button>

        {compactHeader ? (
          /* Reuse the same per-pad callbacks in single and expanded quad headers. */
          <div className="quad-lily-pad__toolbar" role="toolbar" aria-label={`Pad ${pad.id} track controls`}>
            <div className="quad-lily-pad__actions" role="group">
              <button
                type="button"
                className="quad-action--primary quad-lily-pad__icon-btn"
                aria-label={`${pad.playing ? tr("暂停") : pad.paused ? tr("继续") : tr("播放")} Pad ${pad.id}`}
                title={playLabel}
                aria-pressed={pad.playing}
                onClick={() => {
                  onSelectPad(pad.id);
                  onTogglePlaying(pad.id);
                }}
              >
                {pad.playing
                  ? <Pause size={14} strokeWidth={2.25} aria-hidden />
                  : <Play size={14} strokeWidth={2.25} aria-hidden />}
              </button>
              {onSavePad && (
                <button
                  type="button"
                  className="quad-action--secondary quad-lily-pad__icon-btn"
                  aria-label={tr("保存 Pad {0}", pad.id)}
                  title={t(locale, 'savePad')}
                  onClick={() => {
                    onSelectPad(pad.id);
                    onSavePad(pad.id);
                  }}
                >
                  <Save size={14} strokeWidth={2.25} aria-hidden />
                </button>
              )}
              <button
                type="button"
                className="quad-action--secondary quad-lily-pad__icon-btn"
                aria-label={`${pad.locked ? tr("解锁") : tr("锁定")} Pad ${pad.id}`}
                title={pad.locked ? tr("解锁编辑") : tr("锁定图案")}
                aria-pressed={pad.locked}
                onClick={() => {
                  onSelectPad(pad.id);
                  onToggleLocked(pad.id);
                }}
              >
                {pad.locked
                  ? <Lock size={14} strokeWidth={2.25} aria-hidden />
                  : <LockOpen size={14} strokeWidth={2.25} aria-hidden />}
              </button>
              {onClearPad && (
                <button
                  type="button"
                  className="quad-action--secondary quad-lily-pad__icon-btn"
                  aria-label={tr("清空 Pad {0}", pad.id)}
                  title={t(locale, 'clear')}
                  disabled={pad.locked}
                  onClick={() => {
                    onSelectPad(pad.id);
                    onClearPad(pad.id);
                  }}
                >
                  <Trash2 size={14} strokeWidth={2.25} aria-hidden />
                </button>
              )}
              {onToggleInfo && (
                <button
                  type="button"
                  className="quad-action--secondary quad-lily-pad__icon-btn"
                  aria-label={showNodeLabels ? tr("隐藏节点信息") : tr("显示节点信息")}
                  title={`${t(locale, 'info')} ${showNodeLabels ? 'ON' : 'OFF'}`}
                  aria-pressed={showNodeLabels}
                  onClick={onToggleInfo}
                >
                  <Info size={14} strokeWidth={2.25} aria-hidden />
                </button>
              )}
            </div>

            <div className="quad-lily-pad__io">
              {onSetSoundPreset && (
                <SoftSelect
                  variant="default"
                  prefix={t(locale, 'sound')}
                  aria-label={layout === 'quad' ? `Pad ${pad.id} Sound preset` : 'Sound preset'}
                  categories={SOUND_CATEGORIES}
                  value={
                    midiConnected
                      ? (soundPresetId || EXTERNAL_SOUND_PRESET_ID)
                      : (soundPresetId === EXTERNAL_SOUND_PRESET_ID
                        ? DEFAULT_SOUND_PRESET_ID
                        : (soundPresetId || DEFAULT_SOUND_PRESET_ID))
                  }
                  options={
                    midiConnected
                      ? CONNECTED_SOUND_OPTIONS
                      : BUILTIN_SOUND_OPTIONS
                  }
                  onChange={(next) => onSetSoundPreset(next, pad.id)}
                />
              )}
              {onSetPadMidiChannel && (
                <SoftSelect
                  variant="channel"
                  prefix={t(locale, 'channel')}
                  aria-label={`Pad ${pad.id} MIDI channel`}
                  value={String(pad.midiChannel ?? 1)}
                  options={MIDI_CHANNEL_OPTIONS}
                  onChange={(next) => onSetPadMidiChannel(pad.id, Number(next))}
                />
              )}
            </div>
          </div>
        ) : (
          <div className="quad-lily-pad__actions">
            <button
              type="button"
              className="quad-action--primary"
              aria-label={`${pad.playing ? tr("暂停") : pad.paused ? tr("继续") : tr("播放")} Pad ${pad.id}`}
              aria-pressed={pad.playing}
              onClick={() => {
                onSelectPad(pad.id);
                onTogglePlaying(pad.id);
              }}
            >
              {pad.playing ? 'PAUSE' : pad.paused ? 'RESUME' : 'PLAY'}
            </button>
            <button
              type="button"
              className="quad-action--secondary"
              aria-label={`${pad.locked ? tr("解锁") : tr("锁定")} Pad ${pad.id}`}
              aria-pressed={pad.locked}
              onClick={() => {
                onSelectPad(pad.id);
                onToggleLocked(pad.id);
              }}
            >
              {pad.locked ? 'UNLOCK' : 'LOCK'}
            </button>
          </div>
        )}
      </header>

      {/* 次要运行参数：贴画布左下角，避免抢抬头注意力 */}
      {compactHeader && layout === 'single' && (
        <div className="quad-lily-pad__hud" aria-label={tr("Pad {0} 运行参数", pad.id)}>
          <span className="quad-lily-pad__hud-item" title="BPM">
            <b>{bpm}</b>
          </span>
          {volume !== null && (
            <span className="quad-lily-pad__hud-item" title="Volume">
              <b>{volume}</b>
            </span>
          )}
          {keyLabel && (
            <span className="quad-lily-pad__hud-item" title="Key / scale">
              <b>{keyLabel}</b>
            </span>
          )}
          <span className="quad-lily-pad__hud-item" title="Node count">
            <b>{pad.nodes.length}n</b>
          </span>
        </div>
      )}

      <div
        className="quad-lily-pad__viewport"
        ref={viewportRef}
        data-zoom={zoom.toFixed(2)}
      >
        {zoom !== 1 && (
          <button
            type="button"
            className="quad-lily-pad__zoom"
            aria-label={`Reset Pad ${pad.id} zoom`}
            title="Reset zoom to 100%"
            onClick={() => setZoom(1)}
          >
            {Math.round(zoom * 100)}%
          </button>
        )}

      <svg
        ref={svgRef}
        className="quad-lily-pad__canvas"
        /* viewBox 随视口比例变化，整块画布都可落点（无 letterbox 空气墙） */
        viewBox={viewBox}
        preserveAspectRatio="none"
        role="application"
        aria-label={tr("编辑 Pad {0} 的 Lily Pad", pad.id)}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          onSelectPad(pad.id);
          if (pad.locked) return;
          onAddNode(pad.id, unprojectSway(pointerToViewBox(event)));
        }}
      >
        <defs>
          <marker id={arrowId} viewBox="0 0 4 4" refX="3.6" refY="2" markerWidth="3.2" markerHeight="3.2" orient="auto">
            <path className="quad-lily-pad__arrow" d="M 0 0 L 4 2 L 0 4 Z" />
          </marker>
        </defs>

        <circle className="quad-lily-pad__cycle-track" cx="50" cy="50" r="45.5" pathLength="1" />
        <circle
          className="quad-lily-pad__cycle-value"
          cx="50"
          cy="50"
          r="45.5"
          pathLength="1"
          strokeDasharray={`${phase} ${1 - phase}`}
          data-active={pad.playing ? 'true' : 'false'}
        />

        <CanvasDecorationLayer decoration={pad.decoration} />

        <g className="quad-lily-motion" aria-hidden="true">
          {motionRenderStates.map((motion) => {
            const selected = (pad.selectedNodeIds?.includes(motion.nodeId) ?? false)
              || pad.selectedNodeId === motion.nodeId;
            const trailPoints = motion.trail
              .map(point => `${toViewBox(point.x)},${toViewBox(point.y)}`)
              .join(' ');
            return (
              <g
                key={`motion:${motion.nodeId}`}
                data-motion-mode={motion.mode}
                data-selected={selected ? 'true' : 'false'}
                data-draw-status={motion.drawStatus ?? 'idle'}
              >
                {trailPoints && <polyline className="quad-lily-motion__trail" points={trailPoints} />}
                <rect
                  className="quad-lily-motion__anchor"
                  x={toViewBox(motion.base.x) - 1.8}
                  y={toViewBox(motion.base.y) - 1.8}
                  width="3.6"
                  height="3.6"
                />
                {motion.mode === 'flash' && motion.trail.length >= 2 && (
                  <rect
                    className="quad-lily-motion__anchor"
                    x={toViewBox(motion.trail[1].x) - 1.8}
                    y={toViewBox(motion.trail[1].y) - 1.8}
                    width="3.6"
                    height="3.6"
                  />
                )}
                {selected && (
                  <line
                    className="quad-lily-motion__tether"
                    x1={toViewBox(motion.base.x)}
                    y1={toViewBox(motion.base.y)}
                    x2={toViewBox(motion.current.x)}
                    y2={toViewBox(motion.current.y)}
                  />
                )}
              </g>
            );
          })}
        </g>

        <g className="quad-lily-pad__connections" aria-hidden="true">
          {connections.map(({ from, to, fromId, toId }) => (
            <line
              key={`${fromId}:${toId}`}
              x1={toViewBox(from.x)}
              y1={toViewBox(from.y)}
              x2={toViewBox(to.x)}
              y2={toViewBox(to.y)}
              data-from-node-id={fromId}
              data-to-node-id={toId}
              markerEnd={`url(#${arrowId})`}
              data-active={activeNodes.has(from.id) || activeNodes.has(to.id) ? 'true' : 'false'}
            />
          ))}
        </g>

        <g className="quad-lily-pad__ranges" aria-hidden="true">
          {pad.nodes.map((node) => (
            <circle
              key={`range:${node.id}`}
              data-range-node-id={node.id}
              cx={toViewBox(node.x)}
              cy={toViewBox(node.y)}
              r={rangeToRadius(node.range)}
              data-center={node.isCenter ? 'true' : 'false'}
              data-muted={node.muted ? 'true' : 'false'}
              data-hidden={node.hidden ? 'true' : 'false'}
            />
          ))}
        </g>

        <g className="quad-lily-pad__nodes">
          {(pad.formationHubs?.length
            ? pad.formationHubs
            : pad.formationHub
              ? [pad.formationHub]
              : []
          ).map((hub) => (
            <g
              key={hub.id}
              className="quad-lily-formation-hub"
              transform={`translate(${toViewBox(hub.x)} ${toViewBox(hub.y)})`}
              data-selected={hub.selected ? 'true' : 'false'}
              data-shape={hub.shape}
              role="button"
              tabIndex={pad.locked ? -1 : 0}
              aria-label={tr("编队 {0}", hub.id)}
              onPointerDown={(event) => {
                event.stopPropagation();
                if (event.button !== 0 || pad.locked) return;
                onSelectPad(pad.id);
                if (onFormationPointerDown) {
                  onFormationPointerDown(pad.id, event, hub.id);
                } else {
                  onSelectFormation?.(pad.id, hub.id);
                }
              }}
              style={{ cursor: pad.locked ? 'default' : 'grab' }}
            >
              <circle className="quad-lily-formation-hub__hit" r="4.2" />
              <circle className="quad-lily-formation-hub__ring" r="3.2" />
              <rect
                className="quad-lily-formation-hub__core"
                x="-1.6"
                y="-1.6"
                width="3.2"
                height="3.2"
                transform="rotate(45)"
              />
              <text className="quad-lily-formation-hub__label" y="0.55" textAnchor="middle">
                {hub.id}
              </text>
            </g>
          ))}
          {pad.nodes.map((node) => (
            <LilyNodeGlyph
              key={node.id}
              padId={pad.id}
              node={node}
              layout={layout}
              active={activeNodes.has(node.id)}
              selected={
                (pad.selectedNodeIds?.includes(node.id) ?? false)
                || pad.selectedNodeId === node.id
              }
              locked={pad.locked}
              playing={pad.playing}
              presentation={pad.nodePresentations?.get(node.id)}
              showLabel={showNodeLabels}
              visualFocus={visualFrame?.focusIds.includes(node.id)}
              visualPlayed={visualFrame?.playedIds.includes(node.id)}
              onSelectPad={onSelectPad}
              onNodePointerDown={onNodePointerDown}
              onDeleteNode={onDeleteNode}
            />
          ))}
        </g>
        <PlaybackVisualLayer frame={visualFrame} nodes={pad.nodes}/>
      </svg>
      </div>
    </article>
  );
};

type GlyphProps = {
  padId: QuadPadId;
  node: LilyNode;
  layout: QuadLilyCanvasLayout;
  active: boolean;
  selected: boolean;
  locked: boolean;
  playing: boolean;
  presentation?: NodePresentation;
  showLabel: boolean;
  visualFocus?: boolean;
  visualPlayed?: boolean;
  onSelectPad: QuadLilyCanvasProps['onSelectPad'];
  onNodePointerDown: QuadLilyCanvasProps['onNodePointerDown'];
  onDeleteNode: QuadLilyCanvasProps['onDeleteNode'];
};

const LilyNodeGlyph: React.FC<GlyphProps> = (props) => {
  const latest = React.useRef(props);
  React.useLayoutEffect(() => { latest.current = props; });
  const handlers = React.useMemo(() => ({
    onSelectPad: ((...args) => latest.current.onSelectPad(...args)) as GlyphProps['onSelectPad'],
    onNodePointerDown: ((...args) => latest.current.onNodePointerDown(...args)) as GlyphProps['onNodePointerDown'],
    onDeleteNode: ((...args) => latest.current.onDeleteNode(...args)) as GlyphProps['onDeleteNode'],
  }), []);
  return <MemoGlyph {...props} {...handlers} />;
};

const MemoGlyph = React.memo(function Glyph({
  padId,
  node,
  layout,
  active,
  selected,
  locked,
  playing,
  presentation,
  showLabel,
  visualFocus,
  visualPlayed,
  onSelectPad,
  onNodePointerDown,
  onDeleteNode,
}: GlyphProps) {
  const tr = useUiText();
  const x = toViewBox(node.x);
  const y = toViewBox(node.y);
  /* 主画布黑节点约缩到 2/3，badge / hit / pulse / selection 同步 */
  const size = node.isCenter ? 2.9 : 2.1;
  const labelDensity = layout === 'single' ? 'detail' : 'compact';
  const badgeSize = labelDensity === 'detail'
    ? node.isCenter ? 5.6 : 5.1
    : node.isCenter ? 4.3 : 3.9;
  const badgeIdentifier = labelDensity === 'compact'
    ? presentation?.shortId === 'ROOT'
      ? 'R'
      : presentation?.shortId.replace(/^N/, '')
    : presentation?.shortId;
  const deleteNode = () => {
    if (!locked && !node.isCenter) onDeleteNode(padId, node.id);
  };

  return (
    <g
      className="quad-lily-node"
      transform={`translate(${x} ${y})`}
      data-node-id={node.id}
      data-visual-focus={visualFocus ? 'true' : undefined}
      data-visual-played={visualPlayed ? 'true' : undefined}
      data-center={node.isCenter ? 'true' : 'false'}
      data-active={active && playing ? 'true' : 'false'}
      data-selected={selected ? 'true' : 'false'}
      data-locked={locked ? 'true' : 'false'}
      data-muted={node.muted ? 'true' : 'false'}
      data-hidden={node.hidden ? 'true' : 'false'}
      role="button"
      tabIndex={locked ? -1 : 0}
      aria-label={(presentation
        ? tr("{0} {1}，音符 {2}，音阶步进 {3}", padId, presentation.shortId, presentation.noteName, formatStep(node.scaleStep))
        : tr("{0} {1}，音阶步进 {2}", padId, node.isCenter ? tr("中心节点") : tr("节点 {0}", node.id), formatStep(node.scaleStep)))
        + formatNodeStateSuffix(tr, node)}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (event.button !== 0) return;
        onSelectPad(padId);
        if (!locked) onNodePointerDown(padId, node.id, event);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelectPad(padId);
        deleteNode();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Delete' && event.key !== 'Backspace') return;
        event.preventDefault();
        deleteNode();
      }}
    >
      <title>{`${node.isCenter ? tr("中心") : tr("节点")} ${node.id} · STEP ${formatStep(node.scaleStep)}${formatNodeStateSuffix(tr, node)}`}</title>
      <circle className="quad-lily-node__hit" r="3.4" />
      <circle className="quad-lily-node__pulse" r="3.6" />
      {showLabel && presentation && (
        <rect
          className="quad-lily-node__badge"
          data-label-density={labelDensity}
          x={-badgeSize / 2}
          y={-badgeSize / 2}
          width={badgeSize}
          height={badgeSize}
        />
      )}
      {(!showLabel || !presentation) && (
        <rect className="quad-lily-node__core" x={-size / 2} y={-size / 2} width={size} height={size} />
      )}
      {/* 选中态只保留一种实线环；中心不再叠额外方框（badge / ROOT 已表达中心语义） */}
      {selected && (
        <circle
          className="quad-lily-node__selection"
          r={(showLabel && presentation ? badgeSize : size) / 2 + 0.55}
        />
      )}
      {showLabel && presentation && (
        <text
          className="quad-lily-node__badge-label"
          data-label-density={labelDensity}
          textAnchor="middle"
          aria-hidden="true"
        >
          <tspan className="quad-lily-node__badge-id" x="0" y="-0.45">{badgeIdentifier}</tspan>
          <tspan className="quad-lily-node__badge-note" x="0" y="1.45">{presentation.noteName}</tspan>
        </text>
      )}
    </g>
  );
}, (a, b) => {
  const fields = ['padId','layout','active','selected','locked','playing','showLabel','visualFocus','visualPlayed','onSelectPad','onNodePointerDown','onDeleteNode'] as const;
  const nodeFields = ['id','x','y','isCenter','scaleStep','muted','hidden'] as const;
  return fields.every(k => a[k] === b[k]) && nodeFields.every(k => a.node[k] === b.node[k])
    && Boolean(a.presentation) === Boolean(b.presentation)
    && a.presentation?.shortId === b.presentation?.shortId
    && a.presentation?.noteName === b.presentation?.noteName;
});

function pointerToViewBox(event: React.PointerEvent<SVGSVGElement>): QuadLilyPoint {
  return clientPointToPad(event.currentTarget, event.clientX, event.clientY);
}

/**
 * 用 getBoundingClientRect + 当前 viewBox 线性映射。
 * viewBox 已与视口同比例时，整块 SVG 都是可编辑坐标，无两侧盲区。
 */
function clientPointToPad(svg: SVGSVGElement, clientX: number, clientY: number): QuadLilyPoint {
  const rect = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;
  const vbX = vb.width > 0 ? vb.x : 0;
  const vbY = vb.height > 0 ? vb.y : 0;
  const vbW = vb.width > 0 ? vb.width : 100;
  const vbH = vb.height > 0 ? vb.height : 100;
  if (rect.width <= 0 || rect.height <= 0) return { x: 0.5, y: 0.5 };

  const svgX = vbX + ((clientX - rect.left) / rect.width) * vbW;
  const svgY = vbY + ((clientY - rect.top) / rect.height) * vbH;
  return {
    x: clampRange(svgX / 100, vbX / 100, (vbX + vbW) / 100),
    y: clampRange(svgY / 100, vbY / 100, (vbY + vbH) / 100),
  };
}

function rangeToRadius(range: number): number {
  return Math.max(1.5, Math.min(48, clampUnit(range) * 100));
}

function toViewBox(value: number): number {
  return (Number.isFinite(value) ? value : 0.5) * 100;
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

function clampRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return (min + max) / 2;
  return Math.max(min, Math.min(max, value));
}

function formatStep(step: number): string {
  return step > 0 ? `+${step}` : String(step);
}

/** 静音 / 隐藏后缀：屏幕阅读器与 tooltip 都需要知道节点是否发声 */
function formatNodeStateSuffix(tr: (message: string, ...values: unknown[]) => string, node: LilyNode): string {
  if (node.hidden) return tr("，已隐藏（不参与传播）");
  if (node.muted) return tr("，已静音");
  return '';
}

function clampZoom(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, value));
}

/**
 * 按视口宽高比生成 viewBox：短边 = 120/zoom，长边拉伸匹配比例。
 * 这样 SVG 铺满视口，不会出现 meet 两侧空白「点了却落在边界」的空气墙。
 * preserveAspectRatio=none + 同比例 viewBox ⇒ 圆环仍是圆。
 */
function zoomViewBox(zoom: number, aspect: number): string {
  const safe = clampZoom(zoom);
  const short = 120 / safe;
  const ratio = Number.isFinite(aspect) && aspect > 0.05 ? aspect : 16 / 9;
  const vbW = ratio >= 1 ? short * ratio : short;
  const vbH = ratio >= 1 ? short : short / ratio;
  const originX = 50 - vbW / 2;
  const originY = 50 - vbH / 2;
  return `${originX} ${originY} ${vbW} ${vbH}`;
}

function clampScaleStep(value: number): number {
  return Math.max(-SCALE_STEP_LIMIT, Math.min(SCALE_STEP_LIMIT, Math.round(value)));
}

/** 调性简写，例如 C·MajP；未知音阶回退成大写前 4 字符 */
function formatKeyLabel(rootMidi: number, scaleKey?: string): string {
  const rootName = PITCH_NAMES[((Math.round(rootMidi) % 12) + 12) % 12];
  if (!scaleKey) return rootName;
  const short = SCALE_SHORT_LABELS[scaleKey] ?? scaleKey.slice(0, 4).toUpperCase();
  return `${rootName}·${short}`;
}

export default QuadLilyCanvas;
