import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { DEFAULT_SCALE_KEY, ROOT_NOTES, SCALES } from './musicTheory.ts';
import {
  readDeskMidiPorts,
  requestDeskMidiAccess,
  type DeskMidiPortsSnapshot,
} from './midiPorts.ts';
import { copyNotes, pasteNotes, type NoteClipboard } from './noteClipboard.ts';
import { createDeskPitchResolver } from './pitch.ts';
import { sendFm1ProgramChange } from './fm1.ts';
import { createQuadLilyAppView } from './appModel.ts';
import {
  addLilyNode,
  getPadCycleDurationMs,
  clearLilyPad,
  compileLilyCycle,
  deleteLilyNode,
  moveLilyNode,
  QUAD_PAD_IDS,
  updateLilyNode,
  updateLilyPad,
  type Fm1ToneSelection,
  type LilyCycleCompilation,
  type QuadLilyPad,
  type QuadLilyWorkspace,
  type QuadPadId,
} from './core.ts';
import { CycleTrace } from './CycleTrace.tsx';
import {
  advanceCyclePhases,
  buildCycleTracePair,
  resolveVisibleCycleState,
} from './cycleTraceModel.ts';
import { QuadCycleRunner } from './cycleRunner.ts';
import {
  compileDrawPath,
  snapDrawRateCycles,
  type AbsoluteDragSample,
  type DrawMotionKeyframe,
  type LilyNodeMotion,
} from './motion.ts';
import {
  allocateFormationId,
  applyEditorMotionToFormation,
  buildBatchIndividualMotions,
  createNoteFormation,
  detachNodesFromFormations,
  findFormationById,
  findFormationForNode,
  formationToEditorMotion,
  getPadFormations,
  moveGroupOrderItem,
  patchNoteFormation,
  removeFormationById,
  resolveFormationHomePositions,
  resolveGroupSelectionClick,
  sameFormationMembership,
  upsertFormation,
  type FormationShape,
} from './groupMotion.ts';
import { buildNodeMotionTrail, buildPadFormationTrail, materializePadMotion } from './motionRuntime.ts';
import { NodeMotionControls, type DrawCaptureStatus } from './NodeMotionControls.tsx';
import { NodePitchControls } from './NodePitchControls.tsx';
import { buildNodePresentations } from './nodePresentation.ts';
import {
  QuadLilyCanvas,
  type QuadLilyCanvasLayout,
  type LilyMotionRenderState,
  type QuadLilyPoint,
} from './QuadLilyCanvas.tsx';
import { QuadMidiBus } from './midiBus.ts';
import { quadSynthEngine } from './synth/quadSynthEngine.ts';
import { SOUND_PRESETS, DEFAULT_SOUND_PRESET_ID, EXTERNAL_SOUND_PRESET_ID } from './synth/soundPresets.ts';
import {
  QUAD_LILY_STORAGE_KEY,
  restoreQuadLilySession,
  serializeQuadLilySession,
} from './storage.ts';
import {
  QUAD_THEME_STORAGE_KEY,
  restoreQuadTheme,
  toggleQuadTheme,
  type QuadTheme,
} from './theme.ts';
import {
  CANVAS_BG_STORAGE_KEY,
  cycleCanvasBackground,
  restoreCanvasBackground,
  type CanvasBackgroundPattern,
} from './canvasBackground.ts';
import { shouldCaptureTransportKey, shouldToggleTransport } from './transport.ts';
import { resolveNodeLabelVisibility } from './nodeLabels.ts';
import {
  loadPadAssetIntoWorkspace,
  loadWorkspaceAsset,
  createUserPadAsset,
  createUserWorkspaceAsset,
  serializeLibraryAsset,
  type LibraryAsset,
} from './library/core.ts';
import { LibraryDrawer, createLibraryAssetId, persistLibraryAssetLocalFirst } from './library/LibraryDrawer.tsx';
import { OnboardingTour } from './onboarding/OnboardingTour.tsx';
import { createOnboardingGuideWorkspace, getOnboardingGuideCaptureMode, isOnboardingGuideCapture } from './onboarding/guideFixture.ts';
import { LocalStorageLibraryRepository } from './library/localStorage.ts';
import { saveLibraryItem } from './library/cloud.ts';
import { loadUiVariant, saveUiVariant, type UiVariant } from './variants/types.ts';
import { StudioLayout } from './variants/StudioLayout.tsx';
import { FloatingLayout } from './variants/FloatingLayout.tsx';
import { PerformerLayout } from './variants/PerformerLayout.tsx';
import type { QuadLilyLayoutProps } from './variants/layoutProps.ts';
import { useIdentity } from './auth/useIdentity.ts';
import { AuthModal } from './auth/AuthModal.tsx';
import { NicknameModal } from './auth/NicknameModal.tsx';
import {
  LOCALE_STORAGE_KEY,
  restoreLocale,
  toggleLocale,
  type AppLocale,
} from './i18n.ts';
import './variants/variants.css';

const EMPTY_MIDI_PORTS: DeskMidiPortsSnapshot = { outputs: [], selectedOutputId: null };
const PAD_COLORS: Record<QuadPadId, string> = {
  A: 'var(--quad-pad-a)',
  B: 'var(--quad-pad-b)',
  C: 'var(--quad-pad-c)',
  D: 'var(--quad-pad-d)',
};

type PadNodeSelection = Record<QuadPadId, string | null>;
/** 每 Pad 的组合点选顺序（Ctrl+点击维护） */
type PadGroupSelection = Record<QuadPadId, string[]>;
type PadNumberState = Record<QuadPadId, number>;
type PadActiveState = Record<QuadPadId, string[]>;
type PadBooleanState = Record<QuadPadId, boolean>;

interface MoveDragState {
  kind: 'move-base';
  padId: QuadPadId;
  nodeId: string;
  svg: SVGSVGElement;
  pointerId: number;
  startPointer: QuadLilyPoint;
  startBase: QuadLilyPoint;
}

/** 拖动编队枢纽：整组平移中心 + 成员基位 */
interface MoveFormationDragState {
  kind: 'move-formation';
  padId: QuadPadId;
  formationId: string;
  svg: SVGSVGElement;
  pointerId: number;
  startPointer: QuadLilyPoint;
  startCenter: QuadLilyPoint;
  memberStarts: Array<{ id: string; x: number; y: number }>;
}

/** armed 后按下节点，但尚未拖出阈值 — 不算开始录制 */
interface PendingDrawDragState {
  kind: 'pending-draw';
  padId: QuadPadId;
  nodeId: string;
  svg: SVGSVGElement;
  pointerId: number;
  base: QuadLilyPoint;
  originPointer: QuadLilyPoint;
  startedAt: number;
}

interface RecordDrawDragState {
  kind: 'record-draw';
  padId: QuadPadId;
  nodeId: string;
  svg: SVGSVGElement;
  pointerId: number;
  base: QuadLilyPoint;
  samples: AbsoluteDragSample[];
  startedAt: number;
}

type DragState = MoveDragState | MoveFormationDragState | PendingDrawDragState | RecordDrawDragState;

interface DrawCaptureState {
  padId: QuadPadId;
  nodeId: string;
  status: 'armed' | 'recording';
  /** draw=手绘拖录；flash=单点闪烁；flash-batch=多选共用偏移闪烁；formation-flash=编队闪烁目标 */
  kind?: 'draw' | 'flash' | 'flash-batch' | 'formation-flash';
  /** formation-flash 时锁定目标编队 id */
  formationId?: string;
}

interface DrawPreviewState {
  padId: QuadPadId;
  nodeId: string;
  point: QuadLilyPoint;
}

function createPadRecord<T>(factory: (padId: QuadPadId) => T): Record<QuadPadId, T> {
  return Object.fromEntries(QUAD_PAD_IDS.map(padId => [padId, factory(padId)])) as Record<QuadPadId, T>;
}

function loadInitialWorkspace(): QuadLilyWorkspace {
  if (typeof window === 'undefined') return restoreQuadLilySession(null);
  const guideMode = getOnboardingGuideCaptureMode();
  if (guideMode) return createOnboardingGuideWorkspace(guideMode);
  try {
    return restoreQuadLilySession(window.localStorage.getItem(QUAD_LILY_STORAGE_KEY));
  } catch {
    return restoreQuadLilySession(null);
  }
}

function loadInitialTheme(): QuadTheme {
  if (typeof window === 'undefined') return restoreQuadTheme(null);
  try {
    return restoreQuadTheme(window.localStorage.getItem(QUAD_THEME_STORAGE_KEY));
  } catch {
    return restoreQuadTheme(null);
  }
}

/** 忽略播放态，只比较可保存的 Pad 内容，用于 Library 载入前的脏检测。 */
function libraryWorkspaceFingerprint(workspace: QuadLilyWorkspace): string {
  return JSON.stringify({
    fm1Tone: workspace.fm1Tone,
    pads: QUAD_PAD_IDS.map((padId) => {
      const pad = workspace.pads[padId];
      return {
        nodes: pad.nodes,
        intervalMs: pad.intervalMs,
        phraseSteps: pad.phraseSteps,
        phraseMode: pad.phraseMode,
        loop: pad.loop,
        velocity: pad.velocity,
        rememberedTone: pad.rememberedTone,
        rootMidi: pad.rootMidi,
        scaleKey: pad.scaleKey,
        octaveTranspose: pad.octaveTranspose,
      };
    }),
  });
}

