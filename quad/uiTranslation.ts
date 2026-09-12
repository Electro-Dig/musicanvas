import type { AppLocale } from './i18n.ts';
import { UI_MESSAGES } from './uiMessages.ts';

/** Only explicit application messages are translated. Substituted names/content remain untouched. */
export function translateUi(locale: AppLocale, message: string, ...values: unknown[]): string {
  // Pure calculation/auth modules return these numeric messages before rendering.
  if (locale === 'en' && !UI_MESSAGES[message]) {
    const limit = message.match(/^完整循环超过 (\d+) 轮，请缩短运动周期后查看全图。$/);
    if (limit) return translateUi(locale, '完整循环超过 {0} 轮，请缩短运动周期后查看全图。', limit[1]);
    const password = message.match(/^密码至少需要 (\d+) 位。$/);
    if (password) return translateUi(locale, '密码至少需要 {0} 位。', password[1]);
  }
  const template = locale === 'en' ? (UI_MESSAGES[message] ?? message) : message;
  return template.replace(/\{(\d+)\}/g, (token, index) => Number(index) < values.length ? String(values[Number(index)] ?? '') : token);
}
