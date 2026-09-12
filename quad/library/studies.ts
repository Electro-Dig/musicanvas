import { parseLibraryAsset, type LibraryWorkspaceAsset } from './core.ts';

// Small manifest only: complete scores are fetched when the user loads a study.
export const CANON_STUDIES = [
  { id: 'leaf', name: '卡农 · 羽叶生长', description: '枝叶展开，同一句旋律依次生长。' },
  { id: 'ribbon', name: '卡农 · 飘带交织', description: '曲线交织，追随三个声部的进入。' },
  { id: 'mountain', name: '卡农 · 山峦回声', description: '山形起伏，呈现旋律的递进与回响。' },
] as const;

export async function loadCanonStudy(
  id: typeof CANON_STUDIES[number]['id'],
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<LibraryWorkspaceAsset> {
  const response = await fetcher(`/studies/canon-${id}.musicanvas.json`, { signal });
  if (!response.ok) throw new Error('示例读取失败，请重试。');
  const asset = parseLibraryAsset(await response.text());
  if (asset?.type !== 'workspace') throw new Error('示例格式无效，请刷新后重试。');
  return { ...asset, source: 'public' };
}
