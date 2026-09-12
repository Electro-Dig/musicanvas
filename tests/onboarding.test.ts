import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));

test('the onboarding teaches the complete five-step creation path', async () => {
  const vite = await createServer({
    root: projectRoot,
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });

  try {
    const tour = await vite.ssrLoadModule('/quad/onboarding/OnboardingTour.tsx');
    const steps = tour.ONBOARDING_STEPS as Array<{
      scene: string;
    }> | undefined;

    assert.ok(steps, 'onboarding steps must be exposed as a single product contract');
    assert.equal(steps.length, 5);
    assert.deepEqual(
      steps.map((step) => step.scene),
      ['start', 'notes', 'motion', 'groups', 'library'],
    );
    assert.equal(tour.ONBOARDING_STORAGE_KEY, 'gemidi.quad-lily.onboarding.v5');
  } finally {
    await vite.close();
  }
});

test('each onboarding scene renders three bilingual vector cards', async () => {
  const vite = await createServer({
    root: projectRoot,
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });

  try {
    const tour = await vite.ssrLoadModule('/quad/onboarding/OnboardingTour.tsx');
    const demo = await vite.ssrLoadModule('/quad/onboarding/OnboardingDemo.tsx');
    const steps = tour.ONBOARDING_STEPS as Array<{
      scene: string;
    }>;

    for (const step of steps) {
      for (const locale of ['zh', 'en']) {
        const markup = renderToStaticMarkup(React.createElement(demo.OnboardingDemo, {
          scene: step.scene, locale,
        }));
        assert.match(markup, new RegExp(`data-scene="${step.scene}"`));
        assert.match(markup, /data-ui-source="illustrated-guide"/);
        assert.equal((markup.match(/<section/g) ?? []).length, 3);
        assert.equal((markup.match(/viewBox="0 0 220 130"/g) ?? []).length, 3);
        assert.doesNotMatch(markup, /<img/);
        assert.match(markup, new RegExp(`lang="${locale === 'zh' ? 'zh-CN' : 'en'}"`));
        if (locale === 'en') assert.doesNotMatch(markup, /[\u4e00-\u9fff]/);
        else assert.match(markup, /[\u4e00-\u9fff]/);
      }
    }

  } finally {
    await vite.close();
  }
});

test('the review URL can replay onboarding without clearing saved browser state', async () => {
  const vite = await createServer({
    root: projectRoot,
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });

  try {
    const tour = await vite.ssrLoadModule('/quad/onboarding/OnboardingTour.tsx');
    const resolveVisibility = tour.resolveOnboardingVisibility as
      | ((storedValue: string | null, search: string) => boolean)
      | undefined;

    assert.ok(resolveVisibility, 'onboarding must expose a deterministic replay rule');
    assert.equal(resolveVisibility('done', '?onboarding=1'), true);
    assert.equal(resolveVisibility(null, '?onboarding=0'), false);
    assert.equal(resolveVisibility('done', ''), false);
    assert.equal(resolveVisibility(null, ''), true);
    assert.equal(tour.resolveInitialOnboardingStep('?onboarding=1&onboardingStep=3'), 2);
    assert.equal(tour.resolveInitialOnboardingStep('?onboardingStep=99'), 4);
    assert.equal(tour.resolveInitialOnboardingStep(''), 0);
  } finally {
    await vite.close();
  }
});

test('the screenshot capture fixture uses real workspace data without touching user storage', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const fixture = await vite.ssrLoadModule('/quad/onboarding/guideFixture.ts');
    const notesWorkspace = fixture.createOnboardingGuideWorkspace('notes');
    const groupWorkspace = fixture.createOnboardingGuideWorkspace('groups');
    assert.equal(notesWorkspace.pads.A.nodes.length, 5);
    assert.equal(notesWorkspace.pads.A.formations.length, 0);
    assert.equal(groupWorkspace.pads.A.formations[0].id, 'G1');
    assert.equal(fixture.getOnboardingGuideCaptureMode('?guide=motion'), 'motion');
    assert.equal(fixture.isOnboardingGuideCapture('?onboarding=0&guide=groups'), true);
    assert.equal(fixture.isOnboardingGuideCapture('?onboarding=0'), false);
  } finally {
    await vite.close();
  }
});
