/**
 * 注册密码最低要求（前端强制；登录不限制，兼容已有弱密码账户）。
 * - 至少 8 位
 * - 至少包含一个字母
 * - 至少包含一个数字
 */
export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_REQUIREMENT_HINT =
  '至少 8 位，需包含字母和数字。';

export function validateSignupPassword(password: string): string | null {
  const value = password ?? '';
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `密码至少需要 ${PASSWORD_MIN_LENGTH} 位。`;
  }
  if (!/[A-Za-z]/.test(value)) {
    return '密码至少需要包含一个字母。';
  }
  if (!/[0-9]/.test(value)) {
    return '密码至少需要包含一个数字。';
  }
  return null;
}
