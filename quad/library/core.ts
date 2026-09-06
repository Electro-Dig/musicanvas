import { SCALES } from '../musicTheory.ts';
import {
  QUAD_PAD_IDS,
  createQuadLilyWorkspace,
  parseQuadLilyWorkspace,
  type QuadLilyPad,
  type QuadLilyWorkspace,
  type QuadPadId,
} from '../core.ts';

export const LIBRARY_ASSET_KIND = 'gemidi.quad-lily-library-asset' as const;
export const LIBRARY_ASSET_VERSION = 1 as const;
export const LIBRARY_ASSET_MAX_BYTES = 512 * 1024;
export const LIBRARY_MAX_NODES_PER_PAD = 64;
export const LIBRARY_MAX_WORKSPACE_NODES = LIBRARY_MAX_NODES_PER_PAD * QUAD_PAD_IDS.length;

const PLAYABLE_SCALE_KEYS = new Set(
  SCALES.filter(scale => scale.intervals.length > 0).map(scale => scale.key),
);
const LIBRARY_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/;

export type LibraryAssetType = 'pad' | 'workspace' | 'recipe';
export type LibraryAssetCapability = 'playable' | 'recipe';
export type LibraryAssetSource = 'user' | 'public';
export type LibraryRecipeFamily = 'arrangement' | 'rhythm';

export interface LibraryRecipeStep {
  id: string;
  label: string;
  cycles: number;
  instruction: string;
}

export interface LibraryRecipe {
  family: LibraryRecipeFamily;
  notation: string;
  summary: string;
  steps: LibraryRecipeStep[];
}

interface LibraryAssetBase {
  kind: typeof LIBRARY_ASSET_KIND;
  version: typeof LIBRARY_ASSET_VERSION;
  id: string;
  name: string;
  description: string;
  tags: string[];
  source: LibraryAssetSource;
  createdAt: string;
  updatedAt: string;
}

export interface LibraryPadAsset extends LibraryAssetBase {
  type: 'pad';
  capability: 'playable';
  payload: { pad: QuadLilyPad };
}

export interface LibraryWorkspaceAsset extends LibraryAssetBase {
  type: 'workspace';
  capability: 'playable';
  payload: { workspace: QuadLilyWorkspace };
}

export interface LibraryRecipeAsset extends LibraryAssetBase {
  type: 'recipe';
  capability: 'recipe';
  payload: { recipe: LibraryRecipe };
}

export type PlayableLibraryAsset = LibraryPadAsset | LibraryWorkspaceAsset;
export type LibraryAsset = PlayableLibraryAsset | LibraryRecipeAsset;

export interface LibraryAssetMetadataInput {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  now?: string;
}

export interface CreateUserPadAssetInput extends LibraryAssetMetadataInput {
  pad: QuadLilyPad;
}

export interface CreateUserWorkspaceAssetInput extends LibraryAssetMetadataInput {
  workspace: QuadLilyWorkspace;
}

export interface CreatePublicRecipeAssetInput extends LibraryAssetMetadataInput {
  recipe: LibraryRecipe;
}

/**
 * Parse one complete Library document at the trust boundary. Library documents
 * intentionally cross that boundary as JSON text so the UTF-8 size guard is
 * always applied before JSON decoding.
 */
export function parseLibraryAsset(value: unknown): LibraryAsset | null {
  if (typeof value !== 'string' || utf8ByteLength(value) > LIBRARY_ASSET_MAX_BYTES) return null;

  let decoded: unknown;
  try {
    decoded = JSON.parse(value) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(decoded) || !hasValidBaseWrapper(decoded)) return null;

  if (decoded.type === 'pad' && decoded.capability === 'playable') {
    return parsePadAsset(decoded);
  }
  if (decoded.type === 'workspace' && decoded.capability === 'playable') {
    return parseWorkspaceAsset(decoded);
  }
  if (decoded.type === 'recipe' && decoded.capability === 'recipe') {
    return parseRecipeAsset(decoded);
  }
  return null;
}

