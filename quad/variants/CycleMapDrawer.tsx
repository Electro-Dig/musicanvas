import { useUiText } from '../uiLocale';
import React, { useEffect } from 'react';
import type { LilyCycleCompilation, QuadPadId } from '../core';
import type { NodePresentation } from '../nodePresentation';
import CycleTrace from '../CycleTrace';

interface CycleMapDrawerProps {
  open: boolean;
  onClose: () => void;
  padId: QuadPadId;
  current: LilyCycleCompilation | null;
  next: LilyCycleCompilation | null;
  cyclePhase: number;
  selectedNodeId: string | null;
  nodePresentations: Map<string, NodePresentation>;
  nextNodePresentations: Map<string, NodePresentation> | null;
  showNodeLabels: boolean;
  onSelectNode: (nodeId: string) => void;
}

export const CycleMapDrawer: React.FC<CycleMapDrawerProps> = ({
  open,
  onClose,
  padId,
  current,
  next,
  cyclePhase,
  selectedNodeId,
  nodePresentations,
  nextNodePresentations,
  showNodeLabels,
  onSelectNode,
}) => {
  const tr = useUiText();
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        className="quad-cycle-drawer__backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className="quad-cycle-drawer is-open"
        role="dialog"
        aria-modal="true"
        aria-label={tr("Pad {0} 周期图谱与结构译谱", padId)}
      >
        <div className="quad-cycle-drawer__header">
          <div className="quad-cycle-drawer__title">
            <span>{tr("▤ 周期图谱 (CYCLE MAP) · PAD")}{padId}</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              className="quad-cycle-drawer__close"
              onClick={onClose}
              aria-label={tr("关闭图谱抽屉")}
            >
              {tr("关闭 ✕")}</button>
          </div>
        </div>

        <div className="quad-cycle-drawer__content">
          <CycleTrace
            padId={padId}
            current={current}
            next={next}
            cyclePhase={cyclePhase}
            selectedNodeId={selectedNodeId}
            nodePresentations={nodePresentations}
            nextNodePresentations={nextNodePresentations}
            showNodeLabels={showNodeLabels}
            onSelectNode={onSelectNode}
          />
        </div>
      </aside>
    </>
  );
};
