/**
 * 轻量中英文案表。默认中文；必要专有名词保留英文。
 */
export type AppLocale = 'zh' | 'en';

export const LOCALE_STORAGE_KEY = 'gemidi.quad-lily.locale.v1';

const ZH = {
  play: '播放',
  pause: '暂停',
  resume: '继续',
  save: '保存',
  /** 顶栏全局 transport：始终作用于四个 Pad */
  globalPlay: '全局播放',
  globalPause: '全局暂停',
  /** 顶栏全局保存：整个 workspace 存成一张四宫格组图卡片 */
  globalSave: '全局保存',
  /** 单轨抬头：只保存当前 Pad */
  savePad: '存轨',
  clear: '清空',
  sound: '音色',
  channel: '通道',
  library: '图案库',
  signIn: '登录',
  signOut: '退出登录',
  account: '账号',
  nickname: '昵称',
  saveNickname: '保存昵称',
  theme: '主题',
  info: '信息',
  language: '语言',
  /** 设置菜单：画布荷塘背景装饰 */
  canvasBackground: '画布背景',
  /** 设置：超周期节点按 BPM 跳时继续播完 */
  cycleContinue: '延续播放',
  publish: '发布',
  publishing: '发布中…',
  load: '载入',
  loadAll: '载入全部',
  delete: '删除',
  import: '导入',
  export: '导出',
  saveAll: '保存全部',
  close: '关闭',
  publishOk: '已发布到图案广场',
  publishFail: '发布失败',
  nicknameRequired: '请先设置昵称，再发布到图案广场',
  nicknamePrompt: '设置一个昵称，发布图案时会显示给其他人',
  editNickname: '修改昵称',
  createdPatterns: '已创建图案',
} as const;

const EN: Record<keyof typeof ZH, string> = {
  play: 'Play',
  pause: 'Pause',
  resume: 'Resume',
  save: 'Save',
  globalPlay: 'Global Play',
  globalPause: 'Global Pause',
  globalSave: 'Global Save',
  savePad: 'Save Pad',
  clear: 'Clear',
  sound: 'Sound',
  channel: 'CH',
  library: 'Library',
  signIn: 'Sign in',
  signOut: 'Sign out',
  account: 'Account',
  nickname: 'Nickname',
  saveNickname: 'Save nickname',
  theme: 'Theme',
  info: 'Info',
  language: 'Language',
  canvasBackground: 'Canvas background',
  cycleContinue: 'Continue chain',
  publish: 'Publish',
  publishing: 'Publishing…',
  load: 'Load',
  loadAll: 'Load all',
  delete: 'Delete',
  import: 'Import',
  export: 'Export',
  saveAll: 'Save all',
  close: 'Close',
  publishOk: 'Published to Pattern Plaza',
  publishFail: 'Publish failed',
  nicknameRequired: 'Set a nickname before publishing',
  nicknamePrompt: 'Choose a nickname shown when you publish patterns',
  editNickname: 'Edit nickname',
  createdPatterns: 'Created patterns',
};

export type LocaleKey = keyof typeof ZH;

export function restoreLocale(value: unknown): AppLocale {
  return value === 'en' ? 'en' : 'zh';
}

export function t(locale: AppLocale, key: LocaleKey): string {
  return (locale === 'en' ? EN : ZH)[key];
}

export function toggleLocale(locale: AppLocale): AppLocale {
  return locale === 'zh' ? 'en' : 'zh';
}
