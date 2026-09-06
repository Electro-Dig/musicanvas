import React from 'react';
import { ROOT_NOTES, SCALES } from '../musicTheory';
import { QUAD_PAD_IDS } from '../core';
import { NodeMotionControls } from '../NodeMotionControls';
import { NodePitchControls } from '../NodePitchControls';
import { QuadLilyCanvas } from '../QuadLilyCanvas';
import { CycleMapDrawer } from './CycleMapDrawer';
import type { QuadLilyLayoutProps } from './layoutProps';

const PAD_COLORS: Record<string, string> = {
  A: '#ff4081',
  B: '#00e5ff',
  C: '#ffd600',
  D: '#00e676',
};

export const PerformerLayout: React.FC<QuadLilyLayoutProps> = (props) => {
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
    onRestartAll,
  } = props;

  const formatStep = (step: number) => (step > 0 ? `+${step}` : String(step));

  return (
    <div className="quad-performer-wrapper">
      {/* --- TOP PERFORMER CENTRAL COMMAND DECK --- */}
      <header className="quad-performer-deck-top">
        {/* Left: Brand & View */}
        <div className="quad-performer-brand">
          <span style={{ color: '#00e5ff' }}>⚡</span>
          <span>MUSICANVAS</span>
          <div style={{ display: 'inline-flex', gap: '2px', marginLeft: '6px' }}>
            <button
              type="button"
              style={{
                padding: '2px 6px',
                fontSize: '10px',
                background: viewMode === 'single' ? '#1b4d3e' : '#111',
                color: '#fff',
                border: '1px solid #333',
                borderRadius: '3px',
                cursor: 'pointer',
              }}
              onClick={() => onSetViewMode('single')}
            >
              1 PAD
            </button>
            <button
              type="button"
              style={{
                padding: '2px 6px',
                fontSize: '10px',
                background: viewMode === 'quad' ? '#1b4d3e' : '#111',
                color: '#fff',
                border: '1px solid #333',
                borderRadius: '3px',
                cursor: 'pointer',
              }}
              onClick={() => onSetViewMode('quad')}
            >
              4 PAD
            </button>
          </div>
        </div>

        {/* Center: Tactical Pad Buttons + Big Glowing Play Switch */}
        <div className="quad-performer-center-deck">
          {viewMode === 'single' && (
            <div className="quad-performer-pads" role="tablist">
              {QUAD_PAD_IDS.map((padId) => {
                const isCurrent = selectedPadId === padId;
                const isPlaying = workspace.pads[padId].playing;
                return (
                  <button
                    key={padId}
                    type="button"
                    role="tab"
                    className="quad-performer-pad-trigger"
                    data-active={isCurrent ? 'true' : 'false'}
                    onClick={() => onChoosePad(padId)}
                    style={{
                      borderColor: isCurrent ? PAD_COLORS[padId] : undefined,
                      color: isCurrent ? '#fff' : '#888',
                    }}
                  >
                    <span>{padId}</span>
                    <span style={{ fontSize: '8px', marginLeft: '3px', color: isPlaying ? '#00e676' : '#555' }}>
                      {isPlaying ? '●' : '○'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Big Tactile Transport Button */}
          {viewMode === 'single' ? (
            <button
              type="button"
              className="quad-performer-play-switch"
              data-playing={selectedPad.playing ? 'true' : 'false'}
              onClick={() => onTogglePadPlaying(selectedPadId)}
            >
              <span style={{ fontSize: '14px' }}>
                {selectedPad.playing ? '❚❚' : '▶'}
              </span>
              <span>{selectedPad.playing ? 'PAUSE' : selectedIsPaused ? 'RESUME' : 'PLAY'} {selectedPadId}</span>
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                className="quad-performer-play-switch"
                data-playing={workspace.masterPlaying ? 'true' : 'false'}
                onClick={workspace.masterPlaying ? onPauseAll : onPlayAll}
              >
                <span>{workspace.masterPlaying ? '❚❚ 全部暂停' : '▶ 全部播放'}</span>
              </button>
              <button
                type="button"
                className="quad-performer-pad-trigger"
                onClick={onRestartAll}
              >
                ↻ 同步
              </button>
            </div>
          )}

          {/* Compact MIDI status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', background: '#141a16', padding: '4px 8px', borderRadius: '4px', border: '1px solid #23362a' }}>
            <span style={{ color: selectedOutput ? '#00e676' : '#666' }}>●</span>
            <select
              value={String(workspace.fm1Tone)}
              onChange={(e) => onSetFm1Tone(e.target.value === 'follow' ? 'follow' : Number(e.target.value))}
              style={{ background: 'transparent', color: '#fff', border: 'none', fontSize: '11px', cursor: 'pointer' }}
              title="FM-1 音色编号"
            >
              <option value="follow">跟随机身</option>
              {Array.from({ length: 128 }, (_, i) => i + 1).map((t) => (
                <option key={t} value={t} style={{ background: '#111' }}>
                  FM {String(t).padStart(3, '0')}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right Tools: Mini-Pulse Map Trigger + Library */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="quad-drawer-trigger-btn"
            onClick={() => onSetCycleDrawerOpen(!cycleDrawerOpen)}
            style={{
              borderColor: '#00e5ff',
              color: '#00e5ff',
              fontWeight: 800,
            }}
          >
            <span style={{ display: 'inline-block', animation: selectedPad.playing ? 'pulse 1s infinite' : 'none' }}>
              ∿
            </span>
            <span>周期图谱 {cycleDrawerOpen ? '✕' : '▸'}</span>
          </button>
          <button type="button" className="quad-drawer-trigger-btn" onClick={onOpenLibrary}>
            📚 库
          </button>
          <button type="button" className="quad-drawer-trigger-btn" onClick={onToggleTheme}>
            {theme === 'lotus' ? 'LOTUS' : 'DARK'}
          </button>
        </div>
      </header>

      {/* --- MAIN STAGE --- */}
      <section className="quad-main-stage" data-view-mode={viewMode}>
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
      </section>

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

      {/* --- BOTTOM PERFORMER CARD GRID --- */}
      <footer className="quad-performer-bottom-grid">
        {/* Card 1: 节奏与时钟 */}
        <div className="quad-performer-card">
          <div className="quad-performer-card__title">⏱ 节奏与时钟 (TEMPO)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' }}>
            <span style={{ fontWeight: 800, color: '#00e5ff' }}>{selectedPad.intervalMs}ms</span>
            <input
              type="range"
              min="100"
              max="1500"
              step="10"
              value={selectedPad.intervalMs}
              onChange={(e) => onPatchSelectedPad({ intervalMs: Number(e.target.value) })}
              style={{ flex: 1 }}
            />
            <button
              type="button"
              onClick={onRestartSelectedPad}
              style={{ padding: '2px 6px', fontSize: '10px', cursor: 'pointer', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '3px' }}
            >
              起拍
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px', marginTop: '4px' }}>
            <span>力度 VEL: {Math.round(selectedPad.velocity * 127)}</span>
            <input
              type="range"
              min="0.08"
              max="1"
              step="0.01"
              value={selectedPad.velocity}
              onChange={(e) => onPatchSelectedPad({ velocity: Number(e.target.value) })}
              style={{ flex: 1 }}
            />
          </div>
        </div>

        {/* Card 2: 调式与音高 */}
        <div className="quad-performer-card">
          <div className="quad-performer-card__title">🎵 调式与音高 (SCALE)</div>
          <div style={{ display: 'flex', gap: '6px', fontSize: '11px' }}>
            <select
              value={selectedPad.rootMidi}
              onChange={(e) => onPatchSelectedPad({ rootMidi: Number(e.target.value) })}
              style={{ background: '#111', color: '#fff', border: '1px solid #333', padding: '2px 4px', borderRadius: '3px' }}
            >
              {ROOT_NOTES.map((r) => (
                <option key={r.name} value={r.midiValue}>{r.name}</option>
              ))}
            </select>
            <select
              value={selectedScale.key}
              onChange={(e) => onPatchSelectedPad({ scaleKey: e.target.value })}
              style={{ flex: 1, background: '#111', color: '#fff', border: '1px solid #333', padding: '2px 4px', borderRadius: '3px' }}
            >
              {SCALES.filter((s) => s.intervals.length).map((s) => (
                <option key={s.key} value={s.key}>{s.name}</option>
              ))}
            </select>
            <select
              value={selectedPad.octaveTranspose}
              onChange={(e) => onPatchSelectedPad({ octaveTranspose: Number(e.target.value) })}
              style={{ background: '#111', color: '#fff', border: '1px solid #333', padding: '2px 4px', borderRadius: '3px' }}
            >
              {[-2, -1, 0, 1, 2].map((o) => (
                <option key={o} value={o}>{o > 0 ? `+${o}` : o}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', marginTop: '4px' }}>
            <span style={{ fontWeight: 700, color: 'var(--selected-pad-color, #ff4081)' }}>
              {selectedNode.isCenter ? '中心音' : `节点 ${selectedNode.id}`}:
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
        </div>

        {/* Card 3: 动力学运动与操作 */}
        <div className="quad-performer-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="quad-performer-card__title">⚡ 动力学运动 (MOTION)</div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                type="button"
                onClick={() => onTogglePadLocked(selectedPadId)}
                style={{ fontSize: '9px', padding: '1px 5px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '3px', cursor: 'pointer' }}
              >
                {selectedPad.locked ? '解锁' : '锁定'}
              </button>
              <button
                type="button"
                onClick={onClearSelectedPad}
                disabled={selectedPad.locked}
                style={{ fontSize: '9px', padding: '1px 5px', background: '#4a1515', color: '#ff8a80', border: '1px solid #ff5252', borderRadius: '3px', cursor: 'pointer' }}
              >
                清空
              </button>
            </div>
          </div>
          <NodeMotionControls
            motion={selectedMotion}
            locked={selectedPad.locked}
            drawStatus={drawStatus}
            onMotionChange={onChangeSelectedMotion}
            onArmDraw={onArmDraw}
            onCancelDraw={onCancelDraw}
          />
        </div>
      </footer>
    </div>
  );
};
