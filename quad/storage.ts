import {
  parseQuadLilyWorkspace,
  QUAD_PAD_IDS,
  type QuadLilyWorkspace,
} from './core.ts';

export const QUAD_LILY_STORAGE_KEY = 'gemidi.quad-lily-workspace.v1';

export function restoreQuadLilySession(value: unknown): QuadLilyWorkspace {
  const workspace = parseQuadLilyWorkspace(value);
  return {
    ...workspace,
    masterPlaying: false,
    pads: Object.fromEntries(QUAD_PAD_IDS.map(padId => [
      padId,
      { ...workspace.pads[padId], playing: false },
    ])) as QuadLilyWorkspace['pads'],
  };
}

export function serializeQuadLilySession(workspace: QuadLilyWorkspace): string {
  return JSON.stringify(parseQuadLilyWorkspace(JSON.stringify(workspace)));
}
