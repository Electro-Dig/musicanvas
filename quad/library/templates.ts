import {
  QUAD_PAD_IDS,
  addLilyNode,
  createQuadLilyWorkspace,
  updateLilyNode,
  updateLilyPad,
  type NewLilyNode,
  type QuadLilyPad,
  type QuadLilyPadPatch,
  type QuadLilyWorkspace,
  type QuadPadId,
} from '../core.ts';
import type { LilyNodeMotion } from '../motion.ts';
import { createAirProgression, createAirEightProgression, createAirRhythm, createAirBass } from '../airProgression.ts';
import {
  createPublicPadAsset,
  createPublicRecipeAsset,
  createPublicWorkspaceAsset,
  type LibraryAsset,
  type LibraryPadAsset,
  type LibraryRecipeAsset,
  type LibraryWorkspaceAsset,
} from './core.ts';

const TEMPLATE_TIMESTAMP = '2026-09-02T00:00:00.000Z';

interface TemplateNode extends NewLilyNode {
  motion?: LilyNodeMotion;
}

const fixedSpinePad = buildPad(
  { intervalMs: 800, rootMidi: 60, scaleKey: 'majorPentatonic', velocity: 0.78 },
  { x: 0.30, y: 0.50, range: 0.24, scaleStep: 0 },
  [
    { id: 'pulse', x: 0.48, y: 0.50, range: 0.21, scaleStep: 2 },
    { id: 'motif', x: 0.66, y: 0.48, range: 0.20, scaleStep: 4 },
    { id: 'bridge-a', x: 0.80, y: 0.39, range: 0.14, scaleStep: 7 },
    { id: 'bridge-b', x: 0.80, y: 0.62, range: 0.14, scaleStep: 6 },
  ],
);

const tensionRingsPad = buildPad(
  { intervalMs: 960, rootMidi: 62, scaleKey: 'minorPentatonic', velocity: 0.74 },
  { x: 0.50, y: 0.50, range: 0.22, scaleStep: 0 },
  [
    { id: 'inner', x: 0.63, y: 0.50, range: 0.18, scaleStep: 2 },
    { id: 'middle', x: 0.75, y: 0.50, range: 0.16, scaleStep: 4 },
    {
      id: 'outer', x: 0.86, y: 0.50, range: 0.14, scaleStep: 6,
      endpointPitch: { bStep: 8 },
      motion: { mode: 'pendulum', amount: 0.06, angleDegrees: 0, rateCycles: 4, direction: 1 },
    },
  ],
);

const rigidOrbitPad = buildPad(
  { intervalMs: 900, rootMidi: 60, scaleKey: 'maj7', velocity: 0.7 },
  { x: 0.50, y: 0.50, range: 0.34, scaleStep: 0 },
  [
    {
      id: 'orbit-1', x: 0.64, y: 0.50, range: 0.18, scaleStep: 1,
      motion: { mode: 'orbit', amount: 0.06, rateCycles: 4, phaseOffset: 0, direction: 1 },
    },
    {
      id: 'orbit-2', x: 0.45, y: 0.65, range: 0.18, scaleStep: 2,
      motion: { mode: 'orbit', amount: 0.06, rateCycles: 4, phaseOffset: 1 / 3, direction: 1 },
    },
    {
      id: 'orbit-3', x: 0.41, y: 0.38, range: 0.18, scaleStep: 3,
      motion: { mode: 'orbit', amount: 0.06, rateCycles: 4, phaseOffset: 2 / 3, direction: 1 },
    },
  ],
);

const pendulumQuestionPad = buildPad(
  { intervalMs: 1_000, rootMidi: 55, scaleKey: 'minor', velocity: 0.76 },
  { x: 0.50, y: 0.50, range: 0.36, scaleStep: 0 },
  [
    { id: 'question', x: 0.34, y: 0.52, range: 0.20, scaleStep: -2 },
    { id: 'answer', x: 0.66, y: 0.48, range: 0.20, scaleStep: 3 },
    {
      id: 'mover', x: 0.50, y: 0.68, range: 0.18, scaleStep: 1,
      endpointPitch: { bStep: 5 },
      motion: { mode: 'pendulum', amount: 0.18, angleDegrees: 0, rateCycles: 2, direction: 1 },
    },
  ],
);

