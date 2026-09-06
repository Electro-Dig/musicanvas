/**
 * 首次登录强制登记昵称；也可复用为「补全昵称」弹窗。
 */
import { FormEvent, useEffect, useRef, useState } from 'react';
import type { UseIdentityResult } from './useIdentity.ts';
import './auth.css';

export interface NicknameModalProps {
  open: boolean;
  identity: UseIdentityResult;
  /** 是否允许关闭（账号信息里编辑时可关；首次强制登记不可关） */
  dismissible?: boolean;
  onClose?(): void;
  onSaved?(): void;
}

export function NicknameModal({
  open,
  identity,
  dismissible = false,
  onClose,
  onSaved,
}: NicknameModalProps) {
  const [nickname, setNickname] = useState(identity.user?.name ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setNickname(identity.user?.name ?? '');
    const id = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(id);
  }, [open, identity.user?.name]);

  if (!open) return null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await identity.updateNickname(nickname);
      onSaved?.();
      onClose?.();
    } catch {
      // error 已写在 identity.error
    }
  };

  return (
    <div className="auth-layer" role="dialog" aria-modal="true" aria-labelledby="nickname-modal-title">
      <div
        className="auth-backdrop"
        onClick={dismissible ? onClose : undefined}
        aria-hidden
      />
      <div className="auth-card">
        <header className="auth-card__header">
          <span className="auth-card__eyebrow">账户</span>
          <h2 id="nickname-modal-title" className="auth-card__title">设置昵称</h2>
          {dismissible && (
            <button
              type="button"
              className="auth-card__close"
              aria-label="关闭"
              onClick={onClose}
            >×</button>
          )}
        </header>
        <form className="auth-form" onSubmit={(e) => void handleSubmit(e)}>
            <p className={`auth-notice ${identity.error ? 'auth-notice--error' : 'auth-notice--info'}`} role="alert">
              {identity.error || '图谱广场署名需要昵称。'}
            </p>
            <label className="auth-field">
              <span>昵称</span>
              <input
                ref={inputRef}
                value={nickname}
                maxLength={40}
                autoComplete="nickname"
                placeholder="怎么称呼你"
                required
                onChange={(event) => setNickname(event.currentTarget.value)}
              />
            </label>
            <button
              type="submit"
              className="auth-btn auth-btn--primary"
              disabled={identity.loading || !nickname.trim()}
            >
              {identity.loading ? '保存中…' : '保存昵称'}
            </button>
          </form>
      </div>
    </div>
  );
}
