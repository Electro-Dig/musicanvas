import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { CANON_STUDIES, loadCanonStudy } from '../quad/library/studies.ts';
import { parseLibraryAsset } from '../quad/library/core.ts';
import { compileLilyCycle, QUAD_PAD_IDS } from '../quad/core.ts';
import { sequenceRound } from '../quad/sequenceModel.ts';

const read = (file: string) => readFileSync(new URL(`../public/studies/${file}`, import.meta.url), 'utf8');

test('all three discoverable Canon studies preserve the original 48-second score and load paused', async () => {
  const original = parseLibraryAsset(read('canon-opening-16-bars.musicanvas.json'));
  assert(original?.type === 'workspace');
  for (const study of CANON_STUDIES) {
    const asset = await loadCanonStudy(study.id, undefined, (async (url: string) =>
      new Response(read(url.split('/').pop()!))) as typeof fetch);
    assert.equal(asset.source, 'public');
    assert.equal(asset.payload.workspace.masterPlaying, false);
    for (const id of QUAD_PAD_IDS) {
      const pad = asset.payload.workspace.pads[id], before = original.payload.workspace.pads[id];
      const cycle = compileLilyCycle(pad), expected = compileLilyCycle(before);
      assert.equal(cycle.intervalMs, 48000);
      assert.equal(pad.playing, false);
      const music = (p: typeof pad, c: typeof cycle) => ({
        hits: sequenceRound(0, c, p).hits.map(({ step, midi, muted }) => ({ step, midi, muted })),
        duration: c.events.map(e => p.nodes.find(n => n.id === e.nodeId)?.holdSteps ?? 1),
      });
      assert.deepEqual(music(pad, cycle), music(before, expected), `${study.id} / ${id}`);
    }
    assert.match(read(`canon-${study.id}.svg`), /<svg/);
  }
});

test('study loading rejects server errors and invalid payloads and forwards cancellation', async () => {
  await assert.rejects(loadCanonStudy('leaf', undefined, (async () => new Response('', { status: 503 })) as typeof fetch), /读取失败/);
  await assert.rejects(loadCanonStudy('leaf', undefined, (async () => new Response('<html>fallback</html>')) as typeof fetch), /格式无效/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(loadCanonStudy('leaf', controller.signal, (async (_, init) => {
    assert.equal(init?.signal, controller.signal);
    init?.signal?.throwIfAborted();
    return new Response('');
  }) as typeof fetch), { name: 'AbortError' });
});
