/** Static drawing beneath musical nodes. These points never enter propagation. */
export interface CanvasDecoration {
  kind: 'feather';
  strokes: Array<{
    role: 'stem' | 'vein' | 'outline';
    points: [number, number][];
  }>;
}

export function parseCanvasDecoration(value: unknown): CanvasDecoration | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Record<string, unknown>;
  if (candidate.kind !== 'feather' || !Array.isArray(candidate.strokes)) return undefined;
  const strokes: CanvasDecoration['strokes'] = [];
  for (const item of candidate.strokes.slice(0, 64)) {
    if (!item || typeof item !== 'object') continue;
    const { role, points } = item as Record<string, unknown>;
    if (role !== 'stem' && role !== 'vein' && role !== 'outline') continue;
    if (!Array.isArray(points) || points.length < 2 || points.length > 256) continue;
    if (!points.every(p => Array.isArray(p) && p.length === 2 && p.every(n =>
      typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1))) continue;
    strokes.push({ role, points: points.map(p => [p[0], p[1]]) });
  }
  return strokes.length ? { kind: 'feather', strokes } : undefined;
}
