import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveQuadLilySurface } from '../quad/route.ts';

test('every historical route resolves to the sole Quad Lily surface', () => {
  for (const pathname of ['/', '/desk', '/desk/', '/lab', '/desk/legacy', '/cycle-visuals', '/anything']) {
    assert.equal(resolveQuadLilySurface(pathname), 'quad-lily');
  }
});