const drawStationsPad = buildPad(
  { intervalMs: 1_120, rootMidi: 65, scaleKey: 'majorPentatonic', velocity: 0.68 },
  { x: 0.30, y: 0.55, range: 0.22, scaleStep: 0 },
  [
    { id: 'station-1', x: 0.47, y: 0.55, range: 0.20, scaleStep: 1 },
    { id: 'station-2', x: 0.62, y: 0.45, range: 0.20, scaleStep: 3 },
    { id: 'station-3', x: 0.76, y: 0.54, range: 0.20, scaleStep: 5 },
    {
      id: 'traveler', x: 0.60, y: 0.70, range: 0.18, scaleStep: 4,
      motion: {
        mode: 'draw', rateCycles: 4, direction: 1,
        path: [
          { phase: 0, dx: -0.12, dy: 0 },
          { phase: 0.25, dx: 0, dy: -0.16 },
          { phase: 0.5, dx: 0.14, dy: 0 },
          { phase: 0.75, dx: 0, dy: 0.12 },
        ],
      },
    },
  ],
);

export const PUBLIC_PAD_TEMPLATES: readonly LibraryPadAsset[] = [
  createPublicPadAsset({id:'air-light-bass',name:'轻盈落点 · 弹拨低音',description:'十六秒八和弦低音，每两秒落根音，间隔加入短补音。',tags:['低音','ambient'],pad:createAirBass(),now:TEMPLATE_TIMESTAMP}),
  createPublicPadAsset({id:'air-light-rhythm',name:'轻盈错拍 · 木琴节奏',description:'两秒一轮的轻快错拍，独立 Marimba 音色，与空灵八和弦叠加。',tags:['节奏','ambient'],pad:createAirRhythm(),now:TEMPLATE_TIMESTAMP}),
  createPublicPadAsset({ id: 'air-minor-eight-chords', name: '空灵小调 · 八和弦',
    description: 'Am(add9) → Fmaj7 → Cmaj7 → G(add9)/B → Dm(add9) → Am7/C → Fmaj7 → E7。每和弦两秒，十六秒回归。使用 Air Pad。',
    tags: ['和弦', 'ambient'], pad: createAirEightProgression(), now: TEMPLATE_TIMESTAMP }),
  createPublicPadAsset({ id: 'air-minor-four-chords', name: '空灵小调 · 四和弦',
    description: 'Am(add9) → Fmaj7 → Cmaj7 → Em7。60 BPM，每和弦两秒，八秒循环；配合 Air Pad 音色。',
    tags: ['和弦', 'ambient'], pad: createAirProgression(), now: TEMPLATE_TIMESTAMP }),
  createPublicPadAsset({
    id: 'playbook-fixed-spine',
    name: 'Fixed Spine / 固定主干',
    description: 'S1 + F3：稳定传播骨架配一组可交换尾句，移动只改变局部分支。',
    tags: ['playbook', 'safe', 'spine', 'bridge'],
    pad: fixedSpinePad,
    now: TEMPLATE_TIMESTAMP,
  }),
  createPublicPadAsset({
    id: 'playbook-tension-rings',
    name: 'Tension Rings / 张力环',
    description: 'S2：由内向外逐步提高张力，并保留清楚的回家路径。',
    tags: ['playbook', 'safe', 'tension', 'pendulum'],
    pad: tensionRingsPad,
    now: TEMPLATE_TIMESTAMP,
  }),
  createPublicPadAsset({
    id: 'playbook-rigid-orbit',
    name: 'Rigid Orbit / 刚性星座',
    description: 'S3：旋律身份不变，让三个节点以四周期 ORBIT 推动相位。',
    tags: ['playbook', 'safe', 'orbit', 'phase'],
    pad: rigidOrbitPad,
    now: TEMPLATE_TIMESTAMP,
  }),
  createPublicPadAsset({
    id: 'playbook-pendulum-question',
    name: 'Pendulum Question / 左右问答',
    description: 'S4：PENDULUM 在低位问句与高位答句之间形成两周期呼吸。',
    tags: ['playbook', 'safe', 'pendulum', 'call-response'],
    pad: pendulumQuestionPad,
    now: TEMPLATE_TIMESTAMP,
  }),
  createPublicPadAsset({
    id: 'playbook-draw-stations',
    name: 'Draw Stations / 站点谱',
    description: 'S5：DRAW 只经过少量显式站点，路径负责乐句而不制造过密事件。',
    tags: ['playbook', 'safe', 'draw', 'stations'],
    pad: drawStationsPad,
    now: TEMPLATE_TIMESTAMP,
  }),
] as const;