export function serializeLibraryAsset(asset: LibraryAsset): string {
  let serialized: string;
  try {
    serialized = JSON.stringify(asset);
  } catch {
    throw new TypeError('Expected a valid Library asset.');
  }
  const normalized = parseLibraryAsset(serialized);
  if (!normalized) throw new TypeError('Expected a valid Library asset.');
  return JSON.stringify(normalized);
}

export function createUserPadAsset(input: CreateUserPadAssetInput): LibraryPadAsset {
  return createPadAsset(input, 'user');
}

export function createPublicPadAsset(input: CreateUserPadAssetInput): LibraryPadAsset {
  return createPadAsset(input, 'public');
}

export function createUserWorkspaceAsset(
  input: CreateUserWorkspaceAssetInput,
): LibraryWorkspaceAsset {
  return createWorkspaceAsset(input, 'user');
}

export function createPublicWorkspaceAsset(
  input: CreateUserWorkspaceAssetInput,
): LibraryWorkspaceAsset {
  return createWorkspaceAsset(input, 'public');
}

export function createPublicRecipeAsset(
  input: CreatePublicRecipeAssetInput,
): LibraryRecipeAsset {
  const timestamp = normalizeInputTimestamp(input.now);
  return requireAssetType({
    ...createBaseAsset(input, 'public', timestamp),
    type: 'recipe',
    capability: 'recipe',
    payload: { recipe: input.recipe },
  }, 'recipe');
}

export function isPlayableLibraryAsset(asset: LibraryAsset): asset is PlayableLibraryAsset {
  return asset.capability === 'playable' && (asset.type === 'pad' || asset.type === 'workspace');
}

export function loadPadAssetIntoWorkspace(
  workspace: QuadLilyWorkspace,
  asset: LibraryPadAsset,
  targetPadId: QuadPadId,
): QuadLilyWorkspace {
  if (!QUAD_PAD_IDS.includes(targetPadId)) throw new TypeError('Expected a valid target Pad.');
  const normalizedAsset = requireAssetType(asset, 'pad');
  const normalizedWorkspace = parseQuadLilyWorkspace(JSON.stringify(workspace));
  const pad = clonePadForTarget(normalizedAsset.payload.pad, targetPadId, true);
  return {
    ...normalizedWorkspace,
    pads: {
      ...normalizedWorkspace.pads,
      [targetPadId]: pad,
    },
  };
}

export function loadWorkspaceAsset(asset: LibraryWorkspaceAsset): QuadLilyWorkspace {
  const normalizedAsset = requireAssetType(asset, 'workspace');
  const workspace = parseQuadLilyWorkspace(JSON.stringify(normalizedAsset.payload.workspace));
  return stopWorkspace(workspace);
}

function createPadAsset(
  input: CreateUserPadAssetInput,
  source: LibraryAssetSource,
): LibraryPadAsset {
  const timestamp = normalizeInputTimestamp(input.now);
  return requireAssetType({
    ...createBaseAsset(input, source, timestamp),
    type: 'pad',
    capability: 'playable',
    payload: { pad: input.pad },
  }, 'pad');
}

function createWorkspaceAsset(
  input: CreateUserWorkspaceAssetInput,
  source: LibraryAssetSource,
): LibraryWorkspaceAsset {
  const timestamp = normalizeInputTimestamp(input.now);
  return requireAssetType({
    ...createBaseAsset(input, source, timestamp),
    type: 'workspace',
    capability: 'playable',
    payload: { workspace: input.workspace },
  }, 'workspace');
}

