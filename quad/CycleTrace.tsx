import React, { useMemo, useState } from 'react';

import type { LilyCycleCompilation, QuadPadId } from './core.ts';
import type { NodePresentation } from './nodePresentation.ts';
import {
  buildCycleFlowModel,
  buildCycleMapModel,
  phaseToX,
  type CycleFlowNode,
  type CycleMapEdge,
  type CycleMapNode,
} from './cycleTraceModel.ts';

export interface CycleTraceProps {
  padId: QuadPadId;
  current: LilyCycleCompilation;
  next: LilyCycleCompilation;
  cyclePhase: number;
  selectedNodeId: string | null;
  nodePresentations?: ReadonlyMap<string, NodePresentation>;
  nextNodePresentations?: ReadonlyMap<string, NodePresentation>;
  showNodeLabels?: boolean;
  onSelectNode(nodeId: string): void;
}

type CycleTraceViewMode = 'flow' | 'time';

const TIME_MARKS = [0, 0.25, 0.5, 0.75, 1] as const;

export const CycleTrace: React.FC<CycleTraceProps> = ({
  padId,
  current,
  next,
  cyclePhase,
  selectedNodeId,
  nodePresentations,
  nextNodePresentations,
  showNodeLabels = true,
  onSelectNode,
}) => {
  const [traceView, setTraceView] = useState<CycleTraceViewMode>('flow');
  const graph = useMemo(() => buildCycleMapModel(current, next), [current, next]);
  const flow = useMemo(() => buildCycleFlowModel(graph), [graph]);
  const audibleNodes = graph.nodes.filter(node => node.change !== 'silent');
  const timePositions = new Map<string, CycleMapNode>(
    graph.nodes.map(node => [node.nodeId, node] as [string, CycleMapNode]),
  );
  const flowPositions = new Map<string, CycleFlowNode>(
    flow.nodes.map(node => [node.nodeId, node] as [string, CycleFlowNode]),
  );
  const timeNextMarkerId = `cycle-map-next-arrow-${padId}`;
  const flowMarkerId = (layer: CycleMapEdge['layer']) => `cycle-flow-${layer}-arrow-${padId}`;
  const hasQuietShelf = flow.nodes.some(node => node.flowDepth < 0);

  return (
    <figure className="cycle-trace" aria-label={`Pad ${padId} 周期关系图`}>
      <figcaption className="cycle-trace__header">
        <span className="cycle-trace__title">
          <strong>CYCLE MAP</strong>
          <span>周期关系</span>
        </span>
        <span className="cycle-trace__count">
          PAD {padId} <b>{graph.currentActive}</b><i aria-hidden="true">→</i><b>{graph.nextActive}</b>
        </span>
        <nav className="cycle-trace__mode-switch" aria-label="周期图显示模式">
          <button
            type="button"
            aria-label="一图流"
            aria-pressed={traceView === 'flow'}
            onClick={() => setTraceView('flow')}
          >一图流</button>
          <button
            type="button"
            aria-label="时间结构"
            aria-pressed={traceView === 'time'}
            onClick={() => setTraceView('time')}
          >时间</button>
        </nav>
        <span className="cycle-trace__legend" aria-label="实线表示当前，虚线表示下一周期变化">
          <i data-layer="current" aria-hidden="true" />当前
          <i data-layer="next" aria-hidden="true" />变化
        </span>
      </figcaption>

      {traceView === 'flow' ? (
        <div
          className="cycle-flow"
          data-trace-view="flow"
          data-compact={flow.compact ? 'true' : 'false'}
          role="group"
          aria-label={`Pad ${padId} 一图流关系结构`}
          style={{
            '--cycle-flow-node-width': `${flow.nodeWidthPct}%`,
            '--cycle-flow-node-height': `${flow.nodeHeightPct}%`,
          } as React.CSSProperties}
        >
          <span className="cycle-flow__origin-label" aria-hidden="true">ROOT / SOURCE</span>
          {hasQuietShelf && (
            <span className="cycle-flow__quiet-label" aria-hidden="true">未触达</span>
          )}
          <svg className="cycle-flow__edges" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              {(['stable', 'current', 'next'] as const).map(layer => (
                <marker
                  key={layer}
                  id={flowMarkerId(layer)}
                  viewBox="0 0 5 5"
                  refX="4.6"
                  refY="2.5"
                  markerWidth="4"
                  markerHeight="4"
                  orient="auto"
                >
                  <path d="M 0 0 L 5 2.5 L 0 5 Z" fill="context-stroke" />
                </marker>
              ))}
            </defs>
            {flow.edges.map(edge => {
              const path = flowEdgePath(edge, flowPositions);
              if (!path) return null;
              return (
                <path
                  key={JSON.stringify([edge.layer, edge.fromId, edge.toId])}
                  className="cycle-flow__edge"
                  data-layer={edge.layer}
                  d={path}
                  markerEnd={`url(#${flowMarkerId(edge.layer)})`}
                />
              );
            })}
          </svg>

          {flow.nodes.map(node => {
            const reached = node.current?.status === 'active'
              && node.current.phase !== null
              && node.current.phase <= cyclePhase;
            return (
              <button
                key={node.nodeId}
                type="button"
                aria-pressed={selectedNodeId === node.nodeId}
                aria-label={describeNode(node, nodePresentations, nextNodePresentations)}
                className="cycle-flow__node"
                data-change={node.change}
                data-selected={selectedNodeId === node.nodeId ? 'true' : 'false'}
                data-reached={reached ? 'true' : 'false'}
                data-flow-depth={node.flowDepth}
                data-flow-status={flowNodeStatus(node)}
                style={{ left: `${node.flowX}%`, top: `${node.flowY}%` }}
                title={describeNode(node, nodePresentations, nextNodePresentations)}
                onClick={() => onSelectNode(node.nodeId)}
              >
                <span className="cycle-flow__glyph" aria-hidden="true">{flowChangeGlyph(node)}</span>
                <strong>{formatNodeIdentity(node, nodePresentations, nextNodePresentations, showNodeLabels)}</strong>
                <small>{formatNodeStep(node)} · {formatFlowMeta(node)}</small>
                <span className="cycle-flow__node-id" aria-hidden="true">{node.nodeId}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div
          className="cycle-map"
          data-trace-view="time"
          role="group"
          aria-label={`Pad ${padId} 单周期传播结构`}
        >
          <div className="cycle-map__time" aria-hidden="true">
            {TIME_MARKS.map(phase => (
              <span key={phase} style={{ left: `${phaseToX(phase)}%` }}>
                {phase === 1 ? 'T' : `${Math.round(current.intervalMs * phase)} ms`}
              </span>
            ))}
          </div>
          <div className="cycle-map__grid" aria-hidden="true">
            {TIME_MARKS.map(phase => <i key={phase} style={{ left: `${phaseToX(phase)}%` }} />)}
          </div>
          <span
            className="cycle-map__playhead"
            style={{ left: `${phaseToX(cyclePhase)}%` }}
            aria-hidden="true"
          />

          <svg className="cycle-map__edges" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <marker id={timeNextMarkerId} viewBox="0 0 4 4" refX="3.6" refY="2" markerWidth="3" markerHeight="3" orient="auto">
                <path d="M 0 0 L 4 2 L 0 4 Z" />
              </marker>
            </defs>
            {graph.edges.map(edge => {
              const points = timeEdgePoints(edge, timePositions);
              if (!points) return null;
              return (
                <line
                  key={JSON.stringify([edge.layer, edge.fromId, edge.toId])}
                  data-layer={edge.layer}
                  x1={points.from.x}
                  y1={points.from.y}
                  x2={points.to.x}
                  y2={points.to.y}
                  markerEnd={edge.layer === 'next' ? `url(#${timeNextMarkerId})` : undefined}
                />
              );
            })}
          </svg>

          {audibleNodes.filter(hasPredictedGhost).map(node => (
            <span
              key={`ghost:${node.nodeId}`}
              className="cycle-map__ghost"
              data-change={node.change}
              style={{ left: `${node.nextX}%`, top: `${node.nextY}%` }}
              aria-hidden="true"
            />
          ))}

          {audibleNodes.map(node => {
            const displayNode = node.current?.status === 'active' ? node.current : node.next!;
            const reached = node.current?.phase !== null
              && node.current?.phase !== undefined
              && node.current.phase <= cyclePhase;
            return (
              <button
                key={node.nodeId}
                type="button"
                aria-pressed={selectedNodeId === node.nodeId}
                aria-label={describeNode(node, nodePresentations, nextNodePresentations)}
                className="cycle-map__node"
                data-change={node.change}
                data-selected={selectedNodeId === node.nodeId ? 'true' : 'false'}
                data-reached={reached ? 'true' : 'false'}
                style={{ left: `${node.x}%`, top: `${node.y}%` }}
                onClick={() => onSelectNode(node.nodeId)}
              >
                <span className="cycle-map__glyph" aria-hidden="true">
                  {node.change === 'entering' ? '+' : node.change === 'leaving' ? '−' : ''}
                </span>
                <strong>{formatNodeIdentity(node, nodePresentations, nextNodePresentations, showNodeLabels)}</strong>
                <small>{formatNodeStep(node)} · {formatNodeTime(node)}</small>
                <span className="cycle-map__node-id" aria-hidden="true">{node.nodeId}</span>
              </button>
            );
          })}
        </div>
      )}

      <footer className="cycle-trace__footer">
        <span>{current.intervalMs} ms / cycle</span>
        {graph.changed > 0 && <span data-kind="changed">{graph.changed} 处变化</span>}
        {graph.unreachable > 0 && <span>{graph.unreachable} 未触达</span>}
        {graph.outsideCycle > 0 && <span>{graph.outsideCycle} 跨周期</span>}
      </footer>
    </figure>
  );
};

function timeEdgePoints(
  edge: CycleMapEdge,
  nodes: Map<string, CycleMapNode>,
): { from: { x: number; y: number }; to: { x: number; y: number } } | null {
  const from = nodes.get(edge.fromId);
  const to = nodes.get(edge.toId);
  if (!from || !to) return null;
  if (edge.layer === 'next') {
    if (from.nextX === null || from.nextY === null || to.nextX === null || to.nextY === null) return null;
    return { from: { x: from.nextX, y: from.nextY }, to: { x: to.nextX, y: to.nextY } };
  }
  if (from.currentX === null || from.currentY === null || to.currentX === null || to.currentY === null) return null;
  return { from: { x: from.currentX, y: from.currentY }, to: { x: to.currentX, y: to.currentY } };
}

function flowEdgePath(edge: CycleMapEdge, nodes: Map<string, CycleFlowNode>): string | null {
  const from = nodes.get(edge.fromId);
  const to = nodes.get(edge.toId);
  if (!from || !to || from.flowDepth < 0 || to.flowDepth < 0) return null;
  const bendX = from.flowX + (to.flowX - from.flowX) * 0.5;
  return [
    `M ${from.flowX} ${from.flowY}`,
    `C ${bendX} ${from.flowY}, ${bendX} ${to.flowY}, ${to.flowX} ${to.flowY}`,
  ].join(' ');
}

function hasPredictedGhost(node: CycleMapNode): boolean {
  if (node.change !== 'retimed' && node.change !== 'rewired') return false;
  if (node.nextX === null || node.nextY === null) return false;
  return Math.abs(node.nextX - node.x) > 0.5 || Math.abs(node.nextY - node.y) > 0.5;
}

function describeNode(
  node: CycleMapNode,
  presentations?: ReadonlyMap<string, NodePresentation>,
  nextPresentations?: ReadonlyMap<string, NodePresentation>,
): string {
  const source = node.current ?? node.next;
  const currentPresentation = presentations?.get(node.nodeId);
  const nextPresentation = nextPresentations?.get(node.nodeId);
  const presentation = currentPresentation ?? nextPresentation;
  const currentText = describeAppearance(node.current, '本周期不发声');
  const nextText = describeAppearance(node.next, '下一周期不发声');
  const currentStep = node.current?.status === 'active' ? formatStep(node.current.scaleStep) : '无';
  const nextStep = node.next?.status === 'active' ? formatStep(node.next.scaleStep) : '无';
  const currentParent = node.current?.status === 'active' ? node.current.parentId : null;
  const nextParent = node.next?.status === 'active' ? node.next.parentId : null;
  const parent = node.change === 'rewired'
    ? `，父节点从 ${currentParent ?? '起点'} 变为 ${nextParent ?? '起点'}`
    : source?.parentId ? `，来自 ${source.parentId}` : '，传播起点';
  const state = flowNodeStatus(node) === 'outside' ? '已调度但跨越周期边界' : changeLabel(node.change);
  const identity = presentation
    ? `${presentation.shortId}，音符 ${presentation.noteName}${currentPresentation && nextPresentation && nextPresentation.noteName !== currentPresentation.noteName ? ` 到 ${nextPresentation.noteName}` : ''}`
    : source?.isCenter ? '根节点' : `节点 ${node.nodeId}`;
  return `${identity}，STEP ${currentStep} 到 ${nextStep}，当前 ${currentText}，下一周期 ${nextText}${parent}，${state}`;
}

function formatNodeIdentity(
  node: CycleMapNode,
  presentations: ReadonlyMap<string, NodePresentation> | undefined,
  nextPresentations: ReadonlyMap<string, NodePresentation> | undefined,
  showNodeLabels: boolean,
): string {
  if (showNodeLabels) {
    const currentPresentation = presentations?.get(node.nodeId);
    const nextPresentation = nextPresentations?.get(node.nodeId);
    const presentation = currentPresentation ?? nextPresentation;
    if (presentation) {
      const note = currentPresentation && nextPresentation && nextPresentation.noteName !== currentPresentation.noteName
        ? `${currentPresentation.noteName}→${nextPresentation.noteName}`
        : presentation.noteName;
      return `${presentation.shortId} · ${note}`;
    }
  }
  return node.isCenter ? 'ROOT' : formatNodeStep(node);
}

function describeAppearance(
  node: CycleMapNode['current'],
  silentLabel: string,
): string {
  if (!node || node.status === 'unreachable') return silentLabel;
  const time = `${Math.round(node.offsetMs ?? 0)} 毫秒`;
  return node.status === 'outside-cycle' ? `${time}，跨周期` : time;
}

function formatNodeStep(node: CycleMapNode): string {
  const current = node.current?.status === 'active' ? node.current.scaleStep : null;
  const next = node.next?.status === 'active' ? node.next.scaleStep : null;
  if (current !== null && next !== null && current !== next) {
    return `STEP ${formatStep(current)}→${formatStep(next)}`;
  }
  return `STEP ${formatStep(current ?? next ?? node.scaleStep)}`;
}

function formatNodeTime(node: CycleMapNode): string {
  const current = node.current?.status === 'active' ? Math.round(node.current.offsetMs ?? 0) : null;
  const next = node.next?.status === 'active' ? Math.round(node.next.offsetMs ?? 0) : null;
  if (current !== null && next !== null && current !== next) return `${current}→${next} ms`;
  if (current !== null) return `${current} ms`;
  if (next !== null) return `+ ${next} ms`;
  return '—';
}

function formatFlowMeta(node: CycleMapNode): string {
  const current = node.current?.status === 'active' ? Math.round(node.current.offsetMs ?? 0) : null;
  const next = node.next?.status === 'active' ? Math.round(node.next.offsetMs ?? 0) : null;
  if (current !== null && next !== null && current !== next) {
    const delta = next - current;
    return `${current}→${next} · Δ${delta > 0 ? '+' : ''}${delta}`;
  }
  if (node.current?.status === 'outside-cycle' || node.next?.status === 'outside-cycle') return '>T / 跨周期';
  if (current === null && next === null) return '未触达';
  if (current === null && next !== null) return `NEXT ${next} ms`;
  if (current !== null && next === null) return `${current} ms / OUT`;
  return `${current ?? next ?? 0} ms`;
}

function flowChangeGlyph(node: CycleMapNode): string {
  if (flowNodeStatus(node) === 'outside') return '>T';
  const glyphs: Record<CycleMapNode['change'], string> = {
    stable: '',
    retimed: 'Δt',
    rewired: '↗',
    repitched: 'Δ♪',
    entering: '+',
    leaving: '−',
    silent: '·',
  };
  return glyphs[node.change];
}

function flowNodeStatus(node: CycleMapNode): 'active' | 'outside' | 'unreachable' {
  if (node.current?.status === 'active' || node.next?.status === 'active') return 'active';
  if (node.current?.status === 'outside-cycle' || node.next?.status === 'outside-cycle') return 'outside';
  return 'unreachable';
}

function formatStep(step: number): string {
  return step > 0 ? `+${step}` : String(step);
}

function changeLabel(change: CycleMapNode['change']): string {
  const labels: Record<CycleMapNode['change'], string> = {
    stable: '结构稳定',
    retimed: '触发时间改变',
    rewired: '传播分支改变',
    repitched: '音高改变',
    entering: '下一周期新增',
    leaving: '下一周期退出',
    silent: '未触达',
  };
  return labels[change];
}

export default CycleTrace;