const phaseStaircaseWorkspace = buildWorkspace({
  A: remapPad(fixedSpinePad, 'A', { intervalMs: 500, rootMidi: 48 }),
  B: remapPad(rigidOrbitPad, 'B', { intervalMs: 750, rootMidi: 60 }),
  C: remapPad(pendulumQuestionPad, 'C', { intervalMs: 1_000, rootMidi: 67 }),
  D: remapPad(drawStationsPad, 'D', { intervalMs: 1_500, rootMidi: 72 }),
});

const anchorShadowWorkspace = buildWorkspace({
  A: remapPad(tensionRingsPad, 'A', { intervalMs: 500, rootMidi: 48, velocity: 0.62 }),
  B: remapPad(fixedSpinePad, 'B', { intervalMs: 500, rootMidi: 60, velocity: 0.78 }),
  C: remapPad(pendulumQuestionPad, 'C', { intervalMs: 1_000, rootMidi: 72, velocity: 0.5 }),
  D: remapPad(drawStationsPad, 'D', { intervalMs: 1_500, rootMidi: 67, velocity: 0.42 }),
});

export const PUBLIC_WORKSPACE_TEMPLATES: readonly LibraryWorkspaceAsset[] = [
  createPublicWorkspaceAsset({
    id: 'playbook-phase-staircase-quad',
    name: 'Phase Staircase Quartet / 相位阶梯四重奏',
    description: 'F6：四 Pad 使用 1 : 1.5 : 2 : 3 周期比，只有一对声部显著相移。',
    tags: ['playbook', 'quad', 'phase', 'polymeter'],
    workspace: phaseStaircaseWorkspace,
    now: TEMPLATE_TIMESTAMP,
  }),
  createPublicWorkspaceAsset({
    id: 'playbook-anchor-shadow-quad',
    name: 'Anchor & Shadow / 锚点与影子',
    description: 'F4 + F5：低音锚点、主题、弱力度回应与稀疏色彩组成可读的四层场景。',
    tags: ['playbook', 'quad', 'anchor', 'canon', 'negative-space'],
    workspace: anchorShadowWorkspace,
    now: TEMPLATE_TIMESTAMP,
  }),
] as const;

