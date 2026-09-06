import { createQuadLilyWorkspace, type QuadLilyWorkspace } from '../core.ts';

export type OnboardingGuideCaptureMode = 'start' | 'notes' | 'motion' | 'groups' | 'library';

/** Deterministic workspace used only to capture truthful onboarding screenshots. */
export function createOnboardingGuideWorkspace(mode: OnboardingGuideCaptureMode = 'groups'): QuadLilyWorkspace {
  const workspace = createQuadLilyWorkspace();
  const hasMotion = mode === 'motion' || mode === 'groups' || mode === 'library';
  const hasFormation = mode === 'groups' || mode === 'library';
  return {
    ...workspace,
    pads: {
      ...workspace.pads,
      A: {
        ...workspace.pads.A,
        nodes: [
          { id: 'center', x: .5, y: .5, range: .24, scaleStep: 0, isCenter: true },
          { id: 'guide-n1', x: .36, y: .34, range: .19, scaleStep: 2, isCenter: false, ...(hasMotion ? { motion: { mode: 'orbit' as const, amount: .07, rateCycles: 4 } } : {}) },
          { id: 'guide-n2', x: .63, y: .38, range: .18, scaleStep: 4, isCenter: false, ...(hasMotion ? { motion: { mode: 'pendulum' as const, amount: .08, angleDegrees: 15, rateCycles: 4 } } : {}) },
          { id: 'guide-n3', x: .67, y: .66, range: .18, scaleStep: 6, isCenter: false, ...(hasMotion ? { motion: { mode: 'flash' as const, targetDx: -.1, targetDy: -.06, rateCycles: 4 } } : {}) },
          { id: 'guide-n4', x: .4, y: .72, range: .18, scaleStep: 7, isCenter: false, ...(hasMotion ? { motion: { mode: 'draw' as const, rateCycles: 4, path: [{ phase: 0, dx: 0, dy: 0 }, { phase: .5, dx: .08, dy: -.07 }, { phase: 1, dx: 0, dy: 0 }] } } : {}) },
        ],
        formations: hasFormation ? [{
          id: 'G1',
          nodeIds: ['guide-n1', 'guide-n2', 'guide-n3'],
          shape: 'circle',
          centerX: .52,
          centerY: .47,
          radius: .16,
          rateCycles: 4,
        }] : [],
      },
    },
  };
}

export function getOnboardingGuideCaptureMode(search?: string): OnboardingGuideCaptureMode | null {
  if (typeof window === 'undefined' && search === undefined) return null;
  const value = new URLSearchParams(search ?? window.location.search).get('guide');
  return value === 'start' || value === 'notes' || value === 'motion' || value === 'groups' || value === 'library'
    ? value
    : null;
}

export function isOnboardingGuideCapture(search?: string): boolean {
  return getOnboardingGuideCaptureMode(search) !== null;
}
