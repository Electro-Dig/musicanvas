import type React from 'react';
import type { ScaleDefinition } from '../musicTheory';
import type { DeskMidiPortsSnapshot } from '../midiPorts';
import type { IdentityUser } from '../auth/useIdentity';
import type { AppLocale } from '../i18n';
import type {
  Fm1ToneSelection,
  LilyNode,
  LilyNodePatch,
  QuadLilyPad,
  QuadLilyPadPatch,
  QuadLilyWorkspace,
  QuadPadId,
} from '../core';
import type { DrawCaptureStatus } from '../NodeMotionControls';
import type { NodePresentation } from '../nodePresentation';
import type { LilyNodeMotion } from '../motion';
import type { FormationShape, LilyNoteFormation } from '../groupMotion';
import type {
  LilyMotionRenderState,
  QuadLilyCanvasLayout,
  QuadLilyPoint,
} from '../QuadLilyCanvas';
import type { QuadTheme } from '../theme';
import type { CanvasBackgroundPattern } from '../canvasBackground';
import type { buildCycleTracePair, resolveVisibleCycleState } from '../cycleTraceModel';

export interface QuadLilyLayoutProps {
  sequencePanel?: React.ReactNode;
  sequenceAtlas?: React.ReactNode;
  structureMap?: React.ReactNode;
  melodyFollow?: React.ReactNode;
  workspace: QuadLilyWorkspace;
  selectedPadId: QuadPadId;
  selectedPad: QuadLilyPad;
  selectedNode: LilyNode;
  selectedScale: ScaleDefinition;
  selectedMotion: LilyNodeMotion;
  /** Ctrl 组合点选的有序节点 id */
  groupNodeIds: string[];
  groupMotionMode: FormationShape | null;
  groupRateCycles: number;
  groupRadius: number;
  /** 是否正在编辑画布编队枢纽 */
  formationFocus: boolean;
  /** 当前 Pad 全部编队单位 */
  padFormations: LilyNoteFormation[];
  /** 当前焦点编队（轨迹面板编辑对象） */
  activeFormation: LilyNoteFormation | null;
  viewMode: QuadLilyCanvasLayout;
  theme: QuadTheme;
  showNodeLabels: boolean;
  nodeLabelVisibility: { canvas: boolean; cycleMap: boolean };
  midiPorts: DeskMidiPortsSnapshot;
  midiStatus: string;
  selectedOutput?: { id: string; name?: string };
  padViews: Array<{
    timingPad: QuadLilyPad;
    id: QuadPadId;
    nodes: LilyNode[];
    intervalMs: number;
    playing: boolean;
    loop: boolean;
    locked: boolean;
    velocity: number;
    rememberedTone: Fm1ToneSelection;
    rootMidi: number;
    scaleKey: string;
    octaveTranspose: number;
    /** MIDI Channel 1–16（一端口四分轨） */
    midiChannel: number;
    paused: boolean;
    nodePresentations: Map<string, NodePresentation>;
    selected: boolean;
    cyclePhase: number;
    activeNodeIds: string[];
    selectedNodeId: string | null;
    selectedNodeIds?: string[];
    formationHub?: {
      id: string;
      x: number;
      y: number;
      shape: 'circle' | 'line' | 'flash';
      selected: boolean;
    } | null;
    /** 多编队枢纽（优先使用） */
    formationHubs?: Array<{
      id: string;
      x: number;
      y: number;
      shape: 'circle' | 'line' | 'flash';
      selected: boolean;
    }>;
    motionRenderStates: LilyMotionRenderState[];
    cycleCompilation: any;
  }>;
  selectedTrace: ReturnType<typeof buildCycleTracePair>;
  selectedVisibleCycle: ReturnType<typeof resolveVisibleCycleState>;
  currentTracePresentations: Map<string, NodePresentation>;
  nextTracePresentations: Map<string, NodePresentation> | null;
  selectedBasePresentations: Map<string, NodePresentation>;
  selectedBPresentations: Map<string, NodePresentation> | null;
  drawStatus: DrawCaptureStatus;
  cycleDrawerOpen: boolean;
  selectedIsPaused: boolean;

