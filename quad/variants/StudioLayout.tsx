import React, { useEffect, useRef, useState } from 'react';
import {
  BookMarked,
  Info,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Trash2,
  Save,
  Settings2,
  Flower2,
  Moon,
  Droplets,
  LogIn,
  LogOut,
  UserCircle2,
  Square,
  LayoutGrid,
  Waves,
  Wind,
  CornerDownRight,
} from 'lucide-react';
import { QUAD_PAD_IDS, getPadCycleDurationMs } from '../core';
import { QuadLilyCanvas } from '../QuadLilyCanvas';
import type { QuadLilyLayoutProps } from './layoutProps';
import {
  StudioSidebar,
  STUDIO_TOWER_WIDTH_MIN,
  STUDIO_TOWER_WIDTH_STORAGE_KEY,
  clampStudioTowerWidth,
} from './StudioSidebar';
import { QUAD_THEME_LABELS } from '../theme';
import { CANVAS_BACKGROUND_LABELS, DEFAULT_CANVAS_BACKGROUND } from '../canvasBackground';
import { SoftSelect } from '../ui/SoftSelect';
import { t, type AppLocale } from '../i18n';

const PAD_COLORS: Record<string, string> = {
  A: 'var(--quad-pad-a)',
  B: 'var(--quad-pad-b)',
  C: 'var(--quad-pad-c)',
  D: 'var(--quad-pad-d)',
};

const ICON_SM = 14;
const ICON_MD = 15;
const QUAD_TOOLBAR_STORAGE_KEY = 'gemidi.studio.quad-toolbar.v1';

