import React from 'react';
import type { CanvasDecoration } from './canvasDecoration.ts';

/** Memoized separately from the playback cursor; no animation or event handlers. */
export const CanvasDecorationLayer = React.memo(function CanvasDecorationLayer({
  decoration,
}: { decoration?: CanvasDecoration }) {
  if (!decoration) return null;
  return (
    <g className="quad-canvas-decoration" data-decoration={decoration.kind} aria-hidden="true" pointerEvents="none">
      {decoration.strokes.map((stroke, index) => (
        <path
          key={index}
          data-role={stroke.role}
          d={stroke.points.map(([x, y], i) => `${i ? 'L' : 'M'}${x * 100},${y * 100}`).join(' ') + (stroke.role === 'outline' ? ' Z' : '')}
        />
      ))}
    </g>
  );
});
