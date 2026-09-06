import assert from 'node:assert/strict';
import test from 'node:test';

import { compileLilyCycle, QUAD_PAD_IDS } from '../quad/core.ts';
import { isPlayableLibraryAsset, parseLibraryAsset, serializeLibraryAsset } from '../quad/library/core.ts';
import {
  PUBLIC_LIBRARY_TEMPLATES,
  PUBLIC_PAD_TEMPLATES,
  PUBLIC_RECIPE_TEMPLATES,
  PUBLIC_WORKSPACE_TEMPLATES,
} from '../quad/library/templates.ts';

test('ships at least five playable Lily Pad templates and two playable four-Pad scenes', () => {
  assert.ok(PUBLIC_PAD_TEMPLATES.length >= 5);
  assert.ok(PUBLIC_WORKSPACE_TEMPLATES.length >= 2);
  assert.ok(PUBLIC_PAD_TEMPLATES.every(asset => asset.type === 'pad' && isPlayableLibraryAsset(asset)));
  assert.ok(PUBLIC_WORKSPACE_TEMPLATES.every(asset => asset.type === 'workspace' && isPlayableLibraryAsset(asset)));

  PUBLIC_PAD_TEMPLATES.forEach((asset) => {
    assert.ok(compileLilyCycle(asset.payload.pad).events.length >= 2, `${asset.id} must produce a phrase`);
  });
  PUBLIC_WORKSPACE_TEMPLATES.forEach((asset) => {
    QUAD_PAD_IDS.forEach((padId) => {
      assert.ok(
        compileLilyCycle(asset.payload.workspace.pads[padId]).events.length >= 1,
        `${asset.id}/${padId} must remain playable`,
      );
    });
  });
});

test('public templates are unique strict Library documents with Pad/Workspace preview payloads', () => {
  const ids = PUBLIC_LIBRARY_TEMPLATES.map(asset => asset.id);
  assert.equal(new Set(ids).size, ids.length);

  PUBLIC_LIBRARY_TEMPLATES.forEach((asset) => {
    assert.deepEqual(parseLibraryAsset(serializeLibraryAsset(asset)), asset);
    if (asset.type === 'pad') assert.ok(asset.payload.pad.nodes.length > 0);
    if (asset.type === 'workspace') assert.equal(Object.keys(asset.payload.workspace.pads).length, 4);
  });
});

test('four-Pad templates keep their documented cycle ratios inside the executable interval range', () => {
  const phaseStaircase = PUBLIC_WORKSPACE_TEMPLATES.find(
    asset => asset.id === 'playbook-phase-staircase-quad',
  );
  const anchorShadow = PUBLIC_WORKSPACE_TEMPLATES.find(
    asset => asset.id === 'playbook-anchor-shadow-quad',
  );

  assert.ok(phaseStaircase);
  assert.ok(anchorShadow);
  assert.deepEqual(
    QUAD_PAD_IDS.map(id => phaseStaircase.payload.workspace.pads[id].intervalMs),
    [500, 750, 1_000, 1_500],
  );
  assert.deepEqual(
    QUAD_PAD_IDS.map(id => anchorShadow.payload.workspace.pads[id].intervalMs),
    [500, 500, 1_000, 1_500],
  );
});

test('ships a compact recipe catalog spanning form, dialogue, energy, and groove', () => {
  assert.ok(PUBLIC_RECIPE_TEMPLATES.length >= 6);

  const recipeIds = PUBLIC_RECIPE_TEMPLATES.map(asset => asset.id);
  assert.equal(new Set(recipeIds).size, recipeIds.length);

  const notations = new Set(PUBLIC_RECIPE_TEMPLATES.map(asset => asset.payload.recipe.notation));
  assert.ok(notations.has('A B A C'));
  assert.ok(notations.has('A A B A'));
  assert.ok(notations.has('CALL → SPACE → RESPONSE → VARIATION'));
  assert.ok(notations.has('BASE → BUILD → BREATH → DROP → RELEASE'));
  assert.ok(notations.has('X . . X . . X .'));
  assert.ok(notations.has('K: X X X X · S: . X . X · H: x x x x x x x x'));

  const families = new Set(PUBLIC_RECIPE_TEMPLATES.map(asset => asset.payload.recipe.family));
  assert.deepEqual(families, new Set(['arrangement', 'rhythm']));
});

test('every public recipe has valid unique steps and remains explicitly non-loadable', () => {
  assert.ok(PUBLIC_RECIPE_TEMPLATES.every(asset => (
    asset.type === 'recipe'
    && asset.capability === 'recipe'
    && !isPlayableLibraryAsset(asset)
  )));

  PUBLIC_RECIPE_TEMPLATES.forEach((asset) => {
    const recipe = asset.payload.recipe;
    assert.ok(recipe.summary.trim().length > 0, `${asset.id} needs a summary`);
    assert.ok(recipe.steps.length >= 2, `${asset.id} needs at least two steps`);

    const stepIds = recipe.steps.map(step => step.id);
    assert.equal(new Set(stepIds).size, stepIds.length, `${asset.id} step ids must be unique`);
    recipe.steps.forEach((step) => {
      assert.ok(step.label.trim().length > 0, `${asset.id}/${step.id} needs a label`);
      assert.ok(Number.isInteger(step.cycles) && step.cycles >= 1 && step.cycles <= 64);
      assert.ok(step.instruction.trim().length > 0, `${asset.id}/${step.id} needs an instruction`);
    });
  });
});
