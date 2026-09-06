/**
 * 画布背景图案（荷塘氛围装饰）。
 * 默认 'none'：主画布保持纯净几何语言，仅保留周期进度环。
 */
export const CANVAS_BG_STORAGE_KEY = 'gemidi.canvasBg';

export const CANVAS_BACKGROUND_PATTERNS = ['none', 'pond1', 'pond2', 'pond3', 'pond4'] as const;

export type CanvasBackgroundPattern = (typeof CANVAS_BACKGROUND_PATTERNS)[number];

export const DEFAULT_CANVAS_BACKGROUND: CanvasBackgroundPattern = 'none';

/** 设置菜单展示用短标签（英文文案，与其余 UI 一致） */
export const CANVAS_BACKGROUND_LABELS: Record<CanvasBackgroundPattern, string> = {
  none: 'OFF',
  pond1: 'Pond I',
  pond2: 'Pond II',
  pond3: 'Pond III',
  pond4: 'Pond IV',
};

/** 从持久化值恢复；非法值回落到默认 'none' */
export function restoreCanvasBackground(value: unknown): CanvasBackgroundPattern {
  return CANVAS_BACKGROUND_PATTERNS.includes(value as CanvasBackgroundPattern)
    ? (value as CanvasBackgroundPattern)
    : DEFAULT_CANVAS_BACKGROUND;
}

/** 设置菜单里循环切换（与主题切换的交互语言保持一致） */
export function cycleCanvasBackground(current: CanvasBackgroundPattern): CanvasBackgroundPattern {
  const index = CANVAS_BACKGROUND_PATTERNS.indexOf(current);
  return CANVAS_BACKGROUND_PATTERNS[(index + 1) % CANVAS_BACKGROUND_PATTERNS.length];
}