  onSetCycleDrawerOpen: (open: boolean) => void;
  onSetViewMode: (mode: QuadLilyCanvasLayout) => void;
  onToggleTheme: () => void;
  onToggleNodeLabels: () => void;
  onOpenLibrary: () => void;
  /** 全局保存：整个 workspace 存成一张四宫格组图卡片 */
  onQuickSave?: () => void;
  /** 单轨保存：把指定 Pad 存成单轨图案卡片 */
  onQuickSavePad?: (padId: QuadPadId) => void;
  onTogglePadPlaying: (padId: QuadPadId) => void;
  onTogglePadLocked: (padId: QuadPadId) => void;
  /** 清空指定 Pad（单轨抬头用；侧栏仍走 onClearSelectedPad） */
  onClearPad?: (padId: QuadPadId) => void;
  /** 设置指定 Pad 的 MIDI Channel */
  onSetPadMidiChannel?: (padId: QuadPadId, channel: number) => void;
  onChoosePad: (padId: QuadPadId) => void;
  onAddNode: (padId: QuadPadId, point: QuadLilyPoint) => void;
  onRemoveNode: (padId: QuadPadId, nodeId: string) => void;
  onStartNodeDrag: (padId: QuadPadId, nodeId: string, event: React.PointerEvent<SVGGElement>) => void;
  onSelectNode: (nodeId: string) => void;
  onCopyNotes: () => void;
  onPasteNotes: () => void;
  canPasteNotes: boolean;
  onReorderGroupNode: (nodeId: string, direction: -1 | 1) => void;
  onSelectGroupPrimary: (nodeId: string) => void;
  onSelectFormation: (padId?: QuadPadId, formationId?: string) => void;
  onStartFormationDrag: (
    padId: QuadPadId,
    event: React.PointerEvent<SVGGElement>,
    formationId?: string,
  ) => void;
  onDissolveFormation: (padId?: QuadPadId, formationId?: string) => void;
  /** 编队整组静音 / 隐藏 */
  onToggleFormationMuted: () => void;
  onToggleFormationHidden: () => void;
  onChangeGroupMotionMode: (mode: FormationShape) => void;
  onChangeGroupRateCycles: (rateCycles: number) => void;
  onChangeGroupRadius: (radius: number) => void;
  onPatchSelectedPad: (patch: QuadLilyPadPatch) => void;
  onPatchSelectedNode: (patch: LilyNodePatch) => void;
  /** 补丁任意 Pad 的任意节点（画布滚轮调音等不依赖侧栏选中态的交互） */
  onPatchNode?: (padId: QuadPadId, nodeId: string, patch: LilyNodePatch) => void;
  onChangeSelectedMotion: (motion: LilyNodeMotion) => void;
  onArmDraw: (nodeId: string) => void;
  onCancelDraw: (nodeId: string) => void;
  onToggleEndpointPitch: () => void;
  onRestartSelectedPad: () => void;
  onClearSelectedPad: () => void;
  onSetFm1Tone: (tone: Fm1ToneSelection) => void;
  onSetSelectedMidiOutputId: (id: string | null) => void;
  onRefreshMidi: () => void;
  onRememberVoice: (padId: QuadPadId) => void;
  onRecallVoice: (padId: QuadPadId) => void;
  onPlayAll: () => void;
  onPauseAll: () => void;
  onRestartAll: () => void;
  onClearAll?: () => void;
  onPatchAllTiming?: (patch: QuadLilyPadPatch) => void;

  soundPresetId?: string;
  onSetSoundPresetId?: (id: string, padId?: QuadPadId) => void;

  /** 画布背景图案（荷塘装饰），默认 'none' */
  canvasBackgroundPattern?: CanvasBackgroundPattern;
  /** 在 none / pond1–4 之间循环切换 */
  onCycleCanvasBackground?: () => void;
  /** 延续播放：超周期节点仍按跳时播完 */
  cycleContinue?: boolean;
  onToggleCycleContinue?: () => void;

  /** 当前登录用户（null=未登录，undefined=初始化中） */
  identityUser?: IdentityUser | null;
  onOpenAuth?: () => void;
  onSignOut?: () => void;
  createdPatternCount?: number;
  /** 保存昵称（账号信息栏） */
  onUpdateNickname?: (nickname: string) => Promise<void>;
  /** 打开昵称编辑弹窗 */
  onEditNickname?: () => void;
  /** 界面语言 */
  locale?: AppLocale;
  onToggleLocale?: () => void;
}
