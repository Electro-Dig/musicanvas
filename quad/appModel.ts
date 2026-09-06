export interface QuadActionView {
  id: string;
  label: string;
}

export interface QuadFieldView {
  id: string;
  label: string;
}

export interface QuadLilyAppView {
  title: string;
  subtitle: string;
  fm1StatusLabel: string;
  masterActions: QuadActionView[];
  editorFields: QuadFieldView[];
  voiceActions: QuadActionView[];
}

export function createQuadLilyAppView(): QuadLilyAppView {
  return {
    title: 'MUSICANVAS',
    subtitle: '让音符在平面上动起来',
    fm1StatusLabel: 'FM-1 当前音色 · 4 PAD 共享',
    masterActions: [
      { id: 'play-all', label: '全部播放' },
      { id: 'pause-all', label: '全部暂停' },
      { id: 'restart-all', label: '同步重启' },
    ],
    editorFields: [
      { id: 'interval', label: 'Interval' },
      { id: 'root', label: '根音' },
      { id: 'scale', label: '音阶' },
      { id: 'octave', label: '八度' },
      { id: 'velocity', label: '力度' },
    ],
    voiceActions: [
      { id: 'remember-voice', label: '记住当前 Voice' },
      { id: 'recall-voice', label: '召回 Voice' },
    ],
  };
}
