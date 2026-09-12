import { useUiText } from '../uiLocale';
import React, { useState } from 'react';
import { ROOT_NOTES, SCALES } from '../musicTheory';
import { QUAD_PAD_IDS } from '../core';
import { NodeMotionControls } from '../NodeMotionControls';
import { NodePitchControls } from '../NodePitchControls';
import { QuadLilyCanvas } from '../QuadLilyCanvas';
import { CycleMapDrawer } from './CycleMapDrawer';
import type { QuadLilyLayoutProps } from './layoutProps';

const PAD_COLORS: Record<string, string> = {
  A: '#c44569',
  B: '#227093',
  C: '#b33939',
  D: '#218c74',
};

export const FloatingLayout: React.FC<QuadLilyLayoutProps> = (props) => {
  const tr = useUiText();
  const {
    workspace,
    selectedPadId,
    selectedPad,
    selectedNode,
    selectedScale,
    selectedMotion,
    viewMode,
    theme,
    showNodeLabels,
    nodeLabelVisibility,
    midiPorts,
    midiStatus,
    selectedOutput,
    padViews,
    selectedTrace,
    selectedVisibleCycle,
    currentTracePresentations,
    nextTracePresentations,
    selectedBasePresentations,
    selectedBPresentations,
    drawStatus,
    cycleDrawerOpen,
    selectedIsPaused,

    onSetCycleDrawerOpen,
    onSetViewMode,
    onToggleTheme,
    onToggleNodeLabels,
    onOpenLibrary,
    onTogglePadPlaying,
    onTogglePadLocked,
    onChoosePad,
    onAddNode,
    onRemoveNode,
    onStartNodeDrag,
    onSelectNode,
    onPatchSelectedPad,
    onPatchSelectedNode,
    onChangeSelectedMotion,
    onArmDraw,
    onCancelDraw,
    onToggleEndpointPitch,
    onRestartSelectedPad,
    onClearSelectedPad,
    onSetFm1Tone,
    onSetSelectedMidiOutputId,
    onRefreshMidi,
    onPlayAll,
    onPauseAll,
  } = props;

  const [expandedDock, setExpandedDock] = useState(false);
  const formatStep = (step: number) => (step > 0 ? `+${step}` : String(step));

  return (
    <div className="quad-floating-wrapper">
      {/* --- FLOATING TOP ISLAND HUD (Centered over canvas) --- */}
      <nav className="quad-floating-island" aria-label={tr("全景浮动控制岛")}>
        {/* Pad Switcher Pills */}
        <div className="quad-floating-island__tabs" role="tablist">
          {QUAD_PAD_IDS.map((padId) => {
            const isCurrent = selectedPadId === padId;
            const isPlaying = workspace.pads[padId].playing;
            return (
              <button
                key={padId}
                type="button"
                role="tab"
                className="quad-floating-island__tab-btn"
                data-active={isCurrent ? 'true' : 'false'}
                onClick={() => onChoosePad(padId)}
                title={`Pad ${padId} (${isPlaying ? tr("播放中") : tr("暂停")})`}
              >
                {padId}
              </button>
            );
          })}
        </div>

        <div className="quad-floating-island__divider" />

        {/* View Mode */}
        <div style={{ display: 'flex', gap: '2px' }}>
          <button
            type="button"
            style={{
              padding: '2px 6px',
              fontSize: '10px',
              borderRadius: '4px',
              border: 'none',
              background: viewMode === 'single' ? 'rgba(255,255,255,0.2)' : 'transparent',
              color: '#fff',
              cursor: 'pointer',
            }}
            onClick={() => onSetViewMode('single')}
          >
            1
          </button>
          <button
            type="button"
            style={{
              padding: '2px 6px',
              fontSize: '10px',
              borderRadius: '4px',
              border: 'none',
              background: viewMode === 'quad' ? 'rgba(255,255,255,0.2)' : 'transparent',
              color: '#fff',
              cursor: 'pointer',
            }}
            onClick={() => onSetViewMode('quad')}
          >
            4
          </button>
        </div>

        <div className="quad-floating-island__divider" />

        {/* Transport */}
        {viewMode === 'single' ? (
          <button
            type="button"
            className="quad-floating-island__play"
            data-playing={selectedPad.playing ? 'true' : 'false'}
            onClick={() => onTogglePadPlaying(selectedPadId)}
          >
            {selectedPad.playing ? tr("❚❚ 暂停") : selectedIsPaused ? tr("▶ 继续") : tr("▶ 播放")} {selectedPadId}
          </button>
        ) : (
          <button
            type="button"
            className="quad-floating-island__play"
            data-playing={workspace.masterPlaying ? 'true' : 'false'}
            onClick={workspace.masterPlaying ? onPauseAll : onPlayAll}
          >
            {workspace.masterPlaying ? tr("❚❚ 全部暂停") : tr("▶ 全部播放")}
          </button>
        )}

        <div className="quad-floating-island__divider" />

        {/* Tempo Quick Readout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
          <span style={{ color: '#8ce6cc', fontWeight: 700 }}>{selectedPad.intervalMs}ms</span>
          <input
            type="range"
            min="100"
            max="1500"
            step="10"
            value={selectedPad.intervalMs}
            onChange={(e) => onPatchSelectedPad({ intervalMs: Number(e.target.value) })}
            style={{ width: '60px' }}
            title={tr("滑动调整循环周期速度")}
          />
        </div>

        <div className="quad-floating-island__divider" />

        {/* MIDI Mini Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}>
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: selectedOutput ? '#4eedb2' : '#888',
            }}
          />
          <select
            value={String(workspace.fm1Tone)}
            onChange={(e) => onSetFm1Tone(e.target.value === 'follow' ? 'follow' : Number(e.target.value))}
            style={{ background: 'transparent', color: '#fff', border: 'none', fontSize: '10px', cursor: 'pointer' }}
            title={tr("FM-1 Voice 预设音色")}
          >
            <option value="follow">{tr("跟随机身")}</option>
            {Array.from({ length: 128 }, (_, i) => i + 1).map((t) => (
              <option key={t} value={t} style={{ background: '#222' }}>
                V{String(t).padStart(3, '0')}
              </option>
            ))}
          </select>
        </div>

        <div className="quad-floating-island__divider" />

        {/* Library & Tools */}
        <button
          type="button"
          onClick={onOpenLibrary}
          style={{ background: 'transparent', border: 'none', color: '#8ce6cc', cursor: 'pointer', fontSize: '12px' }}
          title={tr("打开素材库 (LIBRARY)")}
        >
          📚
        </button>
        <button
          type="button"
          onClick={onToggleTheme}
          style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '10px' }}
          title={tr("切换明暗主题")}
        >
          {theme === 'lotus' ? '☼' : '☾'}
        </button>
      </nav>

      {/* --- RIGHT EDGE SLIM TRIGGER FOR CYCLE MAP --- */}
      <button
        type="button"
        className="quad-floating-map-edge"
        onClick={() => onSetCycleDrawerOpen(!cycleDrawerOpen)}
        title={tr("展开/收起周期因果图谱 (CYCLE MAP)")}
      >
        {tr("▤ 周期图谱")}</button>

      {/* --- FULLSCREEN CANVAS --- */}
      <main className="quad-main-stage" data-view-mode={viewMode}>
        <QuadLilyCanvas
          pads={padViews}
          layout={viewMode}
          showNodeLabels={nodeLabelVisibility.canvas}
          mobilePadId={selectedPadId}
          onSelectPad={onChoosePad}
          onAddNode={onAddNode}
          onNodePointerDown={onStartNodeDrag}
          onSelectFormation={props.onSelectFormation}
          onFormationPointerDown={props.onStartFormationDrag}
          onDeleteNode={onRemoveNode}
          onTogglePlaying={onTogglePadPlaying}
          onToggleLocked={onTogglePadLocked}
          onPatchNode={props.onPatchNode}
          canvasBackgroundPattern={props.canvasBackgroundPattern}
        />
      </main>

      {/* --- CYCLE MAP DRAWER --- */}
      <CycleMapDrawer
        open={cycleDrawerOpen}
        onClose={() => onSetCycleDrawerOpen(false)}
        padId={selectedPadId}
        current={selectedTrace.current}
        next={selectedTrace.next}
        cyclePhase={selectedVisibleCycle.phase}
        selectedNodeId={selectedNode.id}
        nodePresentations={currentTracePresentations}
        nextNodePresentations={nextTracePresentations}
        showNodeLabels={nodeLabelVisibility.cycleMap}
        onSelectNode={onSelectNode}
      />

      {/* --- FLOATING BOTTOM CONTEXT DOCK --- */}
      <aside className="quad-floating-dock">
        {/* Scale Quick Capsule */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
          <span style={{ fontWeight: 800, color: 'var(--selected-pad-color, #c44569)' }}>{selectedPadId}</span>
          <select
            value={selectedPad.rootMidi}
            onChange={(e) => onPatchSelectedPad({ rootMidi: Number(e.target.value) })}
            style={{ background: 'transparent', color: '#fff', border: 'none', fontSize: '11px', cursor: 'pointer' }}
          >
            {ROOT_NOTES.map((r) => (
              <option key={r.name} value={r.midiValue} style={{ background: '#222' }}>
                {r.name}
              </option>
            ))}
          </select>
          <select
            value={selectedScale.key}
            onChange={(e) => onPatchSelectedPad({ scaleKey: e.target.value })}
            style={{ background: 'transparent', color: '#fff', border: 'none', fontSize: '11px', cursor: 'pointer', maxWidth: '120px' }}
          >
            {SCALES.filter((s) => s.intervals.length).map((s) => (
              <option key={s.key} value={s.key} style={{ background: '#222' }}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="quad-floating-island__divider" />

        {/* Selected Node Pitch & Motion Trigger */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' }}>
          <span>
            {selectedNode.isCenter ? tr("中心音") : tr("音符 {0}", selectedNode.id)}:
          </span>
          <NodePitchControls
            aStep={selectedNode.scaleStep}
            bStep={selectedNode.endpointPitch?.bStep ?? null}
            aNoteName={selectedBasePresentations.get(selectedNode.id)?.noteName ?? formatStep(selectedNode.scaleStep)}
            bNoteName={selectedBPresentations?.get(selectedNode.id)?.noteName ?? null}
            motionEnabled={selectedMotion.mode !== 'off'}
            locked={selectedPad.locked}
            onChangeAStep={(scaleStep) => onPatchSelectedNode({ scaleStep })}
            onChangeBStep={(bStep) => onPatchSelectedNode({ endpointPitch: { bStep } })}
            onToggleEndpointPitch={onToggleEndpointPitch}
          />
        </div>

        <div className="quad-floating-island__divider" />

        {/* Expand / Collapse Motion Drawer */}
        <button
          type="button"
          onClick={() => setExpandedDock(!expandedDock)}
          style={{
            background: expandedDock ? '#1b4d3e' : 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(140,200,180,0.3)',
            borderRadius: '12px',
            color: '#fff',
            padding: '3px 10px',
            fontSize: '11px',
            cursor: 'pointer',
          }}
        >
          {selectedMotion.mode.toUpperCase()} {tr("运动")}{expandedDock ? '▲' : '▼'}
        </button>

        {expandedDock && (
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              left: '50%',
              transform: 'translateX(-50%) translateY(-10px)',
              background: 'rgba(15, 20, 18, 0.95)',
              border: '1px solid rgba(140, 210, 180, 0.35)',
              borderRadius: '16px',
              padding: '12px 16px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
              backdropFilter: 'blur(16px)',
              zIndex: 4100,
              minWidth: '380px',
            }}
          >
            <NodeMotionControls
              motion={selectedMotion}
              locked={selectedPad.locked}
              drawStatus={drawStatus}
              onMotionChange={onChangeSelectedMotion}
              onArmDraw={onArmDraw}
              onCancelDraw={onCancelDraw}
            />
          </div>
        )}
      </aside>
    </div>
  );
};
