export interface TransportKeyInput {
  code: string;
  repeat?: boolean;
  defaultPrevented?: boolean;
  tagName?: string;
  isContentEditable?: boolean;
  role?: string | null;
  /** 保留字段：兼容旧调用；全局快捷键不再依赖它 */
  transportSurface?: boolean;
}

/** 真正在「打字」的表面：空格应留给输入，而不是运输控制 */
const TYPING_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA']);

/**
 * Space 是否应由运输层接管。
 * 按钮/链接获得焦点时也要接管，避免空格去「点」当前焦点按钮。
 * 仅在输入框 / 可编辑区域放行。
 */
export function shouldCaptureTransportKey(input: TransportKeyInput): boolean {
  if (input.code !== 'Space' || input.defaultPrevented) return false;
  if (input.isContentEditable) return false;
  return !TYPING_TAGS.has((input.tagName ?? '').toUpperCase());
}

export function shouldToggleTransport(input: TransportKeyInput): boolean {
  return !input.repeat && shouldCaptureTransportKey(input);
}
