'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/request-api';

// ==================== 会话状态（cookie 为唯一事实来源） ====================

export interface AuthUser {
  uid: string;
  username: string;
  role: 'admin' | 'user';
}

type Listener = (user: AuthUser | null) => void;

// undefined = 尚未向服务端查询过
const authStore: {
  user: AuthUser | null | undefined;
  fetching: boolean;
  listeners: Set<Listener>;
} = { user: undefined, fetching: false, listeners: new Set() };

function emit(user: AuthUser | null) {
  authStore.user = user;
  authStore.listeners.forEach((l) => l(user));
}

async function refreshMe(): Promise<void> {
  if (authStore.fetching) return;
  authStore.fetching = true;
  try {
    const res = await apiFetch('/api/auth/me');
    if (!res.ok) {
      emit(null);
      return;
    }
    const d = await res.json();
    emit({ uid: d.uid, username: d.username, role: d.role });
  } catch {
    emit(null);
  } finally {
    authStore.fetching = false;
  }
}

interface UseAuthReturn {
  user: AuthUser | null;
  uid: string | null;
  loading: boolean;
  logout: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<AuthUser | null>(authStore.user ?? null);
  const [loading, setLoading] = useState(authStore.user === undefined);

  useEffect(() => {
    // useState 初始值已捕获当前 store.user；此处只补首次查询与后续变更订阅
    if (authStore.user === undefined) void refreshMe();
    authStore.listeners.add(setUser);
    return () => {
      authStore.listeners.delete(setUser);
    };
  }, []);

  const logout = useCallback(async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    emit(null);
  }, []);

  return { user, uid: user?.uid ?? null, loading, logout };
}

// ==================== 登录弹窗 ====================

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

// /api/auth/login 的 error 码 → 用户可读文案
export const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  missing_credentials: '请输入用户名和密码',
  invalid_credentials: '用户名或密码错误',
  too_many_attempts: '尝试次数过多，请 15 分钟后再试',
  server_error: '服务异常，请稍后再试',
};

export function LoginModal({ isOpen, onClose, onSuccess }: LoginModalProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleClose = () => {
    setUsername('');
    setPassword('');
    setError(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('请输入用户名和密码');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(LOGIN_ERROR_MESSAGES[data.error] || data.message || '登录失败');
        return;
      }
      await refreshMe();
      onSuccess?.();
      handleClose();
    } catch {
      setError('网络错误，请稍后再试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

      {/* Modal */}
      <div className="relative w-full max-w-sm mx-4 bg-[#ffffff] dark:bg-[#1c1c1e] rounded-2xl shadow-2xl border border-[#e5e5ea] dark:border-[#38383a] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5e5ea] dark:border-[#38383a]">
          <h2 className="text-lg font-semibold text-[#000000] dark:text-[#ffffff]">登录账号</h2>
          <button onClick={handleClose} className="p-1 text-[#8e8e93] hover:text-[#000000] dark:hover:text-[#ffffff]">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--foreground-secondary)]">用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="输入用户名"
              disabled={loading}
              autoComplete="username"
              className="w-full px-4 py-3 bg-[#f2f2f7] dark:bg-[#2c2c2e] rounded-xl text-[#000000] dark:text-[#ffffff] placeholder:text-[#8e8e93] text-[15px] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 disabled:opacity-60"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--foreground-secondary)]">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="输入密码"
              disabled={loading}
              autoComplete="current-password"
              className="w-full px-4 py-3 bg-[#f2f2f7] dark:bg-[#2c2c2e] rounded-xl text-[#000000] dark:text-[#ffffff] placeholder:text-[#8e8e93] text-[15px] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 disabled:opacity-60"
            />
          </div>

          {error && (
            <div className="px-4 py-2.5 bg-[#FF3B30]/10 border border-[#FF3B30]/20 rounded-lg text-sm text-[#FF3B30]">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-[#007AFF] text-white rounded-xl text-sm font-medium disabled:opacity-50 disabled:active:scale-100 transition-all active:scale-[0.98]"
          >
            {loading ? '登录中...' : '登录'}
          </button>

          <p className="text-xs text-[#8e8e93] text-center">演示账号由部署者创建，本地运行步骤见 README</p>
        </form>
      </div>
    </div>
  );
}

// ==================== Account Status Button ====================

interface AccountStatusProps {
  user: AuthUser | null;
  onLogout: () => void;
  onLoginClick: () => void;
}

export function AccountStatus({ user, onLogout, onLoginClick }: AccountStatusProps) {
  const [showMenu, setShowMenu] = useState(false);

  if (user) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--background-secondary)] text-sm text-[var(--foreground-secondary)]"
        >
          <div className="w-6 h-6 rounded-full bg-[#007AFF]/20 flex items-center justify-center text-xs text-[#007AFF] font-medium">
            {user.username?.[0]?.toUpperCase() || 'U'}
          </div>
          <span className="font-medium">{user.username || '账号'}</span>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showMenu && (
          <div className="absolute top-full right-0 mt-1 bg-[var(--card-bg)] rounded-xl shadow-lg border border-[var(--border)] py-1 min-w-[120px] z-10">
            <button
              onClick={() => { onLogout(); setShowMenu(false); }}
              className="w-full px-4 py-2 text-left text-sm text-[var(--foreground-secondary)] hover:bg-[var(--background-secondary)]"
            >
              退出登录
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={onLoginClick}
      className="px-4 py-1.5 bg-[#007AFF] text-white rounded-full text-sm font-medium"
    >
      登录
    </button>
  );
}
