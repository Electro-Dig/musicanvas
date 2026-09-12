import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { UI_MESSAGES } from '../quad/uiMessages.ts';
import { translateUi } from '../quad/uiTranslation.ts';
import { sequenceChanges } from '../quad/sequenceModel.ts';

test('desk English dictionary covers UI calls and preserves every placeholder', () => {
  const issues: string[] = [];
  const tokens = (s: string) => [...s.matchAll(/\{\d+\}/g)].map(m => m[0]).sort();
  for (const [zh, en] of Object.entries(UI_MESSAGES)) {
    assert.ok(!/[\u3400-\u9fff]/.test(en), `Chinese remains in English entry: ${zh}`);
    assert.deepEqual(tokens(en), tokens(zh), `Placeholder mismatch: ${zh}`);
  }
  function scan(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'onboarding') scan(path); continue; }
      if (!path.endsWith('.tsx')) continue;
      const sf = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function visit(node: ts.Node) {
        if (ts.isCallExpression(node) && node.expression.getText(sf) === 'tr' && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
          const key = node.arguments[0].text;
          if (/[\u3400-\u9fff]/.test(key) && !UI_MESSAGES[key]) issues.push(`${path}: ${key}`);
        }
        if (ts.isJsxText(node) && /[\u3400-\u9fff]/.test(node.text) && node.text.trim() !== '中') issues.push(`${path}: unlocalized visible text ${node.text.trim()}`);
        ts.forEachChild(node, visit);
      }
      visit(sf);
    }
  }
  scan('quad');
  assert.deepEqual(issues, []);
});

test('locale interpolation leaves user names untouched and supports repeated switching', () => {
  const name = '我的作品 {1} · C4';
  assert.equal(translateUi('en', '选择 {0}', name), `Select ${name}`);
  assert.equal(translateUi('zh', '选择 {0}', name), `选择 ${name}`);
  assert.equal(translateUi('en', '选择 {0}', name), `Select ${name}`);
  assert.equal(translateUi('en', '不是应用文案的用户作品'), '不是应用文案的用户作品');
  assert.equal(translateUi('en', '完整循环超过 128 轮，请缩短运动周期后查看全图。'), 'The complete loop exceeds 128 cycles. Shorten motion cycles to view the atlas.');
});

test('live sequence changes report timing and exits in the selected language without changing data', () => {
  const hit = {nodeId:'a', midi:60, name:'C4', step:2, muted:false};
  const previous = {cycle:0, steps:8, hits:[hit], played:['a']};
  const current = {cycle:1, steps:8, hits:[{...hit, step:1}], played:[]};
  const before = JSON.stringify({previous,current});
  const en = (message: string, ...values: unknown[]) => translateUi('en', message, ...values);
  assert.deepEqual(sequenceChanges(current, previous, en), ['C4 moved earlier (1-step shift)']);
  assert.deepEqual(sequenceChanges(current, previous), ['C4 提前 1 步']);
  assert.deepEqual(sequenceChanges({...current,hits:[]}, previous, en), ['C4 removed']);
  assert.equal(JSON.stringify({previous,current}), before);
});
