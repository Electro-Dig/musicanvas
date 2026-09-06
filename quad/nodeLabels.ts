export interface NodeLabelVisibility {
  canvas: boolean;
  cycleMap: true;
}

/**
 * The INFO control declutters only the editable Lily canvas. The Cycle Map
 * keeps stable identities so it remains a readable structural reference.
 */
export function resolveNodeLabelVisibility(showCanvasLabels: boolean): NodeLabelVisibility {
  return {
    canvas: showCanvasLabels,
    cycleMap: true,
  };
}