function createBaseAsset(
  input: LibraryAssetMetadataInput,
  source: LibraryAssetSource,
  timestamp: string,
): LibraryAssetBase {
  return {
    kind: LIBRARY_ASSET_KIND,
    version: LIBRARY_ASSET_VERSION,
    id: input.id.trim(),
    name: input.name.trim(),
    description: input.description?.trim() ?? '',
    tags: normalizeInputTags(input.tags),
    source,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function requireAssetType<T extends LibraryAssetType>(
  asset: unknown,
  type: T,
): Extract<LibraryAsset, { type: T }> {
  let serialized: string;
  try {
    serialized = JSON.stringify(asset);
  } catch {
    throw new TypeError(type === 'pad'
      ? 'Expected a playable Pad asset.'
      : type === 'workspace'
        ? 'Expected a playable Workspace asset.'
        : 'Expected a valid Library recipe.');
  }
  const parsed = parseLibraryAsset(serialized);
  if (!parsed || parsed.type !== type) {
    throw new TypeError(type === 'pad'
      ? 'Expected a playable Pad asset.'
      : type === 'workspace'
        ? 'Expected a playable Workspace asset.'
        : 'Expected a valid Library recipe.');
  }
  return parsed as Extract<LibraryAsset, { type: T }>;
}

function parsePadAsset(value: Record<string, unknown>): LibraryPadAsset | null {
  if (!isRecord(value.payload) || !isValidRawPad(value.payload.pad)) return null;
  const defaults = createQuadLilyWorkspace();
  const normalized = parseQuadLilyWorkspace(JSON.stringify({
    ...defaults,
    pads: { ...defaults.pads, A: value.payload.pad },
  }));
  return {
    ...readBaseAsset(value),
    type: 'pad',
    capability: 'playable',
    payload: { pad: clonePadForTarget(normalized.pads.A, readPadId(value.payload.pad)) },
  };
}

function parseWorkspaceAsset(value: Record<string, unknown>): LibraryWorkspaceAsset | null {
  if (!isRecord(value.payload) || !isValidRawWorkspace(value.payload.workspace)) return null;
  const workspace = parseQuadLilyWorkspace(JSON.stringify(value.payload.workspace));
  return {
    ...readBaseAsset(value),
    type: 'workspace',
    capability: 'playable',
    payload: { workspace },
  };
}

function parseRecipeAsset(value: Record<string, unknown>): LibraryRecipeAsset | null {
  if (!isRecord(value.payload)) return null;
  const recipe = parseRecipe(value.payload.recipe);
  if (!recipe) return null;
  return {
    ...readBaseAsset(value),
    type: 'recipe',
    capability: 'recipe',
    payload: { recipe },
  };
}

function readBaseAsset(value: Record<string, unknown>): LibraryAssetBase {
  return {
    kind: LIBRARY_ASSET_KIND,
    version: LIBRARY_ASSET_VERSION,
    id: value.id as string,
    name: value.name as string,
    description: value.description as string,
    tags: [...value.tags as string[]],
    source: value.source as LibraryAssetSource,
    createdAt: value.createdAt as string,
    updatedAt: value.updatedAt as string,
  };
}

function hasValidBaseWrapper(value: Record<string, unknown>): boolean {
  return value.kind === LIBRARY_ASSET_KIND
    && value.version === LIBRARY_ASSET_VERSION
    && isLibraryId(value.id)
    && isTrimmedText(value.name, 1, 120)
    && isTrimmedText(value.description, 0, 8_192)
    && isTagList(value.tags)
    && (value.source === 'user' || value.source === 'public')
    && isIsoTimestamp(value.createdAt)
    && isIsoTimestamp(value.updatedAt);
}

function isValidRawWorkspace(value: unknown): value is QuadLilyWorkspace {
  if (!isRecord(value)
    || value.kind !== 'gemidi.quad-lily-workspace'
    || value.version !== 1
    || !isRecord(value.pads)
    || typeof value.masterPlaying !== 'boolean'
    || !isTone(value.fm1Tone)) return false;
  const keys = Object.keys(value.pads).sort();
  if (keys.length !== QUAD_PAD_IDS.length
    || !QUAD_PAD_IDS.every(padId => keys.includes(padId))) return false;
  if (!QUAD_PAD_IDS.every(padId => isValidRawPad(value.pads[padId]))) return false;
  const nodeCount = QUAD_PAD_IDS.reduce(
    (total, padId) => total + (value.pads[padId] as { nodes: unknown[] }).nodes.length,
    0,
  );
  return nodeCount <= LIBRARY_MAX_WORKSPACE_NODES;
}

function isValidRawPad(value: unknown): value is QuadLilyPad {
  if (!isRecord(value)
    || !QUAD_PAD_IDS.includes(value.id as QuadPadId)
    || !Array.isArray(value.nodes)
    || value.nodes.length < 1
    || value.nodes.length > LIBRARY_MAX_NODES_PER_PAD
    || !Number.isFinite(value.intervalMs)
    || typeof value.playing !== 'boolean'
    || typeof value.loop !== 'boolean'
    || typeof value.locked !== 'boolean'
    || !Number.isFinite(value.velocity)
    || !isTone(value.rememberedTone)
    || !Number.isInteger(value.rootMidi)
    || !PLAYABLE_SCALE_KEYS.has(value.scaleKey as string)
    || !Number.isInteger(value.octaveTranspose)) return false;

  const ids = new Set<string>();
  let centerCount = 0;
  for (const node of value.nodes) {
    if (!isRecord(node)
      || !isTrimmedText(node.id, 1, 96)
      || ids.has(node.id as string)
      || !Number.isFinite(node.x)
      || !Number.isFinite(node.y)
      || !Number.isFinite(node.range)
      || !Number.isInteger(node.scaleStep)
      || typeof node.isCenter !== 'boolean') return false;
    ids.add(node.id as string);
    if (node.isCenter) centerCount += 1;
  }
  return centerCount === 1;
}

function parseRecipe(value: unknown): LibraryRecipe | null {
  if (!isRecord(value)
    || (value.family !== 'arrangement' && value.family !== 'rhythm')
    || !isTrimmedText(value.notation, 1, 120)
    || !isTrimmedText(value.summary, 1, 2_000)
    || !Array.isArray(value.steps)
    || value.steps.length < 1
    || value.steps.length > 32) return null;

  const steps: LibraryRecipeStep[] = [];
  for (const step of value.steps) {
    if (!isRecord(step)
      || !isTrimmedText(step.id, 1, 64)
      || !isTrimmedText(step.label, 1, 120)
      || !Number.isInteger(step.cycles)
      || (step.cycles as number) < 1
      || (step.cycles as number) > 64
      || !isTrimmedText(step.instruction, 1, 1_000)) return null;
    steps.push({
      id: step.id as string,
      label: step.label as string,
      cycles: step.cycles as number,
      instruction: step.instruction as string,
    });
  }
  return {
    family: value.family,
    notation: value.notation as string,
    summary: value.summary as string,
    steps,
  };
}

function clonePadForTarget(
  pad: QuadLilyPad,
  targetPadId: QuadPadId,
  stopPlayback = false,
): QuadLilyPad {
  const defaults = createQuadLilyWorkspace();
  const normalized = parseQuadLilyWorkspace(JSON.stringify({
    ...defaults,
    pads: { ...defaults.pads, [targetPadId]: { ...pad, id: targetPadId } },
  }));
  return {
    ...normalized.pads[targetPadId],
    id: targetPadId,
    ...(stopPlayback ? { playing: false } : {}),
  };
}

function stopWorkspace(workspace: QuadLilyWorkspace): QuadLilyWorkspace {
  return {
    ...workspace,
    masterPlaying: false,
    pads: Object.fromEntries(QUAD_PAD_IDS.map(padId => [
      padId,
      { ...workspace.pads[padId], playing: false },
    ])) as QuadLilyWorkspace['pads'],
  };
}

function readPadId(value: unknown): QuadPadId {
  return isRecord(value) && QUAD_PAD_IDS.includes(value.id as QuadPadId)
    ? value.id as QuadPadId
    : 'A';
}

function normalizeInputTimestamp(value: string | undefined): string {
  const timestamp = value ?? new Date().toISOString();
  if (!isIsoTimestamp(timestamp)) throw new TypeError('Expected an ISO Library timestamp.');
  return timestamp;
}

function normalizeInputTags(tags: string[] | undefined): string[] {
  return [...new Set((tags ?? []).map(tag => tag.trim()).filter(Boolean))];
}

function isLibraryId(value: unknown): value is string {
  return typeof value === 'string' && LIBRARY_ID_PATTERN.test(value);
}

function isTrimmedText(value: unknown, min: number, max: number): value is string {
  return typeof value === 'string'
    && value.length >= min
    && value.length <= max
    && value === value.trim();
}

function isTagList(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length <= 32
    && value.every(tag => isTrimmedText(tag, 1, 48))
    && new Set(value).size === value.length;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function isTone(value: unknown): boolean {
  return value === 'follow' || (Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 127);
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
