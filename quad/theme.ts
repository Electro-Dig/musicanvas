export type QuadTheme = 'lotus' | 'ink' | 'dark';

export const QUAD_THEMES: readonly QuadTheme[] = ['lotus', 'ink', 'dark'] as const;

export const QUAD_THEME_LABELS: Record<QuadTheme, string> = {
  lotus: 'LOTUS',
  ink: 'INK',
  dark: 'DARK',
};

export const QUAD_THEME_STORAGE_KEY = 'gemidi.quad-lily.theme.v1';

export function restoreQuadTheme(value: unknown): QuadTheme {
  if (value === 'ink' || value === 'dark' || value === 'lotus') {
    return value;
  }
  return 'lotus';
}

/** 在三套主题间循环切换 */
export function toggleQuadTheme(theme: QuadTheme): QuadTheme {
  const index = QUAD_THEMES.indexOf(theme);
  return QUAD_THEMES[(index + 1) % QUAD_THEMES.length];
}