export const PUBLIC_RECIPE_TEMPLATES: readonly LibraryRecipeAsset[] = [
  createPublicRecipeAsset({
    id: 'recipe-abac-form',
    name: 'ABAC Form / 基本曲式',
    description: 'ABAC 是编曲层的结构配方；它描述素材如何复现和变奏，不是可直接加载的 Lily Pad。',
    tags: ['recipe', 'arrangement', 'abac'],
    now: TEMPLATE_TIMESTAMP,
    recipe: {
      family: 'arrangement',
      notation: 'A B A C',
      summary: '先建立主题 A，以 B 对比，再确认 A，最后用 C 提供结尾或新方向。',
      steps: [
        { id: 'a1', label: 'A / 陈述', cycles: 4, instruction: '固定主骨架和音色，让主题至少重复两次。' },
        { id: 'b', label: 'B / 对比', cycles: 4, instruction: '只改变一个主维度，例如尾句、音域或相位。' },
        { id: 'a2', label: 'A / 回归', cycles: 4, instruction: '召回原主题与锚点，允许保留一个很小的装饰变化。' },
        { id: 'c', label: 'C / 转折', cycles: 4, instruction: '引入新的局部分支或张力，并留下明确的收束动作。' },
      ],
    },
  }),
  createPublicRecipeAsset({
    id: 'recipe-aaba-return-form',
    name: 'AABA Return / 回归曲式',
    description: 'AABA 先建立熟悉度，再用 B 拉开对比；它是可修改的创作起点，不是唯一写法。',
    tags: ['recipe', 'arrangement', 'aaba', 'return'],
    now: TEMPLATE_TIMESTAMP,
    recipe: {
      family: 'arrangement',
      notation: 'A A B A',
      summary: '用两次 A 让主题被记住，B 暂时改变视角，最后回到 A 获得归属感。',
      steps: [
        { id: 'a1', label: 'A1 / 主题', cycles: 4, instruction: '用最清楚的点位骨架陈述主题，先不加过多运动。' },
        { id: 'a2', label: 'A2 / 再识别', cycles: 4, instruction: '保留主骨架，只换一个尾音、力度或小范围位移。' },
        { id: 'b', label: 'B / 窗口', cycles: 4, instruction: '改变音区、密度或传播方向中的一项，让对比可听但仍属于同一世界。' },
        { id: 'a3', label: 'A3 / 回归', cycles: 4, instruction: '召回 A1 的核心路径，可保留 B 中一个轻微的痕迹作为收束。' },
      ],
    },
  }),
  createPublicRecipeAsset({
    id: 'recipe-call-response',
    name: 'Call & Response / 呼应对话',
    description: '把两组节点当成问句与答句，通过留白和轻微变体让两者真正形成对话。',
    tags: ['recipe', 'arrangement', 'call-response', 'space'],
    now: TEMPLATE_TIMESTAMP,
    recipe: {
      family: 'arrangement',
      notation: 'CALL → SPACE → RESPONSE → VARIATION',
      summary: '一个短句提出动机，留出可感知的空隙，再用相关但不完全相同的短句回答。',
      steps: [
        { id: 'call', label: 'Call / 问句', cycles: 2, instruction: '用 2–3 个易识别的节点说出短句，句尾暂时不完全收束。' },
        { id: 'space', label: 'Space / 留白', cycles: 1, instruction: '减少一层传播或让节点暂时不命中，为回答留出可听的空间。' },
        { id: 'response', label: 'Response / 答句', cycles: 2, instruction: '沿用问句的节奏身份，但换音区、方向或结尾音。' },
        { id: 'variation', label: 'Variation / 再回答', cycles: 2, instruction: '第二轮只改一个关键命中，比如最后一音或响应时差。' },
      ],
    },
  }),
  createPublicRecipeAsset({
    id: 'recipe-build-drop-arc',
    name: 'Build & Drop / 蓄力与释放',
    description: '用密度、音区和留白创造蓄力—释放的能量曲线；可作为电子音乐以外的广义编排启发。',
    tags: ['recipe', 'arrangement', 'energy', 'build-drop'],
    now: TEMPLATE_TIMESTAMP,
    recipe: {
      family: 'arrangement',
      notation: 'BASE → BUILD → BREATH → DROP → RELEASE',
      summary: '先给出可辨认的基准，再逐步增加活动量；用短留白放大期待，然后集中释放。',
      steps: [
        { id: 'base', label: 'Base / 基准', cycles: 4, instruction: '保留一条稳定的低密度路径，让后续变化有比较对象。' },
        { id: 'build', label: 'Build / 蓄力', cycles: 4, instruction: '每周期只增加一项：更快命中、更高音区、更广传播或新声部。' },
        { id: 'breath', label: 'Breath / 吸气', cycles: 1, instruction: '在释放前短暂减少命中数，而不是继续堆叠所有参数。' },
        { id: 'drop', label: 'Drop / 释放', cycles: 4, instruction: '让核心路径、重心和最强对比同时回来，前两周期保持清楚。' },
        { id: 'release', label: 'Release / 回落', cycles: 2, instruction: '移除一个高密度层，留下主题或余韵，为下一段重置空间。' },
      ],
    },
  }),
  createPublicRecipeAsset({
    id: 'recipe-basic-drum-skeleton',
    name: 'Basic Drum Skeleton / 基础鼓组骨架',
    description: '基础鼓组 recipe 用 Kick、Snare 与 Hat 说明层级；当前 Quad Lily 不直接加载鼓组。',
    tags: ['recipe', 'rhythm', 'drums'],
    now: TEMPLATE_TIMESTAMP,
    recipe: {
      family: 'rhythm',
      notation: 'KICK / SNARE / HAT',
      summary: 'Kick 提供重心，Snare 提供问答，Hat 提供细分；先稳定两层，再加入第三层变异。',
      steps: [
        { id: 'kick', label: 'Kick / 重心', cycles: 4, instruction: '每周期保留 1–2 个稳定重音，作为其他运动的参考。' },
        { id: 'snare', label: 'Snare / 回答', cycles: 4, instruction: '落在 Kick 的空隙或后半句，避免同时增加密度与力度。' },
        { id: 'hat', label: 'Hat / 细分', cycles: 4, instruction: '使用稀疏细分；每四周期只改变一次开闭或省略位置。' },
      ],
    },
  }),
  createPublicRecipeAsset({
    id: 'recipe-tresillo-cell',
    name: 'Tresillo Cell / 3+3+2 律动',
    description: '把一个周期分成八份，在第 1、4、7 份形成 3+3+2 的重音间隔，再用其他声部与它错开。',
    tags: ['recipe', 'rhythm', 'tresillo', '332'],
    now: TEMPLATE_TIMESTAMP,
    recipe: {
      family: 'rhythm',
      notation: 'X . . X . . X .',
      summary: '3+3+2 细分给出一个可循环的不均匀重心，适合作为较长 Lily 周期的节奏参照。',
      steps: [
        { id: 'grid', label: 'Grid / 八等分', cycles: 1, instruction: '先把一周期想象为八个等长位置，保持总周期时长不变。' },
        { id: 'accents', label: 'Accents / 1·4·7', cycles: 2, instruction: '只强调第 1、4、7 个位置，先听清 3+3+2 的重心。' },
        { id: 'counter', label: 'Counter / 错位声部', cycles: 2, instruction: '另一声部避开三个主重音，只在空隙中回应 1–2 次。' },
        { id: 'variation', label: 'Variation / 小变体', cycles: 4, instruction: '每四周期仅省略或推迟一个重音，然后回到原型。' },
      ],
    },
  }),
  createPublicRecipeAsset({
    id: 'recipe-four-on-floor-layers',
    name: 'Four-on-the-Floor / 四拍层次',
    description: '用四个均匀 Kick 建立地板，再叠加反拍与细分；它是可拆解的起点，不必每层都保留。',
    tags: ['recipe', 'rhythm', 'four-on-floor', 'layers'],
    now: TEMPLATE_TIMESTAMP,
    recipe: {
      family: 'rhythm',
      notation: 'K: X X X X · S: . X . X · H: x x x x x x x x',
      summary: '四拍 Kick 提供稳定脉冲，Snare 标记反拍，Hat 补足八分细分；用加减层次而非不断加密制造段落。',
      steps: [
        { id: 'kick', label: 'Kick / 四个重心', cycles: 4, instruction: '在一周期的四个四分位置保持稳定命中，先不增加装饰。' },
        { id: 'snare', label: 'Snare / 2 与 4', cycles: 4, instruction: '在第 2、4 拍加回答层，必要时保留一处留白。' },
        { id: 'hat', label: 'Hat / 八分细分', cycles: 4, instruction: '加入均匀八分细分，用力度区分主拍与拍间，避免全部同样重。' },
        { id: 'turn', label: 'Turn / 周期转角', cycles: 4, instruction: '在第四周期省略一个 Kick 或加一个短回应，为下一轮制造入口。' },
      ],
    },
  }),
] as const;

