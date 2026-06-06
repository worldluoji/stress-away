'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getCurrentUser,
  signInWithPassword,
  sendEmailCode,
  signOut,
  onAuthStateChange,
  type TCBUser,
} from '@/lib/tcb';

type RegisterStep = 'form' | 'code';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: TCBUser) => void;
}

export function LoginModal({ isOpen, onClose, onSuccess }: LoginModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<RegisterStep>('form');
  const [verifyFn, setVerifyFn] = useState<((code: string) => Promise<{ user: TCBUser; uid: string }>) | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('请输入邮箱和密码');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { user, uid } = await signInWithPassword(email.trim(), password);
      setAuthUid(uid);
      onSuccess(user);
      onClose();
    } catch (err: any) {
      setError(err.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('请输入邮箱');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('请输入有效的邮箱地址');
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
      const fn = await sendEmailCode(email.trim(), password);
      setVerifyFn(() => fn);
      setStep('code');
    } catch (err: any) {
      setError(err.message || '发送验证码失败');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || code.length < 6) {
      setError('请输入6位验证码');
      return;
    }
    if (!verifyFn) {
      setError('验证码已过期，请重新获取');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { user, uid } = await verifyFn(code.trim());
      setAuthUid(uid);
      onSuccess(user);
      onClose();
    } catch (err: any) {
      setError(err.message || '验证码错误');
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchToRegister = () => {
    setMode('register');
    setStep('form');
    setVerifyFn(null);
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setCode('');
    setError(null);
  };

  const handleSwitchToLogin = () => {
    setMode('login');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setCode('');
    setError(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-sm mx-4 bg-[#ffffff] dark:bg-[#1c1c1e] rounded-2xl shadow-2xl border border-[#e5e5ea] dark:border-[#38383a] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5e5ea] dark:border-[#38383a]">
          <h2 className="text-lg font-semibold text-[#000000] dark:text-[#ffffff]">
            {mode === 'login' ? '登录账号' : '注册账号'}
          </h2>
          <button onClick={onClose} className="p-1 text-[#8e8e93] dark:text-[#8e8e93] hover:text-[#000000] dark:hover:text-[#ffffff]">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={mode === 'login' ? handleLogin : (step === 'form' ? handleSendCode : handleVerifyCode)} className="p-5 space-y-4">
          {/* Email field - always shown in register */}
          {(mode === 'login' || step === 'form') && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[--foreground-secondary]">
                {mode === 'login' ? '邮箱' : '邮箱'}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={mode === 'login' ? '输入邮箱' : '用于接收验证码'}
                disabled={loading}
                className="w-full px-4 py-3 bg-[#f2f2f7] dark:bg-[#2c2c2e] rounded-xl text-[#000000] dark:text-[#ffffff] placeholder:text-[#8e8e93] text-[15px] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 disabled:opacity-60"
              />
            </div>
          )}

          {/* Verification code - register step 2 */}
          {mode === 'register' && step === 'code' && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[--foreground-secondary]">验证码</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="输入6位验证码"
                  maxLength={6}
                  disabled={loading}
                  className="flex-1 px-4 py-3 bg-[#f2f2f7] dark:bg-[#2c2c2e] rounded-xl text-[#000000] dark:text-[#ffffff] placeholder:text-[#8e8e93] text-[15px] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={loading}
                  className="px-4 py-3 bg-[#f2f2f7] dark:bg-[#2c2c2e] rounded-xl text-sm text-[#007AFF] font-medium disabled:opacity-40"
                >
                  重发
                </button>
              </div>
              <p className="text-xs text-[#8e8e93]">验证码已发送到 {email}，5分钟内有效</p>
            </div>
          )}

          {/* Password fields - login or register form step */}
          {(mode === 'login' || (mode === 'register' && step === 'form')) && (
            <>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[--foreground-secondary]">密码</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'login' ? '输入密码' : '至少6位'}
                  disabled={loading}
                  className="w-full px-4 py-3 bg-[#f2f2f7] dark:bg-[#2c2c2e] rounded-xl text-[#000000] dark:text-[#ffffff] placeholder:text-[#8e8e93] text-[15px] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 disabled:opacity-60"
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
                    disabled={loading}
                    className="w-full px-4 py-3 bg-[#f2f2f7] dark:bg-[#2c2c2e] rounded-xl text-[#000000] dark:text-[#ffffff] placeholder:text-[#8e8e93] text-[15px] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 disabled:opacity-60"
                  />
                </div>
              )}
            </>
          )}

          {/* Back button: from code step back to form */}
          {mode === 'register' && step === 'code' && (
            <button
              type="button"
              onClick={() => setStep('form')}
              className="text-sm text-[#8e8e93] hover:text-[#007AFF] transition-colors"
            >
              ← 上一步
            </button>
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
            {loading ? '处理中...' : mode === 'login' ? '登录' : step === 'form' ? '发送验证码' : '验证'}
          </button>
        </form>

        {/* Footer */}
        <div className="px-5 pb-5 text-center">
          {mode === 'login' ? (
            <p className="text-sm text-[#8e8e93]">
              没有账号？
              <button onClick={handleSwitchToRegister} className="ml-1 text-[#007AFF] font-medium">
                立即注册
              </button>
            </p>
          ) : (
            <p className="text-sm text-[#8e8e93]">
              已有账号？
              <button onClick={handleSwitchToLogin} className="ml-1 text-[#007AFF] font-medium">
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

// Shared auth state - single source of truth for uid across all hooks/instances
type UidListener = (uid: string | null) => void;
const _authStore = {
  _uid: null as string | null,
  _listeners: [] as UidListener[],
  setUid(uid: string | null) {
    this._uid = uid;
    this._listeners.forEach((l: UidListener) => l(uid));
  },
  subscribe(fn: UidListener) {
    this._listeners.push(fn);
    return () => { this._listeners = this._listeners.filter((l: UidListener) => l !== fn); };
  },
  getUid() {
    return this._uid;
  },
};

interface UseAuthReturn {
  user: TCBUser | null;
  uid: string | null;
  loading: boolean;
  logout: () => Promise<void>;
}

/**
 * External setter for uid (called by LoginModal after login)
 */
export function setAuthUid(uid: string | null) {
  _authStore.setUid(uid);
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<TCBUser | null>(null);
  const [uid, setUid] = useState<string | null>(_authStore.getUid());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check initial session
    getCurrentUser().then((u) => {
      setUser(u);
      if (u?.id) {
        _authStore.setUid(u.id);
        setUid(u.id);
      }
      setLoading(false);
    });

    // Listen for auth state changes
    const unsubscribe = onAuthStateChange((u) => {
      setUser(u);
      _authStore.setUid(u?.id || null);
      setUid(u?.id || null);
    });

    // Subscribe to external uid changes (e.g., LoginModal)
    const unsubStore = _authStore.subscribe((newUid) => {
      setUid(newUid);
    });

    return () => { unsubscribe(); unsubStore(); };
  }, []);

  const logout = useCallback(async () => {
    await signOut();
    setUser(null);
    _authStore.setUid(null);
    setUid(null);
  }, []);

  return { user, uid, loading, logout };
}