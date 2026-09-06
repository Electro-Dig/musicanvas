export type UiVariant = 'original' | 'studio' | 'floating' | 'performer';

export const UI_VARIANT_STORAGE_KEY = 'gemidi.ui-variant.v1';

export interface UiVariantSpec {
  id: UiVariant;
  number: number;
  label: string;
  tagline: string;
  description: string;
}

export const UI_VARIANTS: readonly UiVariantSpec[] = [
  {
    id: 'original',
    number: 0,
    label: '原版机架',
    tagline: 'Baseline',
    description: '原始平铺式机架，左右 1:1 分割，顶栏右置 MIDI，作为对照基准',
  },
  {
    id: 'studio',
    number: 1,
    label: '工作室控制台',
    tagline: 'Studio Console',
    description: '主控靠左贴近画布，右侧可折叠图谱抽屉，底栏双舱固定分区',
  },
  {
    id: 'floating',
    number: 2,
    label: '极简通透画廊',
    tagline: 'Floating Canvas',
    description: '全景无界大画布，居中悬浮胶囊中岛，右侧边缘微光触发标签',
  },
  {
    id: 'performer',
    number: 3,
    label: '现场演奏台',
    tagline: 'Live Performer',
    description: '中央高发光主控岛，高对比声部大键，卡片化参数网格',
  },
] as const;

export function loadUiVariant(): UiVariant {
  if (typeof window === 'undefined' || !window.localStorage) {
    return 'original';
  }
  try {
    const params = new URLSearchParams(window.location.search);
    const paramUi = params.get('ui');
    if (paramUi === 'original' || paramUi === 'studio' || paramUi === 'floating' || paramUi === 'performer') {
      window.localStorage.setItem(UI_VARIANT_STORAGE_KEY, paramUi);
      return paramUi;
    }
  } catch {
    // fallback
  }

  const stored = window.localStorage.getItem(UI_VARIANT_STORAGE_KEY);
  if (stored === 'original' || stored === 'studio' || stored === 'floating' || stored === 'performer') {
    return stored;
  }
  return 'studio';
}

export function saveUiVariant(variant: UiVariant): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(UI_VARIANT_STORAGE_KEY, variant);
    } catch {
      // safe fallback
    }
  }
}