export const StudioLayout: React.FC<QuadLilyLayoutProps> = (props) => {
  const {
    workspace,
    selectedPadId,
    selectedPad,
    selectedNode,
    selectedScale,
    selectedMotion,
    drawStatus,
    groupNodeIds,
    groupMotionMode,
    groupRateCycles,
    groupRadius,
    formationFocus,
    padFormations,
    activeFormation,
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
    cycleDrawerOpen,

    onSetCycleDrawerOpen,
    onSetViewMode,
    onToggleTheme,
    onToggleNodeLabels,
    onOpenLibrary,
    onQuickSave,
    onQuickSavePad,
    onTogglePadPlaying,
    onTogglePadLocked,
    onClearPad,
    onSetPadMidiChannel,
    onChoosePad,
    onAddNode,
    onRemoveNode,
    onStartNodeDrag,
    onSelectNode,
    onCopyNotes, onPasteNotes, canPasteNotes,
    onReorderGroupNode,
    onSelectGroupPrimary,
    onSelectFormation,
    onStartFormationDrag,
    onDissolveFormation,
    onToggleFormationMuted,
    onToggleFormationHidden,
    onChangeGroupMotionMode,
    onChangeGroupRateCycles,
    onChangeGroupRadius,
    onPatchSelectedPad,
    onPatchSelectedNode,
    onPatchNode,
    onChangeSelectedMotion,
    onToggleEndpointPitch,
    onRestartSelectedPad,
    onSetFm1Tone,
    onSetSelectedMidiOutputId,
    onRefreshMidi,
    onPlayAll,
    onPauseAll,
    onRestartAll,
    onClearAll,
    onPatchAllTiming,
    soundPresetId,
    onSetSoundPresetId,
    canvasBackgroundPattern = DEFAULT_CANVAS_BACKGROUND,
    onCycleCanvasBackground,
    cycleContinue = false,
    onToggleCycleContinue,
    identityUser,
    onOpenAuth,
    onSignOut,
    createdPatternCount = 0,
    onUpdateNickname,
    onEditNickname,
    locale = 'zh' as AppLocale,
    onToggleLocale,
  } = props;

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [featherSway, setFeatherSway] = useState(false);
  const [showQuadToolbar, setShowQuadToolbar] = useState(() => {
    try { return typeof window !== 'undefined' && window.localStorage.getItem(QUAD_TOOLBAR_STORAGE_KEY) === '1'; }
    catch { return false; }
  });
  const toggleQuadToolbar = () => {
    const next = !showQuadToolbar;
    setShowQuadToolbar(next);
    try { window.localStorage.setItem(QUAD_TOOLBAR_STORAGE_KEY, next ? '1' : '0'); }
    catch { /* The display preference still works when storage is unavailable. */ }
  };
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 720px)').matches;
  });
  const [towerWidthPx, setTowerWidthPx] = useState(() => {
    if (typeof window === 'undefined') return STUDIO_TOWER_WIDTH_MIN;
    try {
      const raw = Number(window.localStorage.getItem(STUDIO_TOWER_WIDTH_STORAGE_KEY));
      return Number.isFinite(raw) ? clampStudioTowerWidth(raw) : STUDIO_TOWER_WIDTH_MIN;
    } catch {
      return STUDIO_TOWER_WIDTH_MIN;
    }
  });
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);
  const [settingsMenuTop, setSettingsMenuTop] = useState(48);

  // 用户菜单状态
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const userBtnRef = useRef<HTMLButtonElement>(null);
  const [userMenuTop, setUserMenuTop] = useState(48);
  const [nicknameDraft, setNicknameDraft] = useState(identityUser?.name ?? '');
  const [nicknameSaving, setNicknameSaving] = useState(false);
  const [editingNickname, setEditingNickname] = useState(false);

  useEffect(() => {
    setNicknameDraft(identityUser?.name ?? '');
  }, [identityUser?.name, identityUser?.email]);

  // 点击外部关闭设置菜单
  useEffect(() => {
    if (!settingsOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!settingsRef.current?.contains(event.target as Node)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [settingsOpen]);

  // 点击外部关闭用户菜单
  useEffect(() => {
    if (!userMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!userMenuRef.current?.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [userMenuOpen]);

  // 顶栏 transport 始终是全局的，不随 single / quad 切换成单轨播放
  const masterPlayLabel = workspace.masterPlaying
    ? t(locale, 'globalPause')
    : t(locale, 'globalPlay');

  const saveNicknameInline = async () => {
    if (!onUpdateNickname) {
      onEditNickname?.();
      return;
    }
    const next = nicknameDraft.trim();
    if (!next) return;
    setNicknameSaving(true);
    try {
      await onUpdateNickname(next);
    } finally {
      setNicknameSaving(false);
    }
  };

  return (
    <div className="quad-studio-wrapper">
      {/* --- TOP BAR: Left transport · Center brand · Right project tools --- */}
      <header className="quad-topbar">
        {/* Left: view · pads · play only */}
        <div className="quad-studio-left-cluster">
          <div className="quad-studio-left-group" role="presentation">
            <div className="quad-view-switch" role="group" aria-label="Display mode">
              <button
                type="button"
                className={viewMode === 'single' ? 'is-active' : ''}
                aria-pressed={viewMode === 'single'}
                onClick={() => onSetViewMode('single')}
                title="Single pad view"
              >
                <Square size={13} strokeWidth={2.2} aria-hidden />
              </button>
              <button
                type="button"
                className={viewMode === 'quad' ? 'is-active' : ''}
                aria-pressed={viewMode === 'quad'}
                onClick={() => onSetViewMode('quad')}
                title="Quad view"
              >
                <LayoutGrid size={13} strokeWidth={2.2} aria-hidden />
              </button>
            </div>
          </div>

          {(
            <div className="quad-studio-left-group" role="presentation">
              <div className="quad-studio-tabs" role="tablist">
                {QUAD_PAD_IDS.map((padId) => {
                  const isCurrent = viewMode === 'quad' || selectedPadId === padId;
                  return (
                    <button
                      key={padId}
                      type="button"
                      role="tab"
                      className="quad-studio-tab-btn"
                      data-active={isCurrent ? 'true' : 'false'}
                      aria-selected={isCurrent}
                      onClick={() => { onChoosePad(padId); onSetViewMode('single'); }}
                      style={{
                        borderBottom: isCurrent ? `3px solid ${PAD_COLORS[padId]}` : 'none',
                        background: isCurrent ? 'var(--quad-ink)' : undefined,
                        color: isCurrent ? 'var(--quad-surface)' : undefined,
                      }}
                    >
                      <span>{padId}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 全局 transport：single / quad 都作用于四个 Pad */}
          <div className="quad-studio-left-group" role="presentation">
            <div className="quad-studio-transport-pair" role="group" aria-label="全局操作">
              <span className="quad-global-label">全局</span>
              <button
                type="button"
                className="quad-studio-play-btn"
                data-playing={workspace.masterPlaying ? 'true' : 'false'}
                onClick={workspace.masterPlaying ? onPauseAll : onPlayAll}
                aria-label={masterPlayLabel}
                title={masterPlayLabel}
              >
                {workspace.masterPlaying ? (
                  <Pause size={ICON_MD} strokeWidth={2.25} aria-hidden />
                ) : (
                  <Play size={ICON_MD} strokeWidth={2.25} aria-hidden />
                )}
              </button>
              <button className="quad-studio-icon-btn" type="button" onClick={onRestartAll} title="全局重新起拍" aria-label="全局重新起拍"><RotateCcw size={ICON_SM} /></button>
              <button className="quad-studio-icon-btn" type="button" onClick={onQuickSave} title="全局保存" aria-label="全局保存"><Save size={ICON_MD} /></button>
              <button className="quad-studio-icon-btn quad-global-clear" type="button" onClick={onClearAll} title="清空全部画布" aria-label="清空全部画布"><Trash2 size={ICON_SM} /></button>
            </div>
          </div>

          {/* 全局保存 / 图案库 — 统一 transport 样式 */}
          <div className="quad-studio-left-group" role="presentation">
            <button
              type="button"
              className="quad-studio-transport-btn"
              onClick={onOpenLibrary}
              aria-label={t(locale, 'library')}
            >
              <BookMarked size={ICON_MD} strokeWidth={2.25} aria-hidden />
              <span>{t(locale, 'library')}</span>
            </button>
          </div>
        </div>

        {/* Center: Brand — absolute geometric center (do not break) */}
        <div className="quad-studio-brand-center" aria-label="Brand">
          <img
            className="quad-studio-brand-mark"
            src="/brand/musicanvas-icon.png"
            width={36}
            height={36}
            alt=""
          />
          <div className="quad-studio-brand-copy">
            <h1>音乐画布</h1>
            <p>musicanvas</p>
          </div>
        </div>

        {/* Right: MIDI 端口（全局一端口）· Settings · Account —— 音色已下放到单轨抬头 */}
        <div className="quad-studio-right-tools">
          <div className="quad-studio-io-group" role="group" aria-label="MIDI output">
            <div className="quad-studio-io-select">
              <span
                className="quad-studio-io-select__dot"
                data-connected={selectedOutput ? 'true' : 'false'}
                title={selectedOutput ? `Connected: ${selectedOutput.name}` : 'No external MIDI output'}
              />
              <span className="quad-studio-io-select__label">MIDI</span>
              <SoftSelect
                variant="midi"
                aria-label="MIDI hardware output port"
                value={midiPorts.selectedOutputId ?? ''}
                options={[
                  { value: '', label: 'None' },
                  ...midiPorts.outputs.map((out) => ({
                    value: out.id,
                    label: out.name || out.id,
                  })),
                ]}
                onChange={(next) => onSetSelectedMidiOutputId(next || null)}
              />
              <button
                type="button"
                className="quad-studio-io-select__refresh"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRefreshMidi();
                }}
                title="Refresh MIDI devices"
                aria-label="Refresh MIDI devices"
              >
                <RefreshCw size={13} strokeWidth={2.2} aria-hidden />
              </button>
            </div>
          </div>

          <span className="quad-studio-right-sep" aria-hidden />

          <div className="quad-studio-settings" ref={settingsRef}>
            <button
              ref={settingsBtnRef}
              type="button"
              className={`quad-studio-icon-btn ${settingsOpen ? 'is-active' : ''}`}
              onClick={() => {
                if (settingsBtnRef.current) {
                  const rect = settingsBtnRef.current.getBoundingClientRect();
                  setSettingsMenuTop(rect.bottom + 6);
                }
                setSettingsOpen((open) => !open);
              }}
              aria-expanded={settingsOpen}
              aria-haspopup="menu"
              aria-label="Project settings"
              title="Settings"
            >
              <Settings2 size={ICON_SM} strokeWidth={2.1} aria-hidden />
            </button>

            {settingsOpen && (
              <div
                className="quad-studio-settings__menu"
                role="menu"
                style={{ '--settings-menu-top': `${settingsMenuTop}px` } as React.CSSProperties}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="quad-studio-settings__item"
                  onClick={() => {
                    onToggleTheme();
                  }}
                >
                  {theme === 'lotus' && <Flower2 size={ICON_SM} strokeWidth={2.1} aria-hidden />}
                  {theme === 'ink' && <Droplets size={ICON_SM} strokeWidth={2.1} aria-hidden />}
                  {theme === 'dark' && <Moon size={ICON_SM} strokeWidth={2.1} aria-hidden />}
                  <span>{t(locale, 'theme')}</span>
                  <span className="quad-studio-settings__value">
                    {QUAD_THEME_LABELS[theme]}
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="quad-studio-settings__item"
                  onClick={() => {
                    onToggleNodeLabels();
                  }}
                >
                  <Info size={ICON_SM} strokeWidth={2.1} aria-hidden />
                  <span>{t(locale, 'info')}</span>
                  <span className="quad-studio-settings__value">
                    {showNodeLabels ? 'ON' : 'OFF'}
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={showQuadToolbar}
                  className="quad-studio-settings__item"
                  onClick={toggleQuadToolbar}
                  title={locale === 'zh' ? '在四个画布顶部显示音色、MIDI 通道和常用操作' : 'Show sound, MIDI channel and actions above each pad'}
                >
                  <LayoutGrid size={ICON_SM} strokeWidth={2.1} aria-hidden />
                  <span>{locale === 'zh' ? '四宫格工具栏' : 'Quad toolbar'}</span>
                  <span className="quad-studio-settings__value">{showQuadToolbar ? 'ON' : 'OFF'}</span>
                </button>
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={featherSway}
                  className="quad-studio-settings__item"
                  onClick={() => setFeatherSway(on => !on)}
                  title={locale === 'zh' ? '装饰羽叶随微风柔和弯曲；仅改变显示，保留原音序' : 'Gently sway decorated feathers without changing the musical sequence'}
                >
                  <Wind size={ICON_SM} strokeWidth={2.1} aria-hidden />
                  <span>{locale === 'zh' ? '羽叶摇曳（实验）' : 'Feather sway (experimental)'}</span>
                  <span className="quad-studio-settings__value">{featherSway ? 'ON' : 'OFF'}</span>
                </button>
                {onCycleCanvasBackground && (
                  <button
                    type="button"
                    role="menuitem"
                    className="quad-studio-settings__item"
                    onClick={() => onCycleCanvasBackground()}
                  >
                    <Waves size={ICON_SM} strokeWidth={2.1} aria-hidden />
                    <span>{t(locale, 'canvasBackground')}</span>
                    <span className="quad-studio-settings__value">
                      {CANVAS_BACKGROUND_LABELS[canvasBackgroundPattern]}
                    </span>
                  </button>
                )}
                {onToggleCycleContinue && (
                  <button
                    type="button"
                    role="menuitem"
                    className="quad-studio-settings__item"
                    onClick={() => onToggleCycleContinue()}
                    title="When on, nodes beyond one BPM cycle keep playing at hop timing until the chain ends"
                  >
                    <CornerDownRight size={ICON_SM} strokeWidth={2.1} aria-hidden />
                    <span>{t(locale, 'cycleContinue')}</span>
                    <span className="quad-studio-settings__value">
                      {cycleContinue ? 'ON' : 'OFF'}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  className="quad-studio-settings__item"
                  onClick={() => onToggleLocale?.()}
                >
                  <span className="quad-locale-chip" aria-hidden="true">
                    <em data-on={locale === 'zh' ? 'true' : 'false'}>中</em>
                    <em data-on={locale === 'en' ? 'true' : 'false'}>EN</em>
                  </span>
                  <span>{t(locale, 'language')}</span>
                  <span className="quad-studio-settings__value">
                    {locale === 'zh' ? '中文 / EN' : 'EN / 中文'}
                  </span>
                </button>
                <section className="quad-studio-release-notes" aria-label={locale === 'zh' ? '更新说明' : 'What’s new'}>
                  <h3>{locale === 'zh' ? '更新说明' : 'What’s new'} <span>v0.33.0</span></h3>
                  <time dateTime="2026-09-12">2026-09-12</time>
                  <ul>
                    {(locale === 'zh' ? [
                      '新增完整音序、结构对照与旋律追随；支持和弦、长乐句与独立音色。',
                      '新增 FM 音色分类、三个卡农示例与羽叶装饰。',
                      '设置中可开启四宫格工具栏和羽叶摇曳实验，默认关闭。',
                    ] : [
                      'Sequence atlas, structure comparison and melody following; chords, longer phrases and per-pad sounds.',
                      'FM sound categories, three Canon studies and feather decorations.',
                      'Optional grid toolbars and experimental feather sway in Settings; both off by default.',
                    ]).map(note => <li key={note}>{note}</li>)}
                  </ul>
                </section>
              </div>
            )}
          </div>

          {/* 用户账号入口 — 最右侧 */}
          <div className="quad-user-area" ref={userMenuRef}>
            {identityUser ? (
              <button
                type="button"
                ref={userBtnRef}
                className={`quad-user-avatar-btn ${userMenuOpen ? 'is-active' : ''}`}
                title={identityUser.email}
                aria-label={`Account: ${identityUser.email}`}
                aria-expanded={userMenuOpen}
                aria-haspopup="menu"
                onClick={() => {
                  if (userBtnRef.current) {
                    const rect = userBtnRef.current.getBoundingClientRect();
                    setUserMenuTop(rect.bottom + 6);
                  }
                  setUserMenuOpen(o => !o);
                }}
              >
                <UserCircle2 size={18} strokeWidth={1.8} aria-hidden />
              </button>
            ) : identityUser === null && (
              <button
                type="button"
                className="quad-user-signin-btn"
                title="Sign in"
                aria-label="Sign in"
                onClick={onOpenAuth}
              >
                <LogIn size={ICON_SM} strokeWidth={2.1} aria-hidden />
                <span>{t(locale, 'signIn')}</span>
              </button>
            )}

            {userMenuOpen && identityUser && (
              <div
                className="quad-user-menu"
                role="menu"
                style={{ '--user-menu-top': `${userMenuTop}px` } as React.CSSProperties}
              >
                <div className="quad-user-menu__profile">
                  <UserCircle2 size={28} strokeWidth={1.5} aria-hidden className="quad-user-menu__avatar" />
                  <div className="quad-user-menu__info">
                    {identityUser.name && (
                      <span className="quad-user-menu__name">{identityUser.name}</span>
                    )}
                    <span className="quad-user-menu__email">{identityUser.email}</span>
                  </div>
                </div>
                {identityUser.name && !editingNickname ? (
                  <div className="quad-user-menu__stats">
                    <div>
                      <span>{t(locale, 'nickname')}</span>
                      <strong>{identityUser.name}</strong>
                    </div>
                    <div>
                      <span>{t(locale, 'createdPatterns')}</span>
                      <strong>{createdPatternCount}</strong>
                    </div>
                    <button
                      type="button"
                      className="quad-user-menu__edit"
                      onClick={() => {
                        setNicknameDraft(identityUser.name ?? '');
                        setEditingNickname(true);
                      }}
                    >{t(locale, 'editNickname')}</button>
                  </div>
                ) : (
                  <div className="quad-user-menu__account">
                    <label>
                      <span>{t(locale, 'nickname')}</span>
                      <input
                        value={nicknameDraft}
                        maxLength={40}
                        placeholder="Nickname"
                        onChange={(event) => setNicknameDraft(event.currentTarget.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            void saveNicknameInline().then(() => setEditingNickname(false));
                          }
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={nicknameSaving || !nicknameDraft.trim()}
                      onClick={() => void saveNicknameInline().then(() => setEditingNickname(false))}
                    >
                      {nicknameSaving ? '…' : t(locale, 'saveNickname')}
                    </button>
                  </div>
                )}
                <hr className="quad-user-menu__sep" />
                <button
                  type="button"
                  role="menuitem"
                  className="quad-user-menu__item quad-user-menu__item--danger"
                  onClick={() => { onSignOut?.(); setUserMenuOpen(false); }}
                >
                  <LogOut size={ICON_SM} strokeWidth={2.1} aria-hidden />
                  <span>{t(locale, 'signOut')}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* --- MAIN BODY --- */}
      <div
        className="quad-studio-body"
        data-sidebar-collapsed={sidebarCollapsed ? 'true' : undefined}
      >
        <StudioSidebar sequencePanel={props.sequencePanel} sequenceAtlas={props.sequenceAtlas} structureMap={props.structureMap} melodyFollow={props.melodyFollow}
          comparisonPads={padViews.map(p => ({ id: p.id, phase: p.cyclePhase, steps: Math.round(getPadCycleDurationMs(p.timingPad) / (p.timingPad.intervalMs / 4)), bpm: Math.round(60000 / p.timingPad.intervalMs), playing: p.playing }))}
          overviewPads={padViews.map(p => ({ ...p.timingPad, playing: p.playing }))}
          selectedPadId={selectedPadId}
          allPads={QUAD_PAD_IDS.map(id => workspace.pads[id])}
          onPatchAllTiming={onPatchAllTiming}
          onRestartAll={onRestartAll}
          selectedPad={selectedPad}
          selectedNode={selectedNode}
          selectedScale={selectedScale}
          selectedMotion={selectedMotion}
          drawStatus={drawStatus}
          selectedBasePresentations={selectedBasePresentations}
          selectedBPresentations={selectedBPresentations}
          currentTrace={selectedTrace.current}
          nextTrace={selectedTrace.next}
          cyclePhase={selectedVisibleCycle.phase}
          currentTracePresentations={currentTracePresentations}
          nextTracePresentations={nextTracePresentations}
          showCycleMapLabels={nodeLabelVisibility.cycleMap}
          cycleMapOpen={cycleDrawerOpen}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
          widthPx={towerWidthPx}
          onWidthChange={(next) => {
            const width = clampStudioTowerWidth(next);
            setTowerWidthPx(width);
            try {
              window.localStorage.setItem(STUDIO_TOWER_WIDTH_STORAGE_KEY, String(width));
            } catch {
              /* ignore */
            }
          }}
          onPatchSelectedPad={onPatchSelectedPad}
          onRestartSelectedPad={onRestartSelectedPad}
          onPatchSelectedNode={onPatchSelectedNode}
          onToggleEndpointPitch={onToggleEndpointPitch}
          onChangeSelectedMotion={onChangeSelectedMotion}
          onSelectNode={onSelectNode}
          groupNodeIds={groupNodeIds}
          groupMotionMode={groupMotionMode}
          groupRateCycles={groupRateCycles}
          groupRadius={groupRadius}
          formationFocus={formationFocus}
          padFormations={padFormations}
          activeFormation={activeFormation}
          onCopyNotes={onCopyNotes}
          onPasteNotes={onPasteNotes}
          canPasteNotes={canPasteNotes}
          onReorderGroupNode={onReorderGroupNode}
          onSelectGroupPrimary={onSelectGroupPrimary}
          onSelectFormation={(formationId) => onSelectFormation(selectedPadId, formationId)}
          onDissolveFormation={() => onDissolveFormation(selectedPadId)}
          onToggleFormationMuted={onToggleFormationMuted}
          onToggleFormationHidden={onToggleFormationHidden}
          onChangeGroupMotionMode={onChangeGroupMotionMode}
          onChangeGroupRateCycles={onChangeGroupRateCycles}
          onChangeGroupRadius={onChangeGroupRadius}
          onToggleCycleMap={() => onSetCycleDrawerOpen(!cycleDrawerOpen)}
        />

        <main
          className="quad-studio-stage"
          data-view-mode={viewMode}
          data-sidebar-collapsed={sidebarCollapsed ? 'true' : undefined}
        >
          <QuadLilyCanvas
            pads={padViews}
            layout={viewMode}
            showQuadToolbar={showQuadToolbar}
            featherSway={featherSway}
            onFocusPad={id => { onChoosePad(id); onSetViewMode(viewMode === 'single' ? 'quad' : 'single'); }}
            showNodeLabels={nodeLabelVisibility.canvas}
            mobilePadId={selectedPadId}
            onSelectPad={onChoosePad}
            onAddNode={onAddNode}
            onNodePointerDown={onStartNodeDrag}
            onSelectFormation={onSelectFormation}
            onFormationPointerDown={onStartFormationDrag}
            onDeleteNode={onRemoveNode}
            onTogglePlaying={onTogglePadPlaying}
            onToggleLocked={onTogglePadLocked}
            onPatchNode={onPatchNode}
            canvasBackgroundPattern={canvasBackgroundPattern}
            /* 单轨抬头工具条 */
            locale={locale}
            soundPresetId={soundPresetId}
            onSetSoundPreset={onSetSoundPresetId}
            midiConnected={Boolean(selectedOutput)}
            onSetPadMidiChannel={onSetPadMidiChannel}
            onClearPad={onClearPad}
            onSavePad={onQuickSavePad}
            onToggleInfo={onToggleNodeLabels}
          />

          {/* 快捷键卡：画布 LOCK 下方，默认折叠 */}
          <section
            className={`quad-shortcuts-card ${shortcutsOpen ? 'is-open' : ''}`}
            aria-label="键盘快捷键指引"
          >
            <button
              type="button"
              className="quad-shortcuts-card__toggle"
              aria-expanded={shortcutsOpen}
              onClick={() => setShortcutsOpen((open) => !open)}
            >
              <span>快捷键</span>
              <span className="quad-shortcuts-card__toggle-hint">
                {shortcutsOpen ? '收起 ▴' : '展开 ▾'}
              </span>
            </button>
            <div className="quad-shortcuts-card__body">
              <div className="quad-shortcuts-grid">
                <div className="quad-shortcut-row">
                  <div className="quad-shortcut-badges">
                    <kbd>Space</kbd>
                  </div>
                  <span>当前 Pad 播放 / 暂停</span>
                </div>
                <div className="quad-shortcut-row">
                  <div className="quad-shortcut-badges">
                    <kbd>1</kbd> / <kbd>4</kbd>
                  </div>
                  <span>单 Pad / 四 Pad</span>
                </div>
                <div className="quad-shortcut-row">
                  <div className="quad-shortcut-badges">
                    <kbd>D</kbd>
                  </div>
                  <span>DRAW 待命 / 取消</span>
                </div>
                <div className="quad-shortcut-row">
                  <div className="quad-shortcut-badges">
                    <kbd>Ctrl</kbd> + 点击
                  </div>
                  <span>组合多选音符</span>
                </div>
                <div className="quad-shortcut-row">
                  <div className="quad-shortcut-badges">
                    <kbd>F</kbd>
                  </div>
                  <span>闪烁待命 / 取消</span>
                </div>
                <div className="quad-shortcut-row">
                  <div className="quad-shortcut-badges">
                    <kbd>Esc</kbd>
                  </div>
                  <span>取消轨迹待命 / 退出</span>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};
