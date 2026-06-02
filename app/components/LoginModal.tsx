'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getCurrentUser,
  signInWithPassword,
  signUpUsername,
  signOut,
  onAuthStateChange,
  type TCBUser,
} from '@/lib/tcb';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: TCBUser) => void;
}

export function LoginModal({ isOpen, onClose, onSuccess }: LoginModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState(''); // username
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError('请输入用户名和密码');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { user } = await signInWithPassword(identifier.trim(), password);
      onSuccess(user);
      onClose();
    } catch (err: any) {
      setError(err.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) {
      setError('请输入用户名（5-24位，字母或数字开头）');
      return;
    }
    if (password.length < 6) {
      setError('密码至少6位');
      return;
    }
    if (password !== confirmPassword) {
      setError('两次密码不一致');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { user } = await signUpUsername(identifier.trim(), password);
      onSuccess(user);
      onClose();
    } catch (err: any) {
      setError(err.message || '注册失败');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-sm mx-4 bg-[--card-bg] rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[--border]">
          <h2 className="text-lg font-semibold text-[--foreground]">
            {mode === 'login' ? '登录账号' : '注册账号'}
          </h2>
          <button onClick={onClose} className="p-1 text-[--foreground-tertiary] hover:text-[--foreground]">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={mode === 'login' ? handleLogin : handleRegister} className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[--foreground-secondary]">用户名</label>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="字母或数字，5-24位"
              className="w-full px-4 py-3 bg-[--background-secondary] rounded-xl text-[--foreground] placeholder:text-[--foreground-tertiary] text-[15px] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[--foreground-secondary]">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'login' ? '输入密码' : '至少6位'}
              className="w-full px-4 py-3 bg-[--background-secondary] rounded-xl text-[--foreground] placeholder:text-[--foreground-tertiary] text-[15px] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
            />
          </div>

          {mode === 'register' && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[--foreground-secondary]">确认密码</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="再次输入密码"
                className="w-full px-4 py-3 bg-[--background-secondary] rounded-xl text-[--foreground] placeholder:text-[--foreground-tertiary] text-[15px] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
              />
            </div>
          )}

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
            {loading ? '处理中...' : mode === 'login' ? '登录' : '注册'}
          </button>
        </form>

        {/* Footer */}
        <div className="px-5 pb-5 text-center">
          {mode === 'login' ? (
            <p className="text-sm text-[--foreground-tertiary]">
              没有账号？
              <button onClick={() => { setMode('register'); setError(null); }} className="ml-1 text-[#007AFF] font-medium">
                立即注册
              </button>
            </p>
          ) : (
            <p className="text-sm text-[--foreground-tertiary]">
              已有账号？
              <button onClick={() => { setMode('login'); setError(null); }} className="ml-1 text-[#007AFF] font-medium">
                登录
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== Account Status Button ====================

interface AccountStatusProps {
  user: TCBUser | null;
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
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[--background-secondary] text-sm text-[--foreground-secondary]"
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
          <div className="absolute top-full right-0 mt-1 bg-[--card-bg] rounded-xl shadow-lg border border-[--border] py-1 min-w-[120px] z-10">
            <button
              onClick={() => { onLogout(); setShowMenu(false); }}
              className="w-full px-4 py-2 text-left text-sm text-[--foreground-secondary] hover:bg-[--background-secondary]"
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

// ==================== useAuth Hook ====================

interface UseAuthReturn {
  user: TCBUser | null;
  loading: boolean;
  logout: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<TCBUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check initial session
    getCurrentUser().then((u) => {
      setUser(u);
      setLoading(false);
    });

    // Listen for auth state changes
    const unsubscribe = onAuthStateChange((u) => {
      setUser(u);
    });

    return unsubscribe;
  }, []);

  const logout = useCallback(async () => {
    await signOut();
    setUser(null);
  }, []);

  return { user, loading, logout };
}