import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PASSWORD_MIN_LENGTH,
  validateSignupPassword,
} from '../quad/auth/passwordPolicy.ts';

test('rejects passwords shorter than the minimum length', () => {
  assert.match(validateSignupPassword('Ab1') ?? '', /密码至少需要 8 位/);
  assert.match(validateSignupPassword('Abcde12') ?? '', /密码至少需要 8 位/);
});

test('requires at least one letter and one number', () => {
  assert.match(validateSignupPassword('12345678') ?? '', /密码至少需要包含一个字母/);
  assert.match(validateSignupPassword('abcdefgh') ?? '', /密码至少需要包含一个数字/);
  assert.match(validateSignupPassword('ABCDEFGH') ?? '', /密码至少需要包含一个数字/);
});

test('accepts a password that meets the baseline policy', () => {
  assert.equal(validateSignupPassword('Secret12'), null);
  assert.equal(validateSignupPassword('a1' + 'x'.repeat(PASSWORD_MIN_LENGTH - 2)), null);
});
