/**
 * useIdentity — Netlify Identity 认证状态 Hook
 *
 * 封装 @netlify/identity 的核心流程：
 *  - 页面加载时处理 OAuth / 邮件确认回调
 *  - 订阅 onAuthChange 事件保持用户状态同步
 *  - 暴露 login / signup / logout / oauthLogin 操作
 *
 * 注意：Netlify Identity 不支持 `netlify dev` 本地调试，
 * 需 deploy 到 Netlify 后才能完整测试认证功能。
 * 本地开发时 getUser() 始终返回 null，应用会回退到 Library Key 模式。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { validateSignupPassword } from './passwordPolicy.ts';

// @netlify/identity 在 SSR 环境可能不存在 window，做懒加载
async function getIdentityModule() {
  return import('@netlify/identity');
}

export interface IdentityUser {
  id: string;
  email: string;
  name?: string;
  /** Netlify 颁发的 JWT access token，用于 API 鉴权 */
  token?: { access_token: string; expires_at: number } | null;
}

export type AuthMode = 'login' | 'signup' | 'recovery';

export interface UseIdentityResult {
  /** 当前登录用户，null 表示未登录，undefined 表示初始化中 */
  user: IdentityUser | null | undefined;
  loading: boolean;
  /** OAuth 跳转进行中（显示进度，不立刻报错） */
  oauthPending: 'google' | 'github' | null;
  error: string | null;

  login(email: string, password: string): Promise<void>;
  signup(email: string, password: string, name?: string): Promise<void>;
  logout(): Promise<void>;
  oauthLogin(provider: 'google' | 'github'): void;
  requestPasswordRecovery(email: string): Promise<void>;
  /** 更新昵称（写入 Identity user_metadata.full_name） */
  updateNickname(nickname: string): Promise<void>;
  clearError(): void;
}

export function useIdentity(): UseIdentityResult {
  // undefined = 初始化中；null = 未登录；IdentityUser = 已登录
  const [user, setUser] = useState<IdentityUser | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [oauthPending, setOauthPending] = useState<'google' | 'github' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const oauthFailTimerRef = useRef<number | null>(null);

  const clearOauthFailTimer = useCallback(() => {
    if (oauthFailTimerRef.current !== null) {
      window.clearTimeout(oauthFailTimerRef.current);
      oauthFailTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearOauthFailTimer(), [clearOauthFailTimer]);

  // ---- 初始化：处理回调 + 订阅状态变化 ----
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    (async () => {
      try {
        const identity = await getIdentityModule();

        // 处理 OAuth / 邮件确认 / 密码重置等回调
        try {
          await identity.handleAuthCallback();
        } catch {
          // 回调处理失败不阻断应用启动
        }

        // 读取当前用户
        const current = await identity.getUser();
        setUser(current ? sanitizeUser(current) : null);

        // 订阅后续变化
        unsubscribe = identity.onAuthChange((_event, nextUser) => {
          setUser(nextUser ? sanitizeUser(nextUser) : null);
        });
      } catch {
        // Identity 未配置（本地开发）时静默降级
        setUser(null);
      }
    })();

    return () => unsubscribe?.();
  }, []);

  // ---- 登录 ----
  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const identity = await getIdentityModule();
      const loggedIn = await identity.login(email, password);
      setUser(sanitizeUser(loggedIn));
    } catch (err) {
      setError(extractMessage(err));
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // ---- 注册 ----
  const signup = useCallback(async (email: string, password: string, name?: string) => {
    setLoading(true);
    setError(null);
    try {
      const passwordError = validateSignupPassword(password);
      if (passwordError) {
        setError(passwordError);
        throw new Error(passwordError);
      }
      const identity = await getIdentityModule();
      const registered = await identity.signup(
        email,
        password,
        name ? { full_name: name } : undefined,
      );
      setUser(sanitizeUser(registered));
    } catch (err) {
      setError(extractMessage(err));
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // ---- 登出 ----
  const logout = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const identity = await getIdentityModule();
      await identity.logout();
      setUser(null);
    } catch (err) {
      setError(extractMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // ---- OAuth 跳转（成功则整页离开；失败才延迟报错） ----
  const oauthLogin = useCallback((provider: 'google' | 'github') => {
    clearOauthFailTimer();
    setError(null);
    setOauthPending(provider);

    // 跳转通常需要几百毫秒到数秒；立刻红字会误报。
    // 若页面已成功跳走，定时器随卸载清除；仍停在本页才显示失败。
    oauthFailTimerRef.current = window.setTimeout(() => {
      oauthFailTimerRef.current = null;
      setOauthPending(null);
      setError(
        provider === 'google'
          ? 'Google 登录未完成，请重试，或改用邮箱登录。'
          : 'GitHub 登录未完成，请重试，或改用邮箱登录。',
      );
    }, 3200);

    getIdentityModule()
      .then((identity) => {
        // oauthLogin 会发起浏览器跳转；此处不要同步 setError
        identity.oauthLogin(provider);
      })
      .catch(() => {
        // 模块不可用时也不立刻红字，等宽限期结束再提示
      });
  }, [clearOauthFailTimer]);

  // ---- 找回密码邮件 ----
  const requestPasswordRecovery = useCallback(async (email: string) => {
    setLoading(true);
    setError(null);
    try {
      const identity = await getIdentityModule();
      await identity.requestPasswordRecovery(email);
    } catch (err) {
      setError(extractMessage(err));
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // ---- 更新昵称（发布到图案广场时显示） ----
  const updateNickname = useCallback(async (nickname: string) => {
    const trimmed = nickname.trim().slice(0, 40);
    if (!trimmed) {
      const message = '昵称不能为空。';
      setError(message);
      throw new Error(message);
    }
    setLoading(true);
    setError(null);
    try {
      const identity = await getIdentityModule();
      const updated = await identity.updateUser({ data: { full_name: trimmed } });
      setUser(sanitizeUser(updated));
    } catch (err) {
      setError(extractMessage(err));
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearError = useCallback(() => {
    clearOauthFailTimer();
    setOauthPending(null);
    setError(null);
  }, [clearOauthFailTimer]);

  return {
    user,
    loading,
    oauthPending,
    error,
    login,
    signup,
    logout,
    oauthLogin,
    requestPasswordRecovery,
    updateNickname,
    clearError,
  };
}

// ---- 辅助函数 ----

/** 从 Netlify Identity 原始用户对象中提取所需字段 */
function sanitizeUser(raw: unknown): IdentityUser {
  const r = raw as Record<string, unknown>;
  const meta = typeof r.userMetadata === 'object' && r.userMetadata !== null
    ? r.userMetadata as Record<string, unknown>
    : typeof r.user_metadata === 'object' && r.user_metadata !== null
      ? r.user_metadata as Record<string, unknown>
      : null;
  const fromMeta = meta
    ? String(meta.full_name ?? meta.name ?? meta.nickname ?? '')
    : '';
  const name = String(r.name ?? fromMeta).trim() || undefined;
  return {
    id: String(r.id ?? ''),
    email: String(r.email ?? ''),
    name,
    token: r.token as IdentityUser['token'],
  };
}

function extractMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return '发生未知错误。';
}
