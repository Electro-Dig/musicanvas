import assert from 'node:assert/strict';
import test from 'node:test';

import {
  allocateFormationId,
  buildBatchIndividualMotions,
  createNoteFormation,
  detachNodesFromFormations,
  findFormationForNode,
  formationToEditorMotion,
  moveGroupOrderItem,
  resolveFormationNodePosition,
  resolveGroupSelectionClick,
  upsertFormation,
} from '../quad/groupMotion.ts';
import type { LilyNode } from '../quad/core.ts';

function node(id: string, x: number, y: number): LilyNode {
  return {
    id,
    x,
    y,
    range: 0.2,
    scaleStep: 0,
    isCenter: id === 'center',
  };
}

test('Ctrl 点选按顺序加入，再次点击移除，至少保留一个', () => {
  assert.deepEqual(resolveGroupSelectionClick([], 'a', false), ['a']);
  assert.deepEqual(resolveGroupSelectionClick(['a'], 'b', true), ['a', 'b']);
  assert.deepEqual(resolveGroupSelectionClick(['a', 'b'], 'a', true), ['b']);
  assert.deepEqual(resolveGroupSelectionClick(['a'], 'a', true), ['a']);
});

test('组合顺序可上移下移', () => {
  assert.deepEqual(moveGroupOrderItem(['a', 'b', 'c'], 'c', -1), ['a', 'c', 'b']);
  assert.deepEqual(moveGroupOrderItem(['a', 'b', 'c'], 'a', -1), ['a', 'b', 'c']);
  assert.deepEqual(moveGroupOrderItem(['a', 'b', 'c'], 'a', 1), ['b', 'a', 'c']);
});

test('批量各自运动：均匀相位；闪烁共用首点偏移', () => {
  const nodes = [node('a', 0.2, 0.5), node('b', 0.5, 0.5), node('c', 0.8, 0.5)];
  const orbit = buildBatchIndividualMotions(nodes, 'orbit', 4);
  assert.equal(orbit.length, 3);
  assert.equal(orbit[0].motion.mode, 'orbit');
  if (orbit[0].motion.mode !== 'orbit' || orbit[1].motion.mode !== 'orbit' || orbit[2].motion.mode !== 'orbit') return;
  assert.equal(orbit[0].motion.phaseOffset, 0);
  assert.equal(orbit[1].motion.phaseOffset, 1 / 3);
  assert.equal(orbit[2].motion.phaseOffset, 2 / 3);

  const flash = buildBatchIndividualMotions(nodes, 'flash', 2, { targetDx: 0.15, targetDy: -0.1 });
  assert.equal(flash[0].motion.mode, 'flash');
  if (flash[0].motion.mode !== 'flash' || flash[2].motion.mode !== 'flash') return;
  assert.equal(flash[0].motion.targetDx, 0.15);
  assert.equal(flash[2].motion.targetDx, 0.15);
  assert.equal(flash[2].motion.targetDy, -0.1);
});

test('共享编队圆形：成员均匀分布在同一圆上并共转', () => {
  const nodes = [node('a', 0.4, 0.5), node('b', 0.5, 0.4), node('c', 0.6, 0.5)];
  const formation = createNoteFormation(nodes, 'circle', 2);
  assert.ok(formation);
  assert.equal(formation!.id, 'G1');
  assert.equal(formation!.shape, 'circle');
  assert.equal(formation!.nodeIds.length, 3);

  const p0 = resolveFormationNodePosition(formation!, 0, 0);
  const p1 = resolveFormationNodePosition(formation!, 1, 0);
  const dist0 = Math.hypot(p0.x - formation!.centerX, p0.y - formation!.centerY);
  const dist1 = Math.hypot(p1.x - formation!.centerX, p1.y - formation!.centerY);
  assert.ok(Math.abs(dist0 - formation!.radius) < 1e-9);
  assert.ok(Math.abs(dist1 - formation!.radius) < 1e-9);

  const editor = formationToEditorMotion(formation!);
  assert.equal(editor.mode, 'orbit');
  if (editor.mode === 'orbit') {
    assert.equal(editor.amount, formation!.radius);
    assert.equal(editor.rateCycles, 2);
  }
});

test('多编队：id 递增、成员互斥、upsert', () => {
  const a = createNoteFormation([node('a', 0.2, 0.5), node('b', 0.4, 0.5)], 'circle', 2, { id: 'G1' })!;
  const b = createNoteFormation([node('c', 0.6, 0.5), node('d', 0.8, 0.5)], 'line', 4, {
    id: allocateFormationId([a]),
  })!;
  assert.equal(b.id, 'G2');

  let list = upsertFormation([], a);
  list = upsertFormation(list, b);
  assert.equal(list.length, 2);

  // 把 b 的节点塞进新编队时，旧编队应被剥离至删除
  const steal = createNoteFormation([node('c', 0.6, 0.5), node('e', 0.7, 0.4)], 'circle', 2, {
    id: allocateFormationId(list),
  })!;
  assert.equal(steal.id, 'G3');
  list = upsertFormation(list, steal);
  assert.equal(list.some((item) => item.id === 'G2'), false);
  assert.equal(list.some((item) => item.id === 'G3'), true);
  assert.equal(findFormationForNode(list, 'c')?.formation.id, 'G3');

  list = detachNodesFromFormations(list, ['a']);
  assert.equal(list.some((item) => item.id === 'G1'), false);
});