export default function QuadLilyApp() {
  const view = useMemo(createQuadLilyAppView, []);
  const [workspace, setWorkspace] = useState<QuadLilyWorkspace>(loadInitialWorkspace);
  const workspaceRef = useRef(workspace);
  const [lastSavedFingerprint, setLastSavedFingerprint] = useState(() =>
    libraryWorkspaceFingerprint(loadInitialWorkspace()),
  );
  const isLibraryDirty = libraryWorkspaceFingerprint(workspace) !== lastSavedFingerprint;
  const [theme, setTheme] = useState<QuadTheme>(loadInitialTheme);
  const [viewMode, setViewMode] = useState<QuadLilyCanvasLayout>('single');
  const [showNodeLabels, setShowNodeLabels] = useState(true);
  const [libraryOpen, setLibraryOpen] = useState(() => (
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('guide') === 'library'
  ));
  const [uiVariant, setUiVariant] = useState<UiVariant>(loadUiVariant);
  const [cycleDrawerOpen, setCycleDrawerOpen] = useState(false);

  // ---- 认证 ----
  const identity = useIdentity();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [nicknameModalOpen, setNicknameModalOpen] = useState(false);
  const [nicknameModalDismissible, setNicknameModalDismissible] = useState(false);
  const [locale, setLocale] = useState<AppLocale>(() => {
    if (typeof window === 'undefined') return 'zh';
    try {
      return restoreLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY));
    } catch {
      return 'zh';
    }
  });

  // 首次登录强制登记昵称
  useEffect(() => {
    if (!identity.user) return;
    if (identity.user.name?.trim()) return;
    setNicknameModalDismissible(false);
    setNicknameModalOpen(true);
  }, [identity.user]);

  const handleToggleLocale = useCallback(() => {
    setLocale((current) => {
      const next = toggleLocale(current);
      try {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const handleVariantChange = (next: UiVariant) => {
    setUiVariant(next);
    saveUiVariant(next);
  };
  const nodeLabelVisibility = resolveNodeLabelVisibility(showNodeLabels);
  const [selectedPadId, setSelectedPadId] = useState<QuadPadId>('A');
  const [selectedNodes, setSelectedNodes] = useState<PadNodeSelection>(() => (
    createPadRecord((padId) => isOnboardingGuideCapture() && padId === 'A' ? 'guide-n1' : 'center')
  ));
  const [groupSelections, setGroupSelections] = useState<PadGroupSelection>(() => (
    createPadRecord((padId) => getOnboardingGuideCaptureMode() === 'groups' && padId === 'A'
      ? ['guide-n1', 'guide-n2', 'guide-n3']
      : ['center'])
  ));
  /** 组合面板：共享编队形状；轨迹多选批量各自运动不走这里 */
  const [groupMotionMode, setGroupMotionMode] = useState<FormationShape | null>(() => (
    getOnboardingGuideCaptureMode() === 'groups' ? 'circle' : null
  ));
  const [groupRateCycles, setGroupRateCycles] = useState(4);
  const [groupRadius, setGroupRadius] = useState(0.12);
  /** 选中画布编队枢纽时，轨迹面板改的是编队参数而非单节点 */
  const [formationFocus, setFormationFocus] = useState(false);
  /** 当前焦点编队 id（每 Pad 可有多个 G1/G2/…） */
  const [selectedFormationIds, setSelectedFormationIds] = useState<Record<QuadPadId, string | null>>(
    () => createPadRecord<string | null>(() => null),
  );
  const [activeNodes, setActiveNodes] = useState<PadActiveState>(() => createPadRecord(() => []));
  const [pausedPads, setPausedPads] = useState<PadBooleanState>(() => createPadRecord(() => false));
  const [cyclePhase, setCyclePhase] = useState<PadNumberState>(() => createPadRecord(() => 0));
  const [cycleIndex, setCycleIndex] = useState<PadNumberState>(() => createPadRecord(() => 0));
  const [cycleCompilations, setCycleCompilations] = useState<Record<QuadPadId, LilyCycleCompilation | null>>(
    () => createPadRecord<LilyCycleCompilation | null>(() => null),
  );
  const [cycleSnapshots, setCycleSnapshots] = useState<Record<QuadPadId, QuadLilyPad | null>>(
    () => createPadRecord<QuadLilyPad | null>(() => null),
  );
  const [drawCapture, setDrawCaptureState] = useState<DrawCaptureState | null>(null);
  const [drawPreview, setDrawPreview] = useState<DrawPreviewState | null>(null);
  const [midiPorts, setMidiPorts] = useState<DeskMidiPortsSnapshot>(EMPTY_MIDI_PORTS);
  const [midiStatus, setMidiStatus] = useState('正在寻找 FM-1…');
  const midiAccessRef = useRef<MIDIAccess | null>(null);
  const midiBusRef = useRef(new QuadMidiBus(null));
  const [soundPresetId, setSoundPresetId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem('gemidi.soundPresetId') || DEFAULT_SOUND_PRESET_ID;
      return stored === EXTERNAL_SOUND_PRESET_ID ? DEFAULT_SOUND_PRESET_ID : stored;
    }
    return DEFAULT_SOUND_PRESET_ID;
  });
  const soundPresetIdRef = useRef(soundPresetId);
  /** 断开 MIDI 时恢复的内置音色 */
  const lastBuiltInSoundRef = useRef(
    soundPresetId === EXTERNAL_SOUND_PRESET_ID ? DEFAULT_SOUND_PRESET_ID : soundPresetId,
  );
  useEffect(() => {
    soundPresetIdRef.current = soundPresetId;
    if (soundPresetId !== EXTERNAL_SOUND_PRESET_ID && typeof window !== 'undefined') {
      lastBuiltInSoundRef.current = soundPresetId;
      window.localStorage.setItem('gemidi.soundPresetId', soundPresetId);
    }
  }, [soundPresetId]);

  /** 画布荷塘背景：默认 none，切换后本地持久化 */
  const [canvasBackgroundPattern, setCanvasBackgroundPattern] = useState<CanvasBackgroundPattern>(() => {
    if (typeof window === 'undefined') return restoreCanvasBackground(null);
    try {
      return restoreCanvasBackground(window.localStorage.getItem(CANVAS_BG_STORAGE_KEY));
    } catch {
      return restoreCanvasBackground(null);
    }
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(CANVAS_BG_STORAGE_KEY, canvasBackgroundPattern);
    } catch {
      /* 隐私模式下 localStorage 可能不可写，忽略即可 */
    }
  }, [canvasBackgroundPattern]);

  /** 延续播放：默认关；开则超周期节点仍按跳时播完（不压缩 BPM） */
  const CYCLE_CONTINUE_KEY = 'gemidi.cycleContinue.v1';
  const [cycleContinue, setCycleContinue] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(CYCLE_CONTINUE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const cycleContinueRef = useRef(cycleContinue);
  useEffect(() => {
    cycleContinueRef.current = cycleContinue;
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(CYCLE_CONTINUE_KEY, cycleContinue ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [cycleContinue]);

  const runnerRef = useRef<QuadCycleRunner | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const drawCaptureRef = useRef<DrawCaptureState | null>(null);
  const nextNodeIdRef = useRef(1);
  const cycleStartedAtRef = useRef<PadNumberState>(createPadRecord(() => 0));
  const cycleDurationRef = useRef<PadNumberState>(createPadRecord(() => 700));
  const releaseTimersRef = useRef<Record<QuadPadId, Set<number>>>(createPadRecord(() => new Set<number>()));
  const mountedRef = useRef(false);
  const pausedPadsRef = useRef(pausedPads);

  workspaceRef.current = workspace;
  pausedPadsRef.current = pausedPads;
  const [noteClipboard, setNoteClipboard] = useState<NoteClipboard | null>(null);
  const pasteCountRef = useRef(0);
  const selectedPad = workspace.pads[selectedPadId];
  const selectedNodeId = selectedNodes[selectedPadId];
  const selectedGroupIds = groupSelections[selectedPadId] ?? (selectedNodeId ? [selectedNodeId] : []);
  const selectedNode = selectedPad.nodes.find(node => node.id === selectedNodeId) ?? selectedPad.nodes[0];
  const selectedOutput = midiPorts.outputs.find(output => output.id === midiPorts.selectedOutputId) ?? null;
  const selectedOutputRef = useRef(selectedOutput);
  selectedOutputRef.current = selectedOutput;
  const userSelectedMidiIdRef = useRef<string | null>(null);
  const selectedScale = SCALES.find(scale => scale.key === selectedPad.scaleKey && scale.intervals.length)
    ?? SCALES.find(scale => scale.key === DEFAULT_SCALE_KEY)!;
  const padFormations = getPadFormations(selectedPad);
  const activeFormationId = selectedFormationIds[selectedPadId];
  const activeFormation = findFormationById(padFormations, activeFormationId)
    ?? (formationFocus ? padFormations[0] ?? null : null);
  const selectedMotion: LilyNodeMotion = (
    formationFocus && activeFormation
      ? formationToEditorMotion(activeFormation)
      : (selectedNode.motion ?? { mode: 'off' })
  );
  const drawStatus: DrawCaptureStatus = drawCapture
    && drawCapture.padId === selectedPadId
    && drawCapture.nodeId === selectedNode.id
    ? drawCapture.status
    : 'ready';
  const selectedCycleIndex = cycleIndex[selectedPadId];
  const selectedCycleCompilation = cycleCompilations[selectedPadId];
  const selectedIsPaused = pausedPads[selectedPadId];
  const selectedCycleSnapshot = selectedPad.playing || selectedIsPaused
    ? cycleSnapshots[selectedPadId] ?? selectedPad
    : selectedPad;
  const selectedTrace = useMemo(() => {
    return buildCycleTracePair(
      selectedPad,
      selectedCycleIndex,
      selectedCycleCompilation,
      selectedIsPaused,
    );
  }, [selectedCycleCompilation, selectedCycleIndex, selectedIsPaused, selectedPad]);
  const selectedVisibleCycle = resolveVisibleCycleState(
    selectedPad,
    selectedCycleIndex,
    cyclePhase[selectedPadId],
    selectedIsPaused,
  );
  const selectedBasePresentations = useMemo(() => buildNodePresentations(selectedPad.nodes, selectedPad), [
    selectedPad.nodes,
    selectedPad.rootMidi,
    selectedPad.scaleKey,
    selectedPad.octaveTranspose,
  ]);
  const selectedBPresentations = useMemo(() => {
    if (!selectedNode.endpointPitch) return null;
    return buildNodePresentations(selectedPad.nodes.map(node => node.id === selectedNode.id
      ? { ...node, scaleStep: selectedNode.endpointPitch!.bStep }
      : node), selectedPad);
  }, [selectedNode.endpointPitch, selectedNode.id, selectedPad]);
  const currentTracePresentations = useMemo(() => buildNodePresentations(
    selectedTrace.current.nodes.map(node => ({
      id: node.nodeId,
      scaleStep: node.scaleStep,
      isCenter: node.isCenter,
    })),
    selectedCycleSnapshot,
  ), [
    selectedCycleSnapshot.rootMidi,
    selectedCycleSnapshot.scaleKey,
    selectedCycleSnapshot.octaveTranspose,
    selectedTrace.current,
  ]);
  const nextTracePresentations = useMemo(() => buildNodePresentations(
    selectedTrace.next.nodes.map(node => ({
      id: node.nodeId,
      scaleStep: node.scaleStep,
      isCenter: node.isCenter,
    })),
    selectedPad,
  ), [selectedPad.rootMidi, selectedPad.scaleKey, selectedPad.octaveTranspose, selectedTrace.next]);
  const restingPadSnapshots = useMemo(
    () => createPadRecord((padId) => materializePadMotion(workspace.pads[padId], 0)),
    [workspace.pads],
  );
  const restingCycleCompilations = useMemo(
    () => createPadRecord((padId) => compileLilyCycle(restingPadSnapshots[padId])),
    [restingPadSnapshots],
  );

  const setDrawCapture = useCallback((next: DrawCaptureState | null) => {
    drawCaptureRef.current = next;
    setDrawCaptureState(next);
  }, []);

  const clearReleaseTimers = useCallback((padId: QuadPadId) => {
    releaseTimersRef.current[padId].forEach(handle => window.clearTimeout(handle));
    releaseTimersRef.current[padId].clear();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const runner = new QuadCycleRunner({
      clock: {
        setTimeout: (run, delayMs) => window.setTimeout(run, delayMs),
        clearTimeout: (handle) => window.clearTimeout(handle as ReturnType<typeof setTimeout>),
        nowMs: () => performance.now(),
        // 提供音频时钟 → runner 提前唤醒并把发声排进 AudioContext / MIDI timestamp
        audioNowSec: () => {
          quadSynthEngine.ensureRunning();
          return quadSynthEngine.getCurrentTime();
        },
      },
      resolveCycleSnapshot: (pad, cycle) => materializePadMotion(pad, cycle),
      continueBeyondCycle: () => cycleContinueRef.current,
      onCycleStart: (padId, cycle, snapshot) => {
        cycleStartedAtRef.current[padId] = performance.now();
        cycleDurationRef.current[padId] = getPadCycleDurationMs(snapshot);
        if (mountedRef.current) {
          setPausedPads(previous => previous[padId] ? { ...previous, [padId]: false } : previous);
          setCycleIndex(previous => ({ ...previous, [padId]: cycle }));
          setCyclePhase(previous => ({ ...previous, [padId]: 0 }));
        }
      },
      onCycleCompiled: (padId, _cycle, compilation, snapshot) => {
        if (mountedRef.current) {
          setCycleCompilations(previous => ({ ...previous, [padId]: compilation }));
          setCycleSnapshots(previous => ({ ...previous, [padId]: snapshot }));
        }
      },
      onEvent: (padId, event, cycle, padSnapshot, timing) => {
        const sourceNode = padSnapshot.nodes.find((node) => node.id === event.nodeId);
        // 静音节点：仍调度/点亮，但不发声；隐藏节点已在 compile 阶段剔除
        const skipSound = sourceNode?.muted === true || sourceNode?.hidden === true;

        const scale = SCALES.find(candidate => (
          candidate.key === padSnapshot.scaleKey && candidate.intervals.length > 0
        )) ?? SCALES.find(candidate => candidate.key === DEFAULT_SCALE_KEY)!;
        const rootMidi = Math.max(0, Math.min(127, padSnapshot.rootMidi + padSnapshot.octaveTranspose * 12));
        const resolvePitch = createDeskPitchResolver({ rootMidi, intervals: scale.intervals });
        const midiNote = resolvePitch({ kind: 'scale-degree', degree: event.scaleStep });
        if (midiNote === null) return;

        const voiceId = `${cycle}:${event.nodeId}`;
        const velocity = Math.max(1, Math.min(127, Math.round(padSnapshot.velocity * 127)));
        const noteLength = Math.max(110, Math.min(520, padSnapshot.intervalMs * 0.55));
        const isMidiConnected = Boolean(selectedOutputRef.current);
        const useExternalTone = isMidiConnected && soundPresetIdRef.current === EXTERNAL_SOUND_PRESET_ID;
        const midiChannelZeroBased = Math.max(0, Math.min(15, (padSnapshot.midiChannel ?? 1) - 1));
        const dueAtMs = timing?.dueAtMs ?? performance.now();
        const audioWhenSec = timing?.audioWhenSec ?? undefined;
        const midiOnAt = dueAtMs;
        const midiOffAt = dueAtMs + noteLength;

        // 发声：在 look-ahead 唤醒点立刻排进音频/MIDI 时钟（不把精度绑在回调执行瞬间）
        if (!skipSound) {
          if (useExternalTone) {
            midiBusRef.current.trigger(
              padId,
              voiceId,
              midiNote,
              velocity,
              midiChannelZeroBased,
              midiOnAt,
            );
          } else {
            const presetId = soundPresetIdRef.current === EXTERNAL_SOUND_PRESET_ID
              ? lastBuiltInSoundRef.current || DEFAULT_SOUND_PRESET_ID
              : soundPresetIdRef.current;
            quadSynthEngine.playNote(
              midiNote,
              velocity,
              noteLength / 1000,
              presetId,
              audioWhenSec,
            );
          }
        }

        // 视觉点亮对齐 dueAt，避免提前 60ms 闪一下
        const armVisual = () => {
          if (!mountedRef.current) return;
          setActiveNodes(previous => ({
            ...previous,
            [padId]: [...new Set([...previous[padId], event.nodeId])],
          }));
          const releaseDelay = Math.max(0, midiOffAt - performance.now());
          const handle = window.setTimeout(() => {
            releaseTimersRef.current[padId].delete(handle);
            if (!skipSound && useExternalTone) {
              midiBusRef.current.releaseVoice(padId, voiceId, midiOffAt);
            }
            if (mountedRef.current) {
              setActiveNodes(previous => ({
                ...previous,
                [padId]: previous[padId].filter(nodeId => nodeId !== event.nodeId),
              }));
            }
          }, releaseDelay);
          releaseTimersRef.current[padId].add(handle);
        };

        const visualDelay = Math.max(0, dueAtMs - performance.now());
        if (visualDelay <= 2) {
          armVisual();
        } else {
          const visualHandle = window.setTimeout(() => {
            releaseTimersRef.current[padId].delete(visualHandle);
            armVisual();
          }, visualDelay);
          releaseTimersRef.current[padId].add(visualHandle);
        }
      },
      onPadStop: (padId) => {
        clearReleaseTimers(padId);
        midiBusRef.current.releaseSlot(padId);
        cycleStartedAtRef.current[padId] = 0;
        if (mountedRef.current) {
          setPausedPads(previous => previous[padId] ? { ...previous, [padId]: false } : previous);
          setActiveNodes(previous => ({ ...previous, [padId]: [] }));
          setCycleIndex(previous => ({ ...previous, [padId]: 0 }));
          setCyclePhase(previous => ({ ...previous, [padId]: 0 }));
          setCycleCompilations(previous => ({ ...previous, [padId]: null }));
          setCycleSnapshots(previous => ({ ...previous, [padId]: null }));
        }
      },
    });
    runnerRef.current = runner;
    return () => {
      mountedRef.current = false;
      runner.stopAll();
      QUAD_PAD_IDS.forEach(clearReleaseTimers);
      midiBusRef.current.masterPanic();
      runnerRef.current = null;
    };
  }, [clearReleaseTimers]);

  useEffect(() => {
    const runner = runnerRef.current;
    if (!runner) return;
    QUAD_PAD_IDS.forEach(padId => {
      const pad = workspace.pads[padId];
      runner.updatePad(pad);
      if (pad.playing && !runner.isRunning(padId)) runner.startPad(pad);
      if (!pad.playing && runner.isRunning(padId) && !runner.isPaused(padId)) runner.stopPad(padId);
    });
  }, [workspace]);

  useEffect(() => {
    try {
      window.localStorage.setItem(QUAD_LILY_STORAGE_KEY, serializeQuadLilySession(workspace));
    } catch {
      // Keep the live instrument usable when storage is blocked.
    }
  }, [workspace]);

  useEffect(() => {
    try {
      window.localStorage.setItem(QUAD_THEME_STORAGE_KEY, theme);
    } catch {
      // Theme persistence is optional; the instrument remains usable without storage.
    }
  }, [theme]);

  useEffect(() => {
    let frame = 0;
    const PHASE_EPS = 1 / 90; // ~每帧上限附近才提交，减少无效整树渲染
    const update = () => {
      const now = performance.now();
      setCyclePhase((previous) => {
        const next = advanceCyclePhases(
          previous,
          workspaceRef.current.pads,
          cycleStartedAtRef.current,
          cycleDurationRef.current,
          now,
        );
        let changed = false;
        for (const padId of QUAD_PAD_IDS) {
          if (Math.abs(next[padId] - previous[padId]) >= PHASE_EPS) {
            changed = true;
            break;
          }
          // 归零/跳变也要立刻提交
          if (next[padId] < previous[padId] - 1e-6) {
            changed = true;
            break;
          }
        }
        return changed ? next : previous;
      });
      frame = window.requestAnimationFrame(update);
    };
    frame = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const refreshMidi = useCallback(async () => {
    setMidiStatus('正在检查 MIDI 端口…');
    try {
      const access = midiAccessRef.current ?? await requestDeskMidiAccess();
      midiAccessRef.current = access;
      const refreshSnapshot = () => {
        const raw = readDeskMidiPorts(access, userSelectedMidiIdRef.current);
        setMidiPorts({
          ...raw,
          selectedOutputId: userSelectedMidiIdRef.current,
        });
      };
      refreshSnapshot();
      access.onstatechange = refreshSnapshot;
      const initial = readDeskMidiPorts(access, userSelectedMidiIdRef.current);
      const activeId = userSelectedMidiIdRef.current;
      const preferred = initial.outputs.find(output => output.id === activeId);
      setMidiStatus(preferred ? `${preferred.name || 'MIDI 设备'} 已连接 (外部音色)` : '内置音色模式 (MIDI 未连接)');
    } catch (error) {
      setMidiStatus(error instanceof Error ? error.message : 'MIDI 未启用');
    }
  }, []);

  useEffect(() => {
    void refreshMidi();
    return () => {
      if (midiAccessRef.current) midiAccessRef.current.onstatechange = null;
    };
  }, []);

  useEffect(() => {
    midiBusRef.current.masterPanic();
    midiBusRef.current = new QuadMidiBus(selectedOutput);
    if (selectedOutput) {
      setMidiStatus(`${selectedOutput.name || 'FM-1'} 已连接`);
      // 连上外部端口后，画布音色默认切到「外接音色」
      setSoundPresetId(EXTERNAL_SOUND_PRESET_ID);
    } else {
      // 断开后恢复上次内置音色
      setSoundPresetId((previous) => (
        previous === EXTERNAL_SOUND_PRESET_ID
          ? lastBuiltInSoundRef.current || DEFAULT_SOUND_PRESET_ID
          : previous
      ));
    }
    return () => midiBusRef.current.masterPanic();
  }, [selectedOutput]);

  useEffect(() => {
    if (workspace.fm1Tone !== 'follow') sendFm1ProgramChange(selectedOutput, workspace.fm1Tone);
  }, [selectedOutput, workspace.fm1Tone]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      const point = pointerToNormalized(drag.svg, event.clientX, event.clientY);
      if (drag.kind === 'move-base') {
        setWorkspace(previous => moveLilyNode(previous, drag.padId, drag.nodeId, {
          x: drag.startBase.x + point.x - drag.startPointer.x,
          y: drag.startBase.y + point.y - drag.startPointer.y,
        }));
        return;
      }

      if (drag.kind === 'move-formation') {
        const dx = point.x - drag.startPointer.x;
        const dy = point.y - drag.startPointer.y;
        setWorkspace((previous) => {
          const pad = previous.pads[drag.padId];
          if (pad.locked) return previous;
          const formations = getPadFormations(pad);
          const formation = findFormationById(formations, drag.formationId);
          if (!formation) return previous;
          const nextFormation = patchNoteFormation(formation, {
            centerX: drag.startCenter.x + dx,
            centerY: drag.startCenter.y + dy,
          });
          let next = updateLilyPad(previous, drag.padId, {
            formations: upsertFormation(formations, nextFormation),
          });
          for (const member of drag.memberStarts) {
            next = updateLilyNode(next, drag.padId, member.id, {
              x: member.x + dx,
              y: member.y + dy,
            });
          }
          return next;
        });
        return;
      }

      // armed 后按下：拖过阈值才真正开始录制
      if (drag.kind === 'pending-draw') {
        const travel = Math.hypot(point.x - drag.originPointer.x, point.y - drag.originPointer.y);
        if (travel < 0.008) return;
        const recording: RecordDrawDragState = {
          kind: 'record-draw',
          padId: drag.padId,
          nodeId: drag.nodeId,
          svg: drag.svg,
          pointerId: drag.pointerId,
          base: drag.base,
          samples: [
            { ...drag.originPointer, timeMs: drag.startedAt },
            { ...point, timeMs: performance.now() },
          ],
          startedAt: drag.startedAt,
        };
        dragRef.current = recording;
        setDrawCapture({ padId: drag.padId, nodeId: drag.nodeId, status: 'recording', kind: 'draw' });
        setDrawPreview({ padId: drag.padId, nodeId: drag.nodeId, point });
        setMidiStatus(`Pad ${drag.padId} · DRAW 录制中 — 松手结束`);
        return;
      }

      const sample = { ...point, timeMs: performance.now() };
      const last = drag.samples.at(-1);
      if (!last || sample.timeMs - last.timeMs >= 8 || Math.hypot(sample.x - last.x, sample.y - last.y) >= 0.003) {
        drag.samples.push(sample);
        if (drag.samples.length > 512) drag.samples.splice(1, 1);
      }
      setDrawPreview({ padId: drag.padId, nodeId: drag.nodeId, point });
    };

    const onPointerUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;

      // 只点一下、没拖出阈值：保持 armed，不写 path
      if (drag.kind === 'pending-draw') {
        setDrawCapture({ padId: drag.padId, nodeId: drag.nodeId, status: 'armed', kind: 'draw' });
        setDrawPreview(null);
        return;
      }

      if (drag.kind !== 'record-draw') return;

      const point = pointerToNormalized(drag.svg, event.clientX, event.clientY);
      drag.samples.push({ ...point, timeMs: performance.now() });
      const durationMs = Math.max(0, drag.samples.at(-1)!.timeMs - drag.startedAt);
      const travel = drag.samples.reduce((maximum, sample) => (
        Math.max(maximum, Math.hypot(sample.x - drag.base.x, sample.y - drag.base.y))
      ), 0);
      const compiled = compactDrawPath(
        compileDrawPath(drag.base, drag.samples, Math.max(1, durationMs + 1)),
        128,
      );

      if (durationMs < 60 || travel < 0.008 || compiled.length < 2) {
        setDrawCapture({ padId: drag.padId, nodeId: drag.nodeId, status: 'armed', kind: 'draw' });
        setDrawPreview(null);
        setMidiStatus('DRAW 太短：请拖出一条更清晰的路径');
        return;
      }

      setWorkspace(previous => {
        const node = previous.pads[drag.padId].nodes.find(candidate => candidate.id === drag.nodeId);
        if (!node) return previous;
        const hadPath = node.motion?.mode === 'draw' && (node.motion.path?.length ?? 0) >= 2;
        const rateCycles = hadPath && Number.isFinite(node.motion?.rateCycles)
          ? Math.max(1, node.motion!.rateCycles!)
          : snapDrawRateCycles(durationMs, getPadCycleDurationMs(previous.pads[drag.padId]));
        const timing = node.motion?.mode === 'draw'
          ? node.motion
          : { mode: 'draw' as const, rateCycles, phaseOffset: 0, direction: 1 };
        return updateLilyNode(previous, drag.padId, drag.nodeId, {
          motion: { ...timing, mode: 'draw', path: compiled, rateCycles },
        });
      });
      setDrawCapture(null);
      setDrawPreview(null);
      setMidiStatus(`Pad ${drag.padId} · DRAW 已记录 ${compiled.length} 关键帧（松手结束）`);
    };

    const onPointerCancel = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;
      setDrawPreview(null);
      if (drag.kind === 'record-draw' || drag.kind === 'pending-draw') {
        setDrawCapture({ padId: drag.padId, nodeId: drag.nodeId, status: 'armed', kind: 'draw' });
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      dragRef.current = null;
      setDrawPreview(null);
      setDrawCapture(null);
    };
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [setDrawCapture]);

  const choosePad = (padId: QuadPadId) => {
    const capture = drawCaptureRef.current;
    if (capture && capture.padId !== padId) {
      dragRef.current = null;
      setDrawPreview(null);
      setDrawCapture(null);
    }
    setSelectedPadId(padId);
    setSelectedNodes(previous => ({
      ...previous,
      [padId]: previous[padId] ?? workspaceRef.current.pads[padId].nodes[0]?.id ?? null,
    }));
  };

  const addNode = (padId: QuadPadId, point: QuadLilyPoint) => {
    const capture = drawCaptureRef.current;
    // 闪烁待命：点击空白处设定跳转目标，不新建节点
    if (
      (capture?.kind === 'flash' || capture?.kind === 'flash-batch' || capture?.kind === 'formation-flash')
      && capture.status === 'armed'
      && capture.padId === padId
    ) {
      completeFlashTarget(padId, capture.nodeId, point);
      setSelectedPadId(padId);
      return;
    }

    dragRef.current = null;
    setDrawPreview(null);
    setDrawCapture(null);
    let id = `node-${nextNodeIdRef.current++}`;
    while (workspaceRef.current.pads[padId].nodes.some(node => node.id === id)) {
      id = `node-${nextNodeIdRef.current++}`;
    }
    const step = Math.max(1, workspaceRef.current.pads[padId].nodes.length);
    setWorkspace(previous => addLilyNode(previous, padId, { id, ...point, range: 0.225, scaleStep: step }));
    setSelectedPadId(padId);
    setSelectedNodes(previous => ({ ...previous, [padId]: id }));
    setGroupSelections(previous => ({ ...previous, [padId]: [id] }));
  };

  const startNodeDrag = (
    padId: QuadPadId,
    nodeId: string,
    event: React.PointerEvent<SVGGElement>,
  ) => {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const node = workspaceRef.current.pads[padId].nodes.find(candidate => candidate.id === nodeId);
    if (!node) return;
    const point = pointerToNormalized(svg, event.clientX, event.clientY);
    const capture = drawCaptureRef.current;
    const multiSelect = event.ctrlKey || event.metaKey;

    // 闪烁待命：点到任意位置（含点在节点上）即设定目标
    if (
      (capture?.kind === 'flash' || capture?.kind === 'flash-batch' || capture?.kind === 'formation-flash')
      && capture.status === 'armed'
      && capture.padId === padId
    ) {
      completeFlashTarget(padId, capture.nodeId, point);
      setSelectedPadId(padId);
      if (capture.kind === 'flash') {
        setSelectedNodes(previous => ({ ...previous, [padId]: capture.nodeId }));
        setGroupSelections(previous => ({ ...previous, [padId]: [capture.nodeId] }));
      }
      return;
    }

    // Ctrl/Cmd+点击：只改组合选中，不拖节点
    if (multiSelect) {
      setSelectedPadId(padId);
      setGroupSelections((previous) => {
        const nextIds = resolveGroupSelectionClick(previous[padId] ?? [], nodeId, true);
        return { ...previous, [padId]: nextIds };
      });
      setSelectedNodes(previous => ({ ...previous, [padId]: nodeId }));
      setFormationFocus(false);
      setMidiStatus(`Pad ${padId} · 组合点选（Ctrl）`);
      return;
    }

    if (
      capture?.status === 'armed'
      && (capture.kind ?? 'draw') === 'draw'
      && capture.padId === padId
      && capture.nodeId === nodeId
    ) {
      const startedAt = performance.now();
      dragRef.current = {
        kind: 'pending-draw',
        padId,
        nodeId,
        svg,
        pointerId: event.pointerId,
        base: { x: node.x, y: node.y },
        originPointer: point,
        startedAt,
      };
      setMidiStatus(`Pad ${padId} · DRAW 待命 — 拖动节点开始录制`);
    } else {
      dragRef.current = {
        kind: 'move-base',
        padId,
        nodeId,
        svg,
        pointerId: event.pointerId,
        startPointer: point,
        startBase: { x: node.x, y: node.y },
      };
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setSelectedPadId(padId);
    setSelectedNodes(previous => ({ ...previous, [padId]: nodeId }));
    // 普通点击：重置为单选
    setGroupSelections(previous => ({ ...previous, [padId]: [nodeId] }));
    setFormationFocus(false);
  };

  const removeNode = (padId: QuadPadId, nodeId: string) => {
    if (drawCaptureRef.current?.padId === padId && drawCaptureRef.current.nodeId === nodeId) {
      dragRef.current = null;
      setDrawPreview(null);
      setDrawCapture(null);
    }
    setWorkspace(previous => deleteLilyNode(previous, padId, nodeId));
    setSelectedNodes(previous => ({ ...previous, [padId]: 'center' }));
    setGroupSelections(previous => {
      const filtered = (previous[padId] ?? []).filter((id) => id !== nodeId);
      return { ...previous, [padId]: filtered.length ? filtered : ['center'] };
    });
  };

  const togglePadPlaying = useCallback((padId: QuadPadId) => {
    const current = workspaceRef.current;
    const willPlay = !current.pads[padId].playing;
    // 单轨播放不改 masterPlaying：画布按钮与全局不对等；仅全局 play/pause 驱动 master
    const next = updateLilyPad(current, padId, { playing: willPlay });
    const runner = runnerRef.current;
    if (willPlay) {
      quadSynthEngine.ensureRunning();
      const cursor = pausedPadsRef.current[padId] && runner?.isPaused(padId)
        ? runner.resumePad(next.pads[padId])
        : null;
      if (cursor) {
        cycleStartedAtRef.current[padId] = performance.now() - cursor.elapsedMs;
        cycleDurationRef.current[padId] = cursor.intervalMs;
        setCycleIndex(previous => ({ ...previous, [padId]: cursor.cycle }));
        setCyclePhase(previous => ({ ...previous, [padId]: cursor.phase }));
        setMidiStatus(`Pad ${padId} · ${Math.round(cursor.phase * 100)}% 继续`);
      } else {
        runner?.startPad(next.pads[padId]);
        setMidiStatus(`Pad ${padId} 从周期起点播放`);
      }
      setPausedPads(previous => previous[padId] ? { ...previous, [padId]: false } : previous);
    } else {
      const cursor = runner?.pausePad(padId);
      clearReleaseTimers(padId);
      midiBusRef.current.releaseSlot(padId);
      setActiveNodes(previous => ({ ...previous, [padId]: [] }));
      if (cursor) {
        cycleStartedAtRef.current[padId] = 0;
        cycleDurationRef.current[padId] = cursor.intervalMs;
        setCycleIndex(previous => ({ ...previous, [padId]: cursor.cycle }));
        setCyclePhase(previous => ({ ...previous, [padId]: cursor.phase }));
        setPausedPads(previous => ({ ...previous, [padId]: true }));
        setMidiStatus(`Pad ${padId} 已冻结在 ${Math.round(cursor.phase * 100)}% · Space 继续`);
      } else {
        setPausedPads(previous => previous[padId] ? { ...previous, [padId]: false } : previous);
      }
    }
    setWorkspace(next);
  }, [clearReleaseTimers]);

  const togglePadLocked = (padId: QuadPadId) => {
    if (!workspaceRef.current.pads[padId].locked && drawCaptureRef.current?.padId === padId) {
      dragRef.current = null;
      setDrawPreview(null);
      setDrawCapture(null);
    }
    setWorkspace(previous => updateLilyPad(previous, padId, { locked: !previous.pads[padId].locked }));
  };

  const playAll = () => {
    quadSynthEngine.ensureRunning();
    let next = workspaceRef.current;
    QUAD_PAD_IDS.forEach(padId => { next = updateLilyPad(next, padId, { playing: true }); });
    next = { ...next, masterPlaying: true };
    const runner = runnerRef.current;
    QUAD_PAD_IDS.forEach(padId => {
      if (runner?.isRunning(padId)) return;
      const cursor = runner?.isPaused(padId) ? runner.resumePad(next.pads[padId]) : null;
      if (cursor) {
        cycleStartedAtRef.current[padId] = performance.now() - cursor.elapsedMs;
        cycleDurationRef.current[padId] = cursor.intervalMs;
        setCycleIndex(previous => ({ ...previous, [padId]: cursor.cycle }));
        setCyclePhase(previous => ({ ...previous, [padId]: cursor.phase }));
      } else {
        runner?.startPad(next.pads[padId]);
      }
    });
    setPausedPads(createPadRecord(() => false));
    setWorkspace(next);
  };

  const pauseAll = () => {
    const runner = runnerRef.current;
    const nextPaused = { ...pausedPadsRef.current };
    QUAD_PAD_IDS.forEach(padId => {
      const cursor = runner?.pausePad(padId);
      if (cursor) {
        nextPaused[padId] = true;
        cycleStartedAtRef.current[padId] = 0;
        cycleDurationRef.current[padId] = cursor.intervalMs;
        setCycleIndex(previous => ({ ...previous, [padId]: cursor.cycle }));
        setCyclePhase(previous => ({ ...previous, [padId]: cursor.phase }));
      }
      clearReleaseTimers(padId);
      setActiveNodes(previous => ({ ...previous, [padId]: [] }));
    });
    midiBusRef.current.masterPanic();
    let next = workspaceRef.current;
    QUAD_PAD_IDS.forEach(padId => { next = updateLilyPad(next, padId, { playing: false }); });
    setPausedPads(nextPaused);
    setWorkspace({ ...next, masterPlaying: false });
  };

  const restartAll = () => {
    const playingPads = QUAD_PAD_IDS.map(padId => workspaceRef.current.pads[padId]).filter(pad => pad.playing);
    if (!playingPads.length) {
      setMidiStatus('先播放至少一个 Pad，再同步重启');
      return;
    }
    playingPads.forEach(pad => {
      clearReleaseTimers(pad.id);
      midiBusRef.current.releaseSlot(pad.id);
    });
    runnerRef.current?.startPads(playingPads);
    setMidiStatus(`${playingPads.length} 个 Pad 已从同一起点重启`);
  };

  const restartSelectedPad = () => {
    clearReleaseTimers(selectedPadId);
    midiBusRef.current.releaseSlot(selectedPadId);
    if (selectedPad.playing) runnerRef.current?.startPad(selectedPad);
    else if (pausedPadsRef.current[selectedPadId]) {
      runnerRef.current?.stopPad(selectedPadId);
      setPausedPads(previous => ({ ...previous, [selectedPadId]: false }));
    }
    setMidiStatus(`Pad ${selectedPadId} 已回到周期起点`);
  };

  const patchSelectedPad = (patch: Partial<Omit<QuadLilyPad, 'id' | 'nodes'>>) => {
    setWorkspace(previous => updateLilyPad(previous, selectedPadId, patch));
  };

  const patchSelectedNode = (patch: Parameters<typeof updateLilyNode>[3]) => {
    if (selectedNode) setWorkspace(previous => updateLilyNode(previous, selectedPadId, selectedNode.id, patch));
  };

  /** 补丁任意 Pad 的任意节点：画布滚轮调音走这里（不依赖侧栏选中态） */
  const patchNode = (
    padId: QuadPadId,
    nodeId: string,
    patch: Parameters<typeof updateLilyNode>[3],
  ) => {
    setWorkspace(previous => updateLilyNode(previous, padId, nodeId, patch));
  };

  const toggleEndpointPitch = () => {
    if (formationFocus && activeFormation) {
      setMidiStatus(`Pad ${selectedPadId} · 编队单位不支持双音符`);
      return;
    }
    patchSelectedNode({
      endpointPitch: selectedNode.endpointPitch
        ? null
        : { bStep: selectedNode.scaleStep + 1 },
    });
    setMidiStatus(selectedNode.endpointPitch
      ? `Pad ${selectedPadId} · 节点恢复单音 A`
      : `Pad ${selectedPadId} · A/B 端点音高已启用，下周期生效`);
  };

  const armDraw = () => {
    if (selectedPad.locked || !selectedNode) return;
    dragRef.current = null;
    setDrawPreview(null);
    setDrawCapture({ padId: selectedPadId, nodeId: selectedNode.id, status: 'armed', kind: 'draw' });
    setMidiStatus(`Pad ${selectedPadId} · DRAW 待命：在画布上按住节点拖动才开始录制`);
  };

  const armFlash = () => {
    if (selectedPad.locked || !selectedNode) return;
    dragRef.current = null;
    setDrawPreview(null);
    setDrawCapture({ padId: selectedPadId, nodeId: selectedNode.id, status: 'armed', kind: 'flash' });
    setMidiStatus(`Pad ${selectedPadId} · 闪烁待命：再点击画布上的目标位置`);
  };

  const cancelDraw = () => {
    dragRef.current = null;
    setDrawPreview(null);
    setDrawCapture(null);
    setMidiStatus('轨迹待命已取消，原设置保持不变');
  };

  /** 闪烁：把点击坐标写成相对目标；多选时以首节点为基准，偏移套用到全体 */
  const completeFlashTarget = (padId: QuadPadId, nodeId: string, point: QuadLilyPoint) => {
    const capture = drawCaptureRef.current;
    const batchIds = capture?.kind === 'flash-batch'
      ? (groupSelections[padId] ?? [nodeId])
      : [nodeId];

    if (capture?.kind === 'formation-flash') {
      setWorkspace((previous) => {
        const pad = previous.pads[padId];
        if (pad.locked) return previous;
        const formations = getPadFormations(pad);
        const formation = findFormationById(formations, capture.formationId)
          ?? formations.find((item) => item.nodeIds[0] === nodeId)
          ?? formations[0]
          ?? null;
        if (!formation) return previous;
        const anchor = pad.nodes.find((node) => node.id === formation.nodeIds[0]);
        if (!anchor) return previous;
        const flashDx = Math.max(-1, Math.min(1, point.x - anchor.x));
        const flashDy = Math.max(-1, Math.min(1, point.y - anchor.y));
        return updateLilyPad(previous, padId, {
          formations: upsertFormation(
            formations,
            patchNoteFormation(formation, { flashDx, flashDy, shape: 'flash' }),
          ),
        });
      });
      setDrawCapture(null);
      setDrawPreview(null);
      setMidiStatus(`Pad ${padId} · 编队闪烁位移已设定`);
      return;
    }

    if (batchIds.length >= 2 || capture?.kind === 'flash-batch') {
      const orderedIds = batchIds.length >= 2 ? batchIds : [nodeId];
      setWorkspace((previous) => {
        const pad = previous.pads[padId];
        if (pad.locked) return previous;
        const orderedNodes = orderedIds
          .map((id) => pad.nodes.find((node) => node.id === id))
          .filter((node): node is NonNullable<typeof node> => Boolean(node));
        if (orderedNodes.length < 2) return previous;
        const anchor = orderedNodes[0];
        const shared = {
          targetDx: Math.max(-1, Math.min(1, point.x - anchor.x)),
          targetDy: Math.max(-1, Math.min(1, point.y - anchor.y)),
        };
        const rateCycles = Math.max(1, groupRateCycles || 2);
        const patches = buildBatchIndividualMotions(orderedNodes, 'flash', rateCycles, shared);
        let next = updateLilyPad(previous, padId, {
          formations: detachNodesFromFormations(getPadFormations(pad), orderedIds),
        });
        return patches.reduce(
          (workspace, { nodeId: id, motion }) => updateLilyNode(workspace, padId, id, { motion }),
          next,
        );
      });
      setDrawCapture(null);
      setDrawPreview(null);
      setMidiStatus(`Pad ${padId} · 多选闪烁：共用首点偏移（${orderedIds.length} 节点）`);
      return;
    }

    setWorkspace((previous) => {
      const node = previous.pads[padId].nodes.find((candidate) => candidate.id === nodeId);
      if (!node) return previous;
      const rateCycles = node.motion?.mode === 'flash' && Number.isFinite(node.motion.rateCycles)
        ? Math.max(1, node.motion.rateCycles!)
        : 2;
      return updateLilyNode(previous, padId, nodeId, {
        motion: {
          mode: 'flash',
          rateCycles,
          phaseOffset: 0,
          direction: 1,
          targetDx: Math.max(-1, Math.min(1, point.x - node.x)),
          targetDy: Math.max(-1, Math.min(1, point.y - node.y)),
        },
      });
    });
    setDrawCapture(null);
    setDrawPreview(null);
    setMidiStatus(`Pad ${padId} · 闪烁目标已设定（周期内跳转）`);
  };

  const changeSelectedMotion = (motion: LilyNodeMotion) => {
    // 编队选中：轨迹面板改的是编队半径/周期/角度
    if (formationFocus && activeFormation) {
      const nextFormation = applyEditorMotionToFormation(activeFormation, motion);
      setWorkspace((previous) => {
        const pad = previous.pads[selectedPadId];
        return updateLilyPad(previous, selectedPadId, {
          formations: upsertFormation(getPadFormations(pad), nextFormation),
        });
      });
      setSelectedFormationIds((previous) => ({ ...previous, [selectedPadId]: nextFormation.id }));
      setGroupRateCycles(nextFormation.rateCycles);
      setGroupRadius(nextFormation.radius);
      if (motion.mode === 'flash') {
        const hasTarget = Math.abs(motion.targetDx ?? 0) > 1e-6 || Math.abs(motion.targetDy ?? 0) > 1e-6;
        if (!hasTarget) {
          setDrawCapture({
            padId: selectedPadId,
            nodeId: nextFormation.nodeIds[0],
            status: 'armed',
            kind: 'formation-flash',
            formationId: nextFormation.id,
          });
          setMidiStatus(`Pad ${selectedPadId} · ${nextFormation.id} 闪烁待命：再点目标`);
          return;
        }
      }
      setDrawCapture(null);
      setMidiStatus(`Pad ${selectedPadId} · 已更新编队 ${nextFormation.id}`);
      return;
    }

    const multiIds = selectedGroupIds.length >= 2 ? selectedGroupIds : null;
    const previousMode = selectedNode.motion?.mode ?? 'off';

    // 轨迹模式 + Ctrl 多选：各自一套轨迹（相位均匀错开）；与组合编队区分开
    if (multiIds && motion.mode !== 'draw') {
      if (motion.mode === 'flash') {
        const hasTarget = Math.abs(motion.targetDx ?? 0) > 1e-6 || Math.abs(motion.targetDy ?? 0) > 1e-6;
        dragRef.current = null;
        setDrawPreview(null);
        if (hasTarget) {
          setWorkspace((previous) => {
            const pad = previous.pads[selectedPadId];
            if (pad.locked) return previous;
            const orderedNodes = multiIds
              .map((id) => pad.nodes.find((node) => node.id === id))
              .filter((node): node is NonNullable<typeof node> => Boolean(node));
            const patches = buildBatchIndividualMotions(
              orderedNodes,
              'flash',
              motion.rateCycles ?? 2,
              { targetDx: motion.targetDx ?? 0, targetDy: motion.targetDy ?? 0 },
            );
            let next = updateLilyPad(previous, selectedPadId, {
              formations: detachNodesFromFormations(getPadFormations(pad), multiIds),
            });
            return patches.reduce(
              (workspace, { nodeId, motion: nextMotion }) => (
                updateLilyNode(workspace, selectedPadId, nodeId, { motion: nextMotion })
              ),
              next,
            );
          });
          setDrawCapture(null);
          setMidiStatus(`Pad ${selectedPadId} · 多选闪烁已套用共用偏移`);
        } else {
          setWorkspace((previous) => updateLilyPad(previous, selectedPadId, {
            formations: detachNodesFromFormations(getPadFormations(previous.pads[selectedPadId]), multiIds),
          }));
          setDrawCapture({
            padId: selectedPadId,
            nodeId: multiIds[0],
            status: 'armed',
            kind: 'flash-batch',
          });
          setMidiStatus(`Pad ${selectedPadId} · 多选闪烁待命：再点目标（以首个音符为基准）`);
        }
        return;
      }

      if (motion.mode === 'off' || motion.mode === 'orbit' || motion.mode === 'pendulum') {
        setWorkspace((previous) => {
          const pad = previous.pads[selectedPadId];
          if (pad.locked) return previous;
          const orderedNodes = multiIds
            .map((id) => pad.nodes.find((node) => node.id === id))
            .filter((node): node is NonNullable<typeof node> => Boolean(node));
          if (motion.mode === 'off') {
            let next = updateLilyPad(previous, selectedPadId, {
              formations: detachNodesFromFormations(getPadFormations(pad), multiIds),
            });
            return multiIds.reduce(
              (workspace, id) => updateLilyNode(workspace, selectedPadId, id, { motion: { mode: 'off' } }),
              next,
            );
          }
          const patches = buildBatchIndividualMotions(
            orderedNodes,
            motion.mode,
            motion.rateCycles ?? (motion.mode === 'orbit' ? 3 : 2),
          );
          // 若侧栏带了 amount，覆盖默认幅度
          const withAmount = patches.map(({ nodeId, motion: nextMotion }) => ({
            nodeId,
            motion: motion.mode === 'orbit' || motion.mode === 'pendulum'
              ? {
                ...nextMotion,
                amount: motion.amount ?? ('amount' in nextMotion ? nextMotion.amount : 0.08),
                ...(motion.mode === 'pendulum' && 'angleDegrees' in motion
                  ? { angleDegrees: motion.angleDegrees }
                  : {}),
              }
              : nextMotion,
          }));
          let next = updateLilyPad(previous, selectedPadId, {
            formations: detachNodesFromFormations(getPadFormations(pad), multiIds),
          });
          return withAmount.reduce(
            (workspace, { nodeId, motion: nextMotion }) => (
              updateLilyNode(workspace, selectedPadId, nodeId, { motion: nextMotion as LilyNodeMotion })
            ),
            next,
          );
        });
        dragRef.current = null;
        setDrawPreview(null);
        setDrawCapture(null);
        setMidiStatus(`Pad ${selectedPadId} · 多选各自 ${motion.mode}（${multiIds.length} 节点）`);
        return;
      }
    }

    patchSelectedNode({ motion });
    if (motion.mode === 'draw') {
      dragRef.current = null;
      setDrawPreview(null);
      setDrawCapture({ padId: selectedPadId, nodeId: selectedNode.id, status: 'armed', kind: 'draw' });
      setMidiStatus(
        previousMode === 'draw'
          ? `Pad ${selectedPadId} · DRAW 待命：按住节点拖动开始录制`
          : `Pad ${selectedPadId} · 已选手绘：按住节点拖动开始录制`,
      );
    } else if (motion.mode === 'flash') {
      dragRef.current = null;
      setDrawPreview(null);
      const hasTarget = Math.abs(motion.targetDx ?? 0) > 1e-6 || Math.abs(motion.targetDy ?? 0) > 1e-6;
      if (hasTarget) {
        setDrawCapture(null);
        setMidiStatus(`Pad ${selectedPadId} · 闪烁模式（可按 F 重设目标）`);
      } else {
        setDrawCapture({ padId: selectedPadId, nodeId: selectedNode.id, status: 'armed', kind: 'flash' });
        setMidiStatus(`Pad ${selectedPadId} · 闪烁待命：再点击画布目标位置`);
      }
    } else {
      dragRef.current = null;
      setDrawPreview(null);
      setDrawCapture(null);
      setMidiStatus(`Pad ${selectedPadId} · ${motion.mode.toUpperCase()} Motion`);
    }
  };

  const setFm1Tone = (tone: Fm1ToneSelection) => {
    setWorkspace(previous => ({ ...previous, fm1Tone: tone }));
  };

  const rememberVoice = () => {
    patchSelectedPad({ rememberedTone: workspaceRef.current.fm1Tone });
    setMidiStatus(`Pad ${selectedPadId} 已记住 ${formatTone(workspaceRef.current.fm1Tone)}`);
  };

  const recallVoice = () => {
    const tone = workspaceRef.current.pads[selectedPadId].rememberedTone;
    setFm1Tone(tone);
    setMidiStatus(`Pad ${selectedPadId} 已召回 ${formatTone(tone)}；四个 Pad 共用当前音色`);
  };

  /** 组合面板：创建/更新共享编队（可并存多个 G1/G2/…） */
  const applyFormation = useCallback((
    padId: QuadPadId,
    orderedIds: readonly string[],
    shape: FormationShape,
    rateCycles: number,
    radius?: number,
    flashOffset?: { flashDx: number; flashDy: number },
    preferId?: string | null,
  ) => {
    if (orderedIds.length < 2) return null;
    const padSnapshot = workspaceRef.current.pads[padId];
    if (padSnapshot.locked) return null;
    const existing = getPadFormations(padSnapshot);
    const orderedMatch = existing.find((item) => sameFormationMembership(item.nodeIds, orderedIds));
    const prefer = findFormationById(existing, preferId);
    const preferSetMatch = prefer && prefer.nodeIds.length === orderedIds.length
      && orderedIds.every((id) => prefer.nodeIds.includes(id))
      ? prefer
      : null;
    const updating = orderedMatch ?? preferSetMatch;
    const formationId = updating?.id ?? allocateFormationId(existing);

    setWorkspace((previous) => {
      const pad = previous.pads[padId];
      if (pad.locked) return previous;
      const orderedNodes = orderedIds
        .map((id) => pad.nodes.find((node) => node.id === id))
        .filter((node): node is NonNullable<typeof node> => Boolean(node));
      if (orderedNodes.length < 2) return previous;

      const formations = getPadFormations(pad);
      const base = createNoteFormation(orderedNodes, shape, rateCycles, { id: formationId });
      if (!base) return previous;
      const prior = updating ?? findFormationById(formations, formationId);
      let formation = patchNoteFormation(base, {
        id: formationId,
        ...(Number.isFinite(radius) ? { radius: radius! } : {}),
        ...(flashOffset ?? {}),
        ...(prior
          ? {
            centerX: prior.centerX,
            centerY: prior.centerY,
            radius: Number.isFinite(radius) ? radius! : prior.radius,
            rateCycles,
            angleDegrees: prior.angleDegrees,
            phaseOffset: prior.phaseOffset,
            direction: prior.direction,
            flashDx: flashOffset?.flashDx ?? prior.flashDx,
            flashDy: flashOffset?.flashDy ?? prior.flashDy,
          }
          : {}),
      });

      const homes = resolveFormationHomePositions(formation);
      let next = updateLilyPad(previous, padId, {
        formations: upsertFormation(formations, formation),
      });
      // 清掉成员各自 motion 与双音符；基位落到编队槽位（编队单位不支持双音符）
      for (const home of homes) {
        next = updateLilyNode(next, padId, home.nodeId, {
          x: home.x,
          y: home.y,
          motion: { mode: 'off' },
          endpointPitch: null,
        });
      }
      return next;
    });

    setSelectedFormationIds((previous) => ({ ...previous, [padId]: formationId }));
    setGroupMotionMode(shape);
    setGroupRateCycles(rateCycles);
    if (Number.isFinite(radius)) setGroupRadius(radius!);
    setFormationFocus(true);
    setMidiStatus(`Pad ${padId} · ${formationId} · ${shape} · ${orderedIds.length} 节点共形`);
    return formationId;
  }, []);

  const changeGroupMotionMode = (mode: FormationShape) => {
    setGroupMotionMode(mode);
    if (mode === 'flash') {
      const formationId = applyFormation(
        selectedPadId,
        selectedGroupIds,
        mode,
        groupRateCycles,
        groupRadius,
        undefined,
        activeFormationId,
      );
      setDrawCapture({
        padId: selectedPadId,
        nodeId: selectedGroupIds[0] ?? selectedNode.id,
        status: 'armed',
        kind: 'formation-flash',
        formationId: formationId ?? undefined,
      });
      setMidiStatus(`Pad ${selectedPadId} · 编队闪烁待命：再点目标（以首个音符为基准）`);
      return;
    }
    setDrawCapture(null);
    applyFormation(
      selectedPadId,
      selectedGroupIds,
      mode,
      groupRateCycles,
      groupRadius,
      undefined,
      activeFormationId,
    );
  };

  const changeGroupRateCycles = (rateCycles: number) => {
    const safe = Math.max(1, Math.round(rateCycles));
    setGroupRateCycles(safe);
    if (activeFormation && selectedGroupIds.length >= 2) {
      applyFormation(
        selectedPadId,
        activeFormation.nodeIds,
        activeFormation.shape,
        safe,
        activeFormation.radius,
        undefined,
        activeFormation.id,
      );
    } else if (groupMotionMode && selectedGroupIds.length >= 2) {
      applyFormation(
        selectedPadId,
        selectedGroupIds,
        groupMotionMode,
        safe,
        groupRadius,
        undefined,
        activeFormationId,
      );
    }
  };

  const changeGroupRadius = (radius: number) => {
    const safe = Math.max(0.04, Math.min(0.42, radius));
    setGroupRadius(safe);
    if (activeFormation && selectedGroupIds.length >= 2) {
      applyFormation(
        selectedPadId,
        activeFormation.nodeIds,
        activeFormation.shape,
        activeFormation.rateCycles,
        safe,
        undefined,
        activeFormation.id,
      );
    } else if (groupMotionMode && selectedGroupIds.length >= 2) {
      applyFormation(
        selectedPadId,
        selectedGroupIds,
        groupMotionMode,
        groupRateCycles,
        safe,
        undefined,
        activeFormationId,
      );
    }
  };

  const reorderGroupSelection = (nodeId: string, direction: -1 | 1) => {
    const nextIds = moveGroupOrderItem(selectedGroupIds, nodeId, direction);
    setGroupSelections((previous) => ({ ...previous, [selectedPadId]: nextIds }));
    if (activeFormation && nextIds.length >= 2) {
      applyFormation(
        selectedPadId,
        nextIds,
        activeFormation.shape,
        activeFormation.rateCycles,
        activeFormation.radius,
        undefined,
        activeFormation.id,
      );
    }
  };

  const selectGroupPrimary = (nodeId: string) => {
    setFormationFocus(false);
    setSelectedNodes((previous) => ({ ...previous, [selectedPadId]: nodeId }));
  };

  const selectFormation = (
    padId: QuadPadId = selectedPadId,
    formationId?: string,
  ) => {
    const formations = getPadFormations(workspaceRef.current.pads[padId]);
    const formation = findFormationById(formations, formationId) ?? formations[0] ?? null;
    if (!formation) return;
    setSelectedPadId(padId);
    setFormationFocus(true);
    setSelectedFormationIds((previous) => ({ ...previous, [padId]: formation.id }));
    setGroupSelections((previous) => ({ ...previous, [padId]: [...formation.nodeIds] }));
    setSelectedNodes((previous) => ({
      ...previous,
      [padId]: formation.nodeIds[0] ?? previous[padId],
    }));
    setGroupMotionMode(formation.shape);
    setGroupRateCycles(formation.rateCycles);
    setGroupRadius(formation.radius);
    setMidiStatus(`Pad ${padId} · 已选中编队 ${formation.id}`);
  };

  const dissolveFormation = (padId: QuadPadId = selectedPadId, formationId?: string) => {
    const targetId = formationId ?? selectedFormationIds[padId];
    if (!targetId) return;
    setWorkspace((previous) => {
      const pad = previous.pads[padId];
      if (pad.locked) return previous;
      return updateLilyPad(previous, padId, {
        formations: removeFormationById(getPadFormations(pad), targetId),
      });
    });
    setSelectedFormationIds((previous) => ({
      ...previous,
      [padId]: previous[padId] === targetId ? null : previous[padId],
    }));
    setFormationFocus(false);
    setMidiStatus(`Pad ${padId} · 已解散编队 ${targetId}`);
  };

  /** 编队整组静音 / 隐藏（作用于全部成员） */
  const toggleFormationMuted = () => {
    if (!activeFormation || selectedPad.locked) return;
    const members = activeFormation.nodeIds
      .map((id) => selectedPad.nodes.find((node) => node.id === id))
      .filter((node): node is NonNullable<typeof node> => Boolean(node));
    if (members.length === 0) return;
    const nextMuted = !(members.every((node) => node.muted === true));
    setWorkspace((previous) => {
      let next = previous;
      for (const id of activeFormation.nodeIds) {
        next = updateLilyNode(next, selectedPadId, id, {
          muted: nextMuted ? true : null,
        });
      }
      return next;
    });
    setMidiStatus(
      nextMuted
        ? `Pad ${selectedPadId} · ${activeFormation.id} 已整组静音`
        : `Pad ${selectedPadId} · ${activeFormation.id} 已取消静音`,
    );
  };

  const toggleFormationHidden = () => {
    if (!activeFormation || selectedPad.locked) return;
    const members = activeFormation.nodeIds
      .map((id) => selectedPad.nodes.find((node) => node.id === id))
      .filter((node): node is NonNullable<typeof node> => Boolean(node));
    if (members.length === 0) return;
    const nextHidden = !(members.every((node) => node.hidden === true));
    setWorkspace((previous) => {
      let next = previous;
      for (const id of activeFormation.nodeIds) {
        next = updateLilyNode(next, selectedPadId, id, {
          hidden: nextHidden ? true : null,
        });
      }
      return next;
    });
    setMidiStatus(
      nextHidden
        ? `Pad ${selectedPadId} · ${activeFormation.id} 已整组隐藏`
        : `Pad ${selectedPadId} · ${activeFormation.id} 已取消隐藏`,
    );
  };

  /** 点按/拖动编队枢纽：选中并允许整组平移 */
  const startFormationDrag = (
    padId: QuadPadId,
    event: React.PointerEvent<SVGGElement>,
    formationId?: string,
  ) => {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const pad = workspaceRef.current.pads[padId];
    if (pad.locked) return;
    const formations = getPadFormations(pad);
    const formation = findFormationById(formations, formationId) ?? formations[0] ?? null;
    if (!formation) return;

    selectFormation(padId, formation.id);

    const point = pointerToNormalized(svg, event.clientX, event.clientY);
    const memberStarts = formation.nodeIds.map((id) => {
      const node = pad.nodes.find((candidate) => candidate.id === id);
      return { id, x: node?.x ?? formation.centerX, y: node?.y ?? formation.centerY };
    });

    dragRef.current = {
      kind: 'move-formation',
      padId,
      formationId: formation.id,
      svg,
      pointerId: event.pointerId,
      startPointer: point,
      startCenter: { x: formation.centerX, y: formation.centerY },
      memberStarts,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setMidiStatus(`Pad ${padId} · 拖动编队 ${formation.id}`);
  };

  /** 清空任意 Pad；单轨抬头与侧栏共用，避免依赖异步的 selectedPadId */
  const clearPad = useCallback((padId: QuadPadId) => {
    dragRef.current = null;
    setDrawPreview(null);
    setDrawCapture(null);
    clearReleaseTimers(padId);
    midiBusRef.current.releaseSlot(padId);
    setWorkspace(previous => clearLilyPad(previous, padId));
    setSelectedNodes(previous => ({ ...previous, [padId]: 'center' }));
    setGroupSelections(previous => ({ ...previous, [padId]: ['center'] }));
    if (workspaceRef.current.pads[padId].playing) {
      const cleared = clearLilyPad(workspaceRef.current, padId);
      runnerRef.current?.startPad(cleared.pads[padId]);
    }
  }, [clearReleaseTimers, setDrawCapture]);

  const clearSelectedPad = () => clearPad(selectedPadId);

  const copySelectedNotes = () => {
    const clip = copyNotes(selectedPad, selectedGroupIds);
    if (!clip.nodes.length) return;
    setNoteClipboard(clip);
    pasteCountRef.current = 0;
    setMidiStatus(`已复制 ${clip.nodes.length} 个音符、${clip.formations.length} 个完整编队${clip.partialFormations ? '；部分编队仅复制所选音符，解除编队关系' : ''}（应用内剪贴板）`);
  };
  const pasteSelectedNotes = () => {
    if (!noteClipboard || selectedPad.locked) return;
    const result = pasteNotes(workspaceRef.current.pads[selectedPadId], noteClipboard, 0.04 * (++pasteCountRef.current));
    setWorkspace(previous => ({ ...previous, pads: { ...previous.pads, [selectedPadId]: result.pad } }));
    setSelectedNodes(previous => ({ ...previous, [selectedPadId]: result.ids[0] }));
    setGroupSelections(previous => ({ ...previous, [selectedPadId]: result.ids }));
    setFormationFocus(false);
    setSelectedFormationIds(previous => ({ ...previous, [selectedPadId]: null }));
    setMidiStatus(`Pad ${selectedPadId} 已粘贴 ${result.ids.length} 个音符${result.adjustedPitches ? '；目标音阶不含的音已取最近音高' : ''}；ROOT 副本为普通音符`);
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.repeat) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, [role="textbox"]'))) return;
      const key = event.key.toLowerCase();
      if (key === 'c' && selectedGroupIds.length) { event.preventDefault(); copySelectedNotes(); }
      if (key === 'v' && noteClipboard && !selectedPad.locked) { event.preventDefault(); pasteSelectedNotes(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedPad, selectedPadId, selectedGroupIds, noteClipboard]);


  /** 设置指定 Pad 的 MIDI Channel（1–16，一端口四分轨） */
  const setPadMidiChannel = useCallback((padId: QuadPadId, channel: number) => {
    const safe = Math.max(1, Math.min(16, Math.round(channel)));
    setWorkspace(previous => updateLilyPad(previous, padId, { midiChannel: safe }));
    setMidiStatus(`Pad ${padId} · MIDI Channel ${safe}`);
  }, []);

  /** 本地优先落库 + 云端同步；全局保存与单轨保存共用 */
  const persistQuickAsset = useCallback(async (asset: LibraryAsset) => {
    if (typeof window === 'undefined') return;
    try {
      const repository = new LocalStorageLibraryRepository(window.localStorage);
      const result = await persistLibraryAssetLocalFirst(asset, {
        saveLocal: candidate => repository.save(candidate),
        saveCloud: async saved => {
          await saveLibraryItem({
            id: saved.id,
            name: saved.name,
            kind: saved.type === 'workspace' ? 'scene' : 'pattern',
            data: JSON.parse(serializeLibraryAsset(saved)) as unknown,
          });
        },
      });
      setMidiStatus(
        result.cloudStatus === 'synced'
          ? `「${result.asset.name}」 saved locally + cloud.`
          : `「${result.asset.name}」 saved locally.`
      );
      setLastSavedFingerprint(libraryWorkspaceFingerprint(workspaceRef.current));
    } catch (error) {
      setMidiStatus(`Save failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }, []);

  /** 全局保存：整个 workspace 存成一张 workspace（四宫格组图）卡片 */
  const quickSaveWorkspace = useCallback(() => {
    const now = new Date();
    void persistQuickAsset(createUserWorkspaceAsset({
      id: createLibraryAssetId('workspace'),
      name: `SET · ${formatSaveStamp(now)}`,
      now: now.toISOString(),
      workspace: workspaceRef.current,
    }));
  }, [persistQuickAsset]);

  /** 单轨保存：把指定 Pad 存成单轨图案卡片 */
  const quickSavePad = useCallback((padId: QuadPadId) => {
    const now = new Date();
    void persistQuickAsset(createUserPadAsset({
      id: createLibraryAssetId('pad'),
      name: `Pad ${padId} · ${formatSaveStamp(now)}`,
      now: now.toISOString(),
      pad: workspaceRef.current.pads[padId],
    }));
  }, [persistQuickAsset]);

  const loadLibraryAsset = useCallback((asset: LibraryAsset) => {
    if (asset.type === 'recipe') {
      setMidiStatus('编曲配方用于参考；请先选择一个可播放的 Pad 或四 Pad 模板');
      return;
    }

    runnerRef.current?.stopAll();
    QUAD_PAD_IDS.forEach(clearReleaseTimers);
    midiBusRef.current.masterPanic();
    dragRef.current = null;
    setDrawPreview(null);
    setDrawCapture(null);

    const loaded = asset.type === 'pad'
      ? loadPadAssetIntoWorkspace(workspaceRef.current, asset, selectedPadId)
      : loadWorkspaceAsset(asset);
    const stopped: QuadLilyWorkspace = {
      ...loaded,
      masterPlaying: false,
      pads: Object.fromEntries(QUAD_PAD_IDS.map(padId => [
        padId,
        { ...loaded.pads[padId], playing: false },
      ])) as QuadLilyWorkspace['pads'],
    };

    setActiveNodes(createPadRecord(() => []));
    setPausedPads(createPadRecord(() => false));
    setCyclePhase(createPadRecord(() => 0));
    setCycleIndex(createPadRecord(() => 0));
    setCycleCompilations(createPadRecord<LilyCycleCompilation | null>(() => null));
    setCycleSnapshots(createPadRecord<QuadLilyPad | null>(() => null));
    setSelectedNodes(createPadRecord((padId) => (
      stopped.pads[padId].nodes.find(node => node.isCenter)?.id
        ?? stopped.pads[padId].nodes[0]?.id
        ?? null
    )));
    setWorkspace(stopped);
    setLastSavedFingerprint(libraryWorkspaceFingerprint(stopped));
    setLibraryOpen(false);
    setMidiStatus(asset.type === 'pad'
      ? `${asset.name} 已载入 Pad ${selectedPadId}，按 Space 开始试听`
      : `${asset.name} 已载入四 Pad，点击播放开始试听`);
  }, [clearReleaseTimers, selectedPadId, setDrawCapture]);

  useEffect(() => {
    const isTypingSurface = (target: Element | null) => {
      if (!target) return false;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return true;
      return target instanceof HTMLElement && target.isContentEditable;
    };

    /** SoftSelect 展开时，空格留给菜单确认，不抢运控 */
    const softSelectMenuOpen = () => Boolean(document.querySelector('.quad-soft-select.is-open'));

    const toggleSelectedPadTransport = () => {
      togglePadPlaying(selectedPadId);
    };

    const onTransportKey = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const isInput = isTypingSurface(target);

      // Space：当前选中 Pad 播放 / 暂停（无 K；全局请用顶栏按钮）
      // （K 已移除）

      // D：仅武装/取消手绘待命；录制必须按住节点拖动
      if (!isInput && (event.key === 'd' || event.key === 'D') && !event.repeat) {
        event.preventDefault();
        const capture = drawCaptureRef.current;
        if (capture && (capture.kind ?? 'draw') === 'draw' && (capture.status === 'armed' || capture.status === 'recording')) {
          cancelDraw();
        } else {
          const node = workspaceRef.current.pads[selectedPadId].nodes.find(
            candidate => candidate.id === (selectedNodes[selectedPadId] ?? ''),
          ) ?? workspaceRef.current.pads[selectedPadId].nodes.find(candidate => candidate.isCenter)
            ?? workspaceRef.current.pads[selectedPadId].nodes[0];
          if (node) {
            if (node.motion?.mode !== 'draw') {
              changeSelectedMotion({
                mode: 'draw',
                path: node.motion?.path ?? [],
                rateCycles: node.motion?.rateCycles ?? 4,
              });
            } else {
              armDraw();
            }
          }
        }
        return;
      }

      // F：闪烁待命 / 取消；再点击画布位置设定跳转目标
      if (!isInput && (event.key === 'f' || event.key === 'F') && !event.repeat) {
        event.preventDefault();
        const capture = drawCaptureRef.current;
        if (capture?.kind === 'flash' && capture.status === 'armed') {
          cancelDraw();
        } else {
          const node = workspaceRef.current.pads[selectedPadId].nodes.find(
            candidate => candidate.id === (selectedNodes[selectedPadId] ?? ''),
          ) ?? workspaceRef.current.pads[selectedPadId].nodes.find(candidate => candidate.isCenter)
            ?? workspaceRef.current.pads[selectedPadId].nodes[0];
          if (node) {
            if (node.motion?.mode !== 'flash') {
              changeSelectedMotion({
                mode: 'flash',
                rateCycles: 2,
              });
            } else {
              armFlash();
            }
          }
        }
        return;
      }

      // 1 / 4 shortcut for view mode switch
      if (!isInput && !event.repeat) {
        if (event.key === '1') {
          event.preventDefault();
          setViewMode('single');
          return;
        }
        if (event.key === '4') {
          event.preventDefault();
          setViewMode('quad');
          return;
        }
      }

      if (softSelectMenuOpen()) return;

      const transportKeyInput = {
        code: event.code,
        repeat: event.repeat,
        defaultPrevented: event.defaultPrevented,
        tagName: target?.tagName,
        isContentEditable: target instanceof HTMLElement ? target.isContentEditable : false,
        role: target?.getAttribute?.('role'),
        transportSurface: true,
      };
      if (!shouldCaptureTransportKey(transportKeyInput)) return;
      // 捕获阶段抢先阻止：避免焦点在 button 上时 Space 去「点」按钮
      event.preventDefault();
      event.stopPropagation();
      if (!shouldToggleTransport(transportKeyInput)) return;
      // Space：当前选中 Pad（切换 B 就控制 B），不是全局四轨
      toggleSelectedPadTransport();
    };
    // capture: true — 先于焦点按钮处理，保证全局快捷键
    window.addEventListener('keydown', onTransportKey, true);
    return () => window.removeEventListener('keydown', onTransportKey, true);
  }, [selectedPadId, selectedNodes, togglePadPlaying, setViewMode]);

  const masterActionHandlers: Record<string, () => void> = {
    'play-all': playAll,
    'pause-all': pauseAll,
    'restart-all': restartAll,
  };

  const padViews = QUAD_PAD_IDS.map((padId) => {
    const basePad = workspace.pads[padId];
    const isPaused = pausedPads[padId];
    const visibleCycle = resolveVisibleCycleState(basePad, cycleIndex[padId], cyclePhase[padId], isPaused);
    const visualPad = basePad.playing || isPaused
      ? materializePadMotion(basePad, visibleCycle.position)
      : restingPadSnapshots[padId];
    const lockedPitchByNodeId = new Map(
      (cycleSnapshots[padId]?.nodes ?? []).map(node => [node.id, node.scaleStep] as const),
    );
    const resolvedPad = basePad.playing || isPaused
      ? {
          ...visualPad,
          nodes: visualPad.nodes.map(node => ({
            ...node,
            scaleStep: lockedPitchByNodeId.get(node.id) ?? node.scaleStep,
          })),
        }
      : visualPad;
    const cycleCompilation = (basePad.playing || isPaused) && cycleCompilations[padId]
      ? cycleCompilations[padId]
      : restingCycleCompilations[padId];
    const presentationPad = basePad.playing || isPaused
      ? cycleSnapshots[padId] ?? basePad
      : basePad;
    const nodes = drawPreview?.padId === padId
      ? resolvedPad.nodes.map(node => node.id === drawPreview.nodeId
        ? { ...node, ...drawPreview.point }
        : node)
      : resolvedPad.nodes;
    const formations = getPadFormations(basePad);
    const formationMember = (nodeId: string) => Boolean(findFormationForNode(formations, nodeId));
    const motionRenderStates = basePad.nodes.flatMap((baseNode): LilyMotionRenderState[] => {
      if (formationMember(baseNode.id)) return [];
      if (!baseNode.motion || baseNode.motion.mode === 'off') return [];
      const currentNode = nodes.find(node => node.id === baseNode.id) ?? baseNode;
      return [{
        nodeId: baseNode.id,
        mode: baseNode.motion.mode,
        base: { x: baseNode.x, y: baseNode.y },
        current: { x: currentNode.x, y: currentNode.y },
        trail: buildNodeMotionTrail(baseNode),
        drawStatus: drawCapture?.padId === padId && drawCapture.nodeId === baseNode.id
          ? drawCapture.status
          : (baseNode.motion.mode === 'draw' && baseNode.motion.path?.length)
            || (baseNode.motion.mode === 'flash'
              && (Math.abs(baseNode.motion.targetDx ?? 0) > 1e-6 || Math.abs(baseNode.motion.targetDy ?? 0) > 1e-6))
            ? 'ready'
            : 'idle',
      }];
    });
    for (const formation of formations) {
      if (formation.nodeIds.length < 2) continue;
      const leadId = formation.nodeIds[0];
      const leadBase = basePad.nodes.find((node) => node.id === leadId);
      const leadCurrent = nodes.find((node) => node.id === leadId) ?? leadBase;
      if (!leadBase || !leadCurrent) continue;
      motionRenderStates.push({
        nodeId: `formation:${padId}:${formation.id}`,
        mode: 'formation',
        base: { x: formation.centerX, y: formation.centerY },
        current: { x: leadCurrent.x, y: leadCurrent.y },
        trail: buildPadFormationTrail(formation),
        drawStatus: drawCapture?.padId === padId
          && drawCapture.kind === 'formation-flash'
          && drawCapture.formationId === formation.id
          && drawCapture.status === 'armed'
          ? 'armed'
          : 'ready',
      });
    }
    const focusedFormationId = selectedPadId === padId && formationFocus
      ? (selectedFormationIds[padId] ?? formations[0]?.id ?? null)
      : null;
    return {
      ...basePad,
      paused: isPaused,
      timingPad: (basePad.playing || isPaused) ? presentationPad : resolvedPad,
      nodes,
      nodePresentations: buildNodePresentations(nodes, presentationPad),
      selected: selectedPadId === padId,
      cyclePhase: visibleCycle.phase,
      activeNodeIds: activeNodes[padId],
      selectedNodeId: selectedNodes[padId],
      selectedNodeIds: groupSelections[padId] ?? (selectedNodes[padId] ? [selectedNodes[padId]!] : []),
      formationHubs: formations.map((formation) => ({
        id: formation.id,
        x: formation.centerX,
        y: formation.centerY,
        shape: formation.shape,
        selected: focusedFormationId === formation.id,
      })),
      // 兼容旧单 hub 读取（取焦点或第一个）
      formationHub: (() => {
        const focused = formations.find((item) => item.id === focusedFormationId) ?? formations[0];
        return focused
          ? {
            id: focused.id,
            x: focused.centerX,
            y: focused.centerY,
            shape: focused.shape,
            selected: focusedFormationId === focused.id,
          }
          : null;
      })(),
      motionRenderStates,
      cycleCompilation,
    };
  });

  const layoutProps: QuadLilyLayoutProps = {
    workspace,
    selectedPadId,
    selectedPad,
    selectedNode,
    selectedScale,
    selectedMotion,
    formationFocus,
    padFormations,
    activeFormation,
    groupNodeIds: selectedGroupIds,
    groupMotionMode: activeFormation?.shape ?? groupMotionMode,
    groupRateCycles: activeFormation?.rateCycles ?? groupRateCycles,
    groupRadius: activeFormation?.radius ?? groupRadius,
    viewMode,
    theme,
    showNodeLabels,
    nodeLabelVisibility,
    midiPorts,
    midiStatus,
    selectedOutput,
    padViews,
    selectedTrace,
    selectedVisibleCycle,
    currentTracePresentations,
    nextTracePresentations,
    selectedBasePresentations,
    selectedBPresentations,
    drawStatus,
    cycleDrawerOpen,
    selectedIsPaused,

    onSetCycleDrawerOpen: setCycleDrawerOpen,
    onSetViewMode: setViewMode,
    onToggleTheme: () => setTheme(previous => toggleQuadTheme(previous)),
    onToggleNodeLabels: () => setShowNodeLabels(previous => !previous),
    onOpenLibrary: () => setLibraryOpen(true),
    onQuickSave: quickSaveWorkspace,
    onQuickSavePad: quickSavePad,
    onTogglePadPlaying: togglePadPlaying,
    onTogglePadLocked: togglePadLocked,
    onClearPad: clearPad,
    onSetPadMidiChannel: setPadMidiChannel,
    onChoosePad: choosePad,
    onAddNode: addNode,
    onRemoveNode: removeNode,
    onStartNodeDrag: startNodeDrag,
    onSelectNode: (nodeId) => {
      setSelectedNodes(previous => ({ ...previous, [selectedPadId]: nodeId }));
      setGroupSelections(previous => ({ ...previous, [selectedPadId]: [nodeId] }));
    },
    onCopyNotes: copySelectedNotes,
    onPasteNotes: pasteSelectedNotes,
    canPasteNotes: Boolean(noteClipboard?.nodes.length),
    onReorderGroupNode: reorderGroupSelection,
    onSelectGroupPrimary: selectGroupPrimary,
    onSelectFormation: selectFormation,
    onStartFormationDrag: startFormationDrag,
    onDissolveFormation: dissolveFormation,
    onToggleFormationMuted: toggleFormationMuted,
    onToggleFormationHidden: toggleFormationHidden,
    onChangeGroupMotionMode: changeGroupMotionMode,
    onChangeGroupRateCycles: changeGroupRateCycles,
    onChangeGroupRadius: changeGroupRadius,
    onPatchSelectedPad: patchSelectedPad,
    onPatchSelectedNode: patchSelectedNode,
    onPatchNode: patchNode,
    onChangeSelectedMotion: changeSelectedMotion,
    onArmDraw: () => {
      if (selectedNode.motion?.mode === 'flash') armFlash();
      else armDraw();
    },
    onCancelDraw: cancelDraw,
    onToggleEndpointPitch: toggleEndpointPitch,
    onRestartSelectedPad: restartSelectedPad,
    onClearSelectedPad: clearSelectedPad,
    onSetFm1Tone: setFm1Tone,
    onSetSelectedMidiOutputId: (id) => {
      userSelectedMidiIdRef.current = id;
      setMidiPorts(previous => ({ ...previous, selectedOutputId: id }));
      if (id) {
        const target = midiPorts.outputs.find(out => out.id === id);
        setMidiStatus(`${target?.name || id} 已连接 (外部硬件音色)`);
      } else {
        setMidiStatus('内置音色模式 (MIDI 未连接)');
      }
    },
    onRefreshMidi: () => void refreshMidi(),
    onRememberVoice: rememberVoice,
    onRecallVoice: recallVoice,
    onPlayAll: playAll,
    onPauseAll: pauseAll,
    onRestartAll: restartAll,
    canvasBackgroundPattern,
    onCycleCanvasBackground: () => setCanvasBackgroundPattern(previous => cycleCanvasBackground(previous)),
    cycleContinue,
    onToggleCycleContinue: () => setCycleContinue((previous) => !previous),
    soundPresetId,
    onSetSoundPresetId: (id: string) => {
      quadSynthEngine.ensureRunning();
      setSoundPresetId(id);
    },

    // 认证
    identityUser: identity.user,
    onOpenAuth: () => setAuthModalOpen(true),
    onSignOut: () => { identity.logout(); },
    createdPatternCount: (() => {
      if (typeof window === 'undefined') return 0;
      try {
        return new LocalStorageLibraryRepository(window.localStorage)
          .list()
          .filter((asset) => asset.type !== 'recipe').length;
      } catch {
        return 0;
      }
    })(),
    onUpdateNickname: (nickname: string) => identity.updateNickname(nickname),
    onEditNickname: () => {
      setNicknameModalDismissible(true);
      setNicknameModalOpen(true);
    },
    locale,
    onToggleLocale: handleToggleLocale,
  };

  return (
    <main
      className="quad-workbench"
      data-view-mode={viewMode}
      data-theme={theme}
      data-ui-variant={uiVariant}
      style={{ '--selected-pad-color': PAD_COLORS[selectedPadId] } as React.CSSProperties}
    >
      {uiVariant === 'studio' && <OnboardingTour />}
      {uiVariant === 'studio' && <StudioLayout {...layoutProps} />}
      {uiVariant === 'floating' && <FloatingLayout {...layoutProps} />}
      {uiVariant === 'performer' && <PerformerLayout {...layoutProps} />}

      {uiVariant === 'original' && (
        <>
          <header className="quad-topbar">
        <div className="quad-brand">
          <span>MUSICANVAS / SPATIAL MUSIC IN MOTION</span>
          <h1>{view.title}</h1>
          <p>{view.subtitle}</p>
        </div>
        <div className="quad-display-tools">
          <div className="quad-view-switch" role="group" aria-label="Lily Pad 显示模式">
            <button
              type="button"
              aria-label="单个 Lily Pad"
              aria-pressed={viewMode === 'single'}
              onClick={() => setViewMode('single')}
            >1 PAD</button>
            <button
              type="button"
              aria-label="四个 Lily Pad"
              aria-pressed={viewMode === 'quad'}
              onClick={() => setViewMode('quad')}
            >4 PAD</button>
          </div>
          <button
            type="button"
            className="quad-theme-toggle"
            aria-label={theme === 'lotus' ? '切换到深色主题' : '切换到荷塘浅色主题'}
            aria-pressed={theme === 'lotus'}
            onClick={() => setTheme(previous => toggleQuadTheme(previous))}
          >{theme === 'lotus' ? 'LOTUS' : 'DARK'}</button>
          <button
            type="button"
            className="quad-label-toggle"
            aria-label={showNodeLabels ? '隐藏画布节点编号和音名' : '显示画布节点编号和音名'}
            aria-pressed={showNodeLabels}
            onClick={() => setShowNodeLabels(previous => !previous)}
          >{showNodeLabels ? 'INFO ON' : 'INFO OFF'}</button>
          <button
            type="button"
            className="quad-library-toggle"
            aria-label="打开 Library 素材库"
            aria-haspopup="dialog"
            aria-expanded={libraryOpen}
            onClick={() => setLibraryOpen(true)}
          >LIBRARY</button>
        </div>
        <div
          className="quad-master-actions"
          data-scope={viewMode}
          role="group"
          aria-label={viewMode === 'single' ? `Pad ${selectedPadId} 播放控制` : '四个 Pad 的共同播放控制'}
        >
          {viewMode === 'single' ? (
            <button
              type="button"
              data-action="toggle-selected"
              className="quad-action--primary"
              aria-label={`${selectedPad.playing ? '暂停' : selectedIsPaused ? '继续' : '播放'} Pad ${selectedPadId}`}
              aria-pressed={selectedPad.playing}
              onClick={() => togglePadPlaying(selectedPadId)}
            >{selectedPad.playing ? 'PAUSE' : selectedIsPaused ? 'RESUME' : 'PLAY'} {selectedPadId}</button>
          ) : view.masterActions.map(action => (
            <button
              key={action.id}
              type="button"
              data-action={action.id}
              className={action.id === 'play-all' ? 'quad-action--primary' : 'quad-action--secondary'}
              onClick={masterActionHandlers[action.id]}
            >{action.label}</button>
          ))}
        </div>
        <div className="quad-midi-summary">
          <div className="quad-midi-summary__heading">
            <span className={selectedOutput ? 'is-connected' : ''} aria-hidden="true" />
            <strong>{view.fm1StatusLabel}</strong>
          </div>
          <div className="quad-midi-summary__controls">
            <label>
              <span>VOICE</span>
              <select aria-label="FM-1 当前音色" value={String(workspace.fm1Tone)} onChange={event => setFm1Tone(parseTone(event.target.value))}>
                <option value="follow">跟随机身</option>
                {Array.from({ length: 128 }, (_, index) => index + 1).map(tone => (
                  <option key={tone} value={tone}>{String(tone).padStart(3, '0')}</option>
                ))}
              </select>
            </label>
            <label>
              <span>MIDI OUT</span>
              <select
                aria-label="MIDI 输出"
                value={midiPorts.selectedOutputId ?? ''}
                onChange={event => setMidiPorts(previous => ({ ...previous, selectedOutputId: event.target.value || null }))}
              >
                {!midiPorts.outputs.length && <option value="">未连接</option>}
                {midiPorts.outputs.map(output => <option key={output.id} value={output.id}>{output.name || output.id}</option>)}
              </select>
            </label>
            <button type="button" className="quad-icon-button" onClick={() => void refreshMidi()}>MIDI ↻</button>
          </div>
        </div>
      </header>

      <div className="quad-status" role="status" aria-live="polite">
        <span data-playing={workspace.masterPlaying ? 'true' : 'false'} aria-hidden="true" />
        {midiStatus}
        <em>轨迹实时移动 · 发声结构从下一周期采用 · DRAW 选中后拖动节点录制</em>
      </div>

      <nav className="quad-pad-tabs" aria-label="选择要编辑的 Lily Pad">
        {QUAD_PAD_IDS.map(padId => (
          <button
            key={padId}
            type="button"
            data-active={selectedPadId === padId ? 'true' : 'false'}
            aria-label={`Pad ${padId} · ${workspace.pads[padId].playing ? '正在播放' : '已暂停'}`}
            aria-pressed={selectedPadId === padId}
            style={{ '--quad-pad-color': PAD_COLORS[padId] } as React.CSSProperties}
            onClick={() => choosePad(padId)}
          >{padId} <span aria-hidden="true">{workspace.pads[padId].playing ? '▶' : 'Ⅱ'}</span></button>
        ))}
      </nav>

      <section className="quad-main-stage" data-view-mode={viewMode}>
        <QuadLilyCanvas
          pads={padViews}
          layout={viewMode}
          showNodeLabels={nodeLabelVisibility.canvas}
          mobilePadId={selectedPadId}
          onSelectPad={choosePad}
          onAddNode={addNode}
          onNodePointerDown={startNodeDrag}
          onSelectFormation={selectFormation}
          onFormationPointerDown={startFormationDrag}
          onDeleteNode={removeNode}
          onTogglePlaying={togglePadPlaying}
          onToggleLocked={togglePadLocked}
          onPatchNode={patchNode}
          canvasBackgroundPattern={canvasBackgroundPattern}
        />

        <CycleTrace
          padId={selectedPadId}
          current={selectedTrace.current}
          next={selectedTrace.next}
          cyclePhase={selectedVisibleCycle.phase}
          selectedNodeId={selectedNodeId}
          nodePresentations={currentTracePresentations}
          nextNodePresentations={nextTracePresentations}
          showNodeLabels={nodeLabelVisibility.cycleMap}
          onSelectNode={(nodeId) => setSelectedNodes(previous => ({
            ...previous,
            [selectedPadId]: nodeId,
          }))}
        />
      </section>

      <section className="quad-control-rail" aria-label={`Pad ${selectedPadId} 实时参数`}>
        <div className="quad-control-rail__identity">
          <span>EDITING</span><strong>{selectedPadId}</strong>
          <p>{selectedPad.playing ? 'LOOPING' : 'PAUSED'} · {selectedPad.nodes.length} NODES</p>
        </div>
        <div className="quad-control-rail__primary">
          <div className="quad-control quad-control--wide">
            <label htmlFor="quad-interval">Interval <output>{selectedPad.intervalMs} ms</output></label>
            <div className="quad-control--wide__row">
              <input id="quad-interval" type="range" min="100" max="1500" step="10" value={selectedPad.intervalMs} onChange={event => patchSelectedPad({ intervalMs: Number(event.target.value) })} />
              <button type="button" onClick={restartSelectedPad}>重新起拍</button>
            </div>
          </div>
          <label className="quad-control quad-control--root">
            <span>根音</span>
            <select aria-label="根音" value={selectedPad.rootMidi} onChange={event => patchSelectedPad({ rootMidi: Number(event.target.value) })}>
              {ROOT_NOTES.map(root => <option key={root.name} value={root.midiValue}>{root.name}</option>)}
            </select>
          </label>
          <label className="quad-control quad-control--scale">
            <span>音阶</span>
            <select aria-label="音阶" value={selectedScale.key} onChange={event => patchSelectedPad({ scaleKey: event.target.value })}>
              {SCALES.filter(scale => scale.intervals.length).map(scale => <option key={scale.key} value={scale.key}>{scale.name}</option>)}
            </select>
          </label>
          <label className="quad-control quad-control--octave">
            <span>八度</span>
            <select aria-label="八度" value={selectedPad.octaveTranspose} onChange={event => patchSelectedPad({ octaveTranspose: Number(event.target.value) })}>
              {[-2, -1, 0, 1, 2].map(octave => <option key={octave} value={octave}>{octave > 0 ? `+${octave}` : octave}</option>)}
            </select>
          </label>
          <NodePitchControls
            aStep={selectedNode.scaleStep}
            bStep={selectedNode.endpointPitch?.bStep ?? null}
            aNoteName={selectedBasePresentations.get(selectedNode.id)?.noteName ?? formatStep(selectedNode.scaleStep)}
            bNoteName={selectedBPresentations?.get(selectedNode.id)?.noteName ?? null}
            motionEnabled={selectedMotion.mode !== 'off'}
            locked={selectedPad.locked}
            onChangeAStep={scaleStep => patchSelectedNode({ scaleStep })}
            onChangeBStep={bStep => patchSelectedNode({ endpointPitch: { bStep } })}
            onToggleEndpointPitch={toggleEndpointPitch}
          />
          <NodeMotionControls
            motion={selectedMotion}
            locked={selectedPad.locked}
            drawStatus={drawStatus}
            onMotionChange={changeSelectedMotion}
            onArmDraw={() => {
              if (selectedMotion.mode === 'flash') armFlash();
              else armDraw();
            }}
            onCancelDraw={cancelDraw}
          />
        </div>
        <div className="quad-control-rail__secondary">
          <label className="quad-control quad-control--range">
            <span>传播范围 <output>{Math.round(selectedNode.range * 100)}%</output></span>
            <input type="range" min="0.04" max="0.48" step="0.01" value={selectedNode.range} disabled={selectedPad.locked} onChange={event => patchSelectedNode({ range: Number(event.target.value) })} />
          </label>
          <label className="quad-control quad-control--velocity">
            <span>力度 <output>{Math.round(selectedPad.velocity * 127)}</output></span>
            <input type="range" min="0.08" max="1" step="0.01" value={selectedPad.velocity} onChange={event => patchSelectedPad({ velocity: Number(event.target.value) })} />
          </label>
          <div
            className="quad-voice-memory"
            title="FM-1 只有一个当前音色；召回后四个 Pad 一起使用它。"
          >
            <span>PAD {selectedPadId} VOICE · {formatTone(selectedPad.rememberedTone)}</span>
            <div>
              <button type="button" aria-label="记住当前 Voice" onClick={rememberVoice}>记住</button>
              <button type="button" aria-label="召回 Voice" onClick={recallVoice}>召回</button>
            </div>
            <small>四个 Pad 共用 FM-1 当前音色</small>
          </div>
          <div className="quad-control-rail__utility">
            <button
              type="button"
              className="quad-action--tertiary quad-utility-lock"
              onClick={() => togglePadLocked(selectedPadId)}
            >{selectedPad.locked ? '解锁编辑' : '锁定图案'}</button>
            <button type="button" className="quad-action--danger" disabled={selectedPad.locked} onClick={clearSelectedPad}>清空节点</button>
            <details className="quad-utility-menu">
              <summary>更多</summary>
              <div>
                <a className="quad-action--tertiary" href="/desk/legacy">← Desk</a>
                <a className="quad-action--tertiary" href="/">返回 Lab ↗</a>
              </div>
            </details>
          </div>
        </div>
      </section>
        </>
      )}

      {libraryOpen && (
        <LibraryDrawer
          open={libraryOpen}
          workspace={workspace}
          selectedPadId={selectedPadId}
          isAuthenticated={Boolean(identity.user)}
          identityEmail={identity.user?.email}
          identityNickname={identity.user?.name}
          isDirty={isLibraryDirty}
          onRequireNickname={() => {
            setNicknameModalDismissible(true);
            setNicknameModalOpen(true);
          }}
          onCaptureSaved={() => {
            setLastSavedFingerprint(libraryWorkspaceFingerprint(workspaceRef.current));
          }}
          onClose={() => setLibraryOpen(false)}
          onLoadAsset={loadLibraryAsset}
          onStatus={setMidiStatus}
        />
      )}

      {/* 登录 / 注册弹窗 */}
      <AuthModal
        open={authModalOpen}
        identity={identity}
        onClose={() => setAuthModalOpen(false)}
      />

      <NicknameModal
        open={nicknameModalOpen && Boolean(identity.user)}
        identity={identity}
        dismissible={nicknameModalDismissible}
        onClose={() => setNicknameModalOpen(false)}
      />
    </main>
  );
}

function compactDrawPath(path: DrawMotionKeyframe[], limit: number): DrawMotionKeyframe[] {
  if (path.length <= limit) return path;
  return Array.from({ length: limit }, (_, index) => (
    path[Math.round(index * (path.length - 1) / (limit - 1))]
  ));
}

function parseTone(value: string): Fm1ToneSelection {
  if (value === 'follow') return 'follow';
  const tone = Number(value);
  return Number.isInteger(tone) && tone >= 1 && tone <= 128 ? tone : 'follow';
}

/** 快速保存卡片命名用的 MM-DD HH:mm 时间戳 */
function formatSaveStamp(now: Date): string {
  const pad2 = (value: number) => String(value).padStart(2, '0');
  return `${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
}

function formatTone(tone: Fm1ToneSelection): string {
  return tone === 'follow' ? '跟随机身' : `VOICE ${String(tone).padStart(3, '0')}`;
}

function formatStep(step: number): string {
  return step > 0 ? `+${step}` : String(step);
}

function pointerToNormalized(svg: SVGSVGElement, clientX: number, clientY: number): QuadLilyPoint {
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
    x: clampPadCoord(svgX / 100, vbX / 100, (vbX + vbW) / 100),
    y: clampPadCoord(svgY / 100, vbY / 100, (vbY + vbH) / 100),
  };
}

function clampPadCoord(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return (min + max) / 2;
  return Math.max(min, Math.min(max, value));
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5));
}