export const PUBLIC_LIBRARY_TEMPLATES: readonly LibraryAsset[] = [
  ...PUBLIC_PAD_TEMPLATES,
  ...PUBLIC_WORKSPACE_TEMPLATES,
  ...PUBLIC_RECIPE_TEMPLATES,
] as const;

function buildPad(
  patch: QuadLilyPadPatch,
  center: Pick<TemplateNode, 'x' | 'y' | 'range' | 'scaleStep'>,
  nodes: TemplateNode[],
): QuadLilyPad {
  let workspace = updateLilyPad(createQuadLilyWorkspace(), 'A', patch);
  workspace = updateLilyNode(workspace, 'A', 'center', center);
  nodes.forEach((node) => {
    workspace = addLilyNode(workspace, 'A', node);
    if (node.motion) workspace = updateLilyNode(workspace, 'A', node.id, { motion: node.motion });
  });
  return workspace.pads.A;
}

function remapPad(
  pad: QuadLilyPad,
  id: QuadPadId,
  patch: Partial<Pick<QuadLilyPad, 'intervalMs' | 'rootMidi' | 'velocity'>> = {},
): QuadLilyPad {
  return { ...pad, ...patch, id, playing: false };
}

function buildWorkspace(pads: Record<QuadPadId, QuadLilyPad>): QuadLilyWorkspace {
  const workspace = createQuadLilyWorkspace();
  return {
    ...workspace,
    masterPlaying: false,
    pads: Object.fromEntries(QUAD_PAD_IDS.map(id => [id, pads[id]])) as QuadLilyWorkspace['pads'],
  };
}
