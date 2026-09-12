import { useUiText } from '../uiLocale';
/**
 * AuthModal — 登录 / 注册 / 找回密码 弹窗
 *
 * 设计原则：
 *  - 无外部 UI 库依赖，样式纯 CSS 变量 + auth.css
 *  - 面向中文用户的默认文案
 *  - 支持邮箱+密码注册/登录，以及 Google OAuth 跳转
 */
import React, { useEffect, useRef, useState } from 'react';
import type { UseIdentityResult } from './useIdentity.ts';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIREMENT_HINT,
  validateSignupPassword,
} from './passwordPolicy.ts';
import './auth.css';

export type AuthModalMode = 'login' | 'signup' | 'recovery';

interface AuthModalProps {
  open: boolean;
  mode?: AuthModalMode;
  identity: UseIdentityResult;
  onClose(): void;
}

export function AuthModal({ open, mode: initialMode = 'login', identity, onClose }: AuthModalProps) {
  const tr = useUiText();
  const [mode, setMode] = useState<AuthModalMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [localMsg, setLocalMsg] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // 切换 mode 时重置表单状态
  useEffect(() => {
    setMode(initialMode);
  }, [initialMode, open]);

  useEffect(() => {
    if (open) {
      setLocalMsg(null);
      identity.clearError();
      // 短暂延迟后聚焦，避免动画期间抢焦点
      const t = setTimeout(() => emailRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ESC 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  // ---- 表单提交 ----
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalMsg(null);
    identity.clearError();

    // 注册：昵称必填 + 前端强制密码策略
    if (mode === 'signup') {
      if (!name.trim()) {
        setLocalMsg(tr("请填写昵称。"));
        return;
      }
      const passwordError = validateSignupPassword(password);
      if (passwordError) {
        setLocalMsg(passwordError);
        return;
      }
    }

    try {
      if (mode === 'login') {
        await identity.login(email, password);
        onClose();
      } else if (mode === 'signup') {
        await identity.signup(email, password, name.trim());
        if (identity.user?.token) {
          // 已自动确认（Autoconfirm ON）
          onClose();
        } else {
          setLocalMsg(tr("请查收邮箱完成确认，再回来登录。"));
          setMode('login');
        }
      } else {
        // recovery
        await identity.requestPasswordRecovery(email);
        setLocalMsg(tr("重置密码邮件已发送，请查收收件箱。"));
        setMode('login');
      }
    } catch {
      // error 已在 hook 里 setError，这里不重复处理
    }
  };

  const displayError = identity.oauthPending || !identity.error ? null : tr(identity.error);
  const displayMsg = localMsg ? tr(localMsg) : null;
  const oauthLabel = identity.oauthPending === 'github' ? 'GitHub' : 'Google';

  return (
    <div
      className="auth-layer"
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'login' ? tr("登录") : mode === 'signup' ? tr("创建账户") : tr("重置密码")}
    >
      {/* 半透明遮罩 */}
      <div
        ref={backdropRef}
        className="auth-backdrop"
        aria-hidden="true"
        onClick={onClose}
      />

      <div className="auth-card">
        {/* 头部 */}
        <div className="auth-card__header">
          <span className="auth-card__eyebrow">MUSICANVAS</span>
          <h2 className="auth-card__title">
            {mode === 'login' && tr("登录")}
            {mode === 'signup' && tr("创建账户")}
            {mode === 'recovery' && tr("重置密码")}
          </h2>
          <button
            type="button"
            className="auth-card__close"
            aria-label={tr("关闭")}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* OAuth 跳转中：旋转 loading，成功会离开页面，失败才显示红字 */}
        {identity.oauthPending && (
          <div className="auth-notice auth-notice--progress" role="status" aria-live="polite">
            <span className="auth-spinner" aria-hidden="true" />
            <span>{tr("正在跳转到")} {oauthLabel}…</span>
          </div>
        )}

        {/* 消息提示 */}
        {(displayError || displayMsg) && (
          <div
            className={`auth-notice ${displayError ? 'auth-notice--error' : 'auth-notice--info'}`}
            role="alert"
          >
            {displayError ?? displayMsg}
          </div>
        )}

        {/* 表单 */}
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {mode === 'signup' && (
            <label className="auth-field">
              <span>{tr("昵称")}</span>
              <input
                type="text"
                autoComplete="nickname"
                required
                maxLength={40}
                value={name}
                onChange={e => {
                  setName(e.target.value);
                  if (localMsg) setLocalMsg(null);
                }}
                placeholder={tr("怎么称呼你")}
              />
            </label>
          )}

          <label className="auth-field">
            <span>{tr("邮箱")}</span>
            <input
              ref={emailRef}
              type="email"
              autoComplete={mode === 'signup' ? 'email' : 'username'}
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>

          {mode !== 'recovery' && (
            <label className="auth-field">
              <span>{tr("密码")}</span>
              <input
                type="password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                required
                minLength={mode === 'signup' ? PASSWORD_MIN_LENGTH : undefined}
                value={password}
                onChange={e => {
                  setPassword(e.target.value);
                  if (mode === 'signup' && localMsg) setLocalMsg(null);
                }}
                placeholder={mode === 'signup' ? tr(PASSWORD_REQUIREMENT_HINT) : '••••••••'}
                aria-describedby={mode === 'signup' ? 'auth-password-hint' : undefined}
              />
              {mode === 'signup' && (
                <span id="auth-password-hint" className="auth-field__hint">
                  {tr(PASSWORD_REQUIREMENT_HINT)}
                </span>
              )}
            </label>
          )}

          <button
            type="submit"
            className="auth-btn auth-btn--primary"
            disabled={identity.loading}
          >
            {identity.loading ? tr("请稍候…") : (
              mode === 'login' ? tr("登录")
              : mode === 'signup' ? tr("创建账户")
              : tr("发送重置链接")
            )}
          </button>
        </form>

        {/* Google OAuth（Netlify Identity 默认配置，免费可用） */}
        {mode !== 'recovery' && (
          <>
            <div className="auth-divider"><span>{tr("或")}</span></div>
            <div className="auth-oauth">
              <button
                type="button"
                className="auth-btn auth-btn--oauth auth-btn--oauth-full"
                disabled={Boolean(identity.oauthPending) || identity.loading}
                onClick={() => {
                  setLocalMsg(null);
                  identity.oauthLogin('google');
                }}
              >
                {identity.oauthPending === 'google' ? (
                  <span className="auth-spinner auth-spinner--on-dark" aria-hidden="true" />
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden width="16" height="16">
                    <path fill="#4285F4" d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/>
                    <path fill="#34A853" d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.615 24 12.255 24z"/>
                    <path fill="#FBBC05" d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 0 0 0 10.76l3.98-3.09z"/>
                    <path fill="#EA4335" d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0c-4.64 0-8.74 2.7-10.71 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/>
                  </svg>
                )}
                {identity.oauthPending === 'google' ? tr("正在跳转…") : tr("使用 Google 继续")}
              </button>
            </div>
          </>
        )}

        {/* 模式切换链接 */}
        <div className="auth-footer">
          {mode === 'login' && (
            <>
              <button type="button" className="auth-link" onClick={() => { setMode('signup'); identity.clearError(); }}>
                {tr("没有账号？去注册")}</button>
              <button type="button" className="auth-link" onClick={() => { setMode('recovery'); identity.clearError(); }}>
                {tr("忘记密码？")}</button>
            </>
          )}
          {mode === 'signup' && (
            <button type="button" className="auth-link" onClick={() => { setMode('login'); identity.clearError(); }}>
              {tr("已有账号？去登录")}</button>
          )}
          {mode === 'recovery' && (
            <button type="button" className="auth-link" onClick={() => { setMode('login'); identity.clearError(); }}>
              {tr("返回登录")}</button>
          )}
        </div>

        {/* 底部版本号：占位避免留白（暂定 0.31） */}
        <p className="auth-version">MUSICANVAS v0.31</p>
      </div>
    </div>
  );
}
