'use client';

import { useEffect, useState } from 'react';
import { LOGIN_ERROR_MESSAGES } from '@/app/components/LoginModal';
import { apiFetch } from '@/lib/request-api';

interface UserSummary {
  id: string;
  username: string;
  role: 'admin' | 'user';
}

const CREATE_ERRORS: Record<string, string> = {
  invalid_username: '用户名不合法（1-32 个字符）',
  username_taken: '该用户名已存在',
  unauthorized: '登录已过期，请重新登录',
};

interface FunnelStep {
  count: number;
  users: number;
}

interface FunnelData {
  funnel: Record<string, FunnelStep>;
  rates: {
    confirmToView: number | null;
    generateToConfirm: number | null;
    downloadToGenerate: number | null;
  };
}

const FUNNEL_STEPS: { key: string; label: string }[] = [
  { key: 'calculator', label: '计算器' },
  { key: 'loginGate', label: '登录墙' },
  { key: 'paywallView', label: '付费墙曝光' },
  { key: 'paywallBlock', label: '额度不足拦截' },
  { key: 'activateSuccess', label: '激活成功' },
  { key: 'paywallConfirm', label: '确认付费' },
  { key: 'paywallCancel', label: '取消' },
  { key: 'reportGenerate', label: '报告生成' },
  { key: 'reportDownload', label: '报告下载' },
];

interface AdminCodeInfo {
  code: string;
  createdAt: number;
  expiresAt: number;
  totalTimes: number;
  userSubRemaining?: number;
  used: boolean;
  deviceId?: string;
  activationTime?: number;
}

export default function AdminPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [adminCodes, setAdminCodes] = useState<AdminCodeInfo[]>([]);
  const [adminCodePage, setAdminCodePage] = useState(1);
  const [adminCodeTotal, setAdminCodeTotal] = useState(0);
  const [newCodeTimes, setNewCodeTimes] = useState(50);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [createdAccount, setCreatedAccount] = useState<{ username: string; password: string } | null>(null);
  const [resetPasswords, setResetPasswords] = useState<Record<string, string>>({});

  const handleLogin = async () => {
    setError('');
    setLoading(true);

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
      if (data.role !== 'admin') {
        setError('当前账号无管理权限');
        return;
      }
      setIsLoggedIn(true);
      fetchAdminCodes(1);
      fetchFunnel();
      fetchUsers();
    } catch {
      setError('网络连接失败，请检查网络后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      /* 登出失败仍回到登录页 */
    }
    setIsLoggedIn(false);
    setPassword('');
  };

  const fetchAdminCodes = async (page: number) => {
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch(`/api/admin/codes?page=${page}&limit=20`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '获取失败');
        return;
      }
      setAdminCodes(data.codes || []);
      setAdminCodePage(data.page);
      setAdminCodeTotal(data.total);
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  };

  const fetchFunnel = async () => {
    try {
      const res = await apiFetch('/api/admin/funnel');
      if (res.ok) setFunnel(await res.json());
    } catch {
      // 静默：漏斗缺失不阻塞后台其它操作
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await apiFetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch {
      // 静默：列表加载失败不阻塞其它操作
    }
  };

  const handleCreateAccount = async () => {
    setError('');
    setCreatedAccount(null);
    if (!newUsername.trim()) {
      setError('请输入用户名');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(CREATE_ERRORS[data.error] || data.error || '创建失败');
        return;
      }
      setCreatedAccount({ username: data.username, password: data.password });
      setNewUsername('');
      fetchUsers();
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (userId: string) => {
    setError('');
    try {
      const res = await apiFetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error === 'user_not_found' ? '该账号不存在，请刷新列表' : '重置失败');
        return;
      }
      setResetPasswords((prev) => ({ ...prev, [userId]: data.password }));
    } catch {
      setError('网络错误');
    }
  };

  const handleGenerateCode = async () => {
    setError('');
    setSuccessMsg('');
    setGeneratedCode(null);
    setLoading(true);
    try {
      const res = await apiFetch('/api/admin/codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ times: newCodeTimes }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '生成失败');
        return;
      }
      setGeneratedCode(data.code);
      setSuccessMsg('激活码已生成');
      fetchAdminCodes(adminCodePage);
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/api/auth/me');
        if (res.ok) {
          const me = await res.json();
          if (me.role === 'admin') {
            setIsLoggedIn(true);
            fetchAdminCodes(1);
            fetchFunnel();
            fetchUsers();
          }
        }
      } catch {
        /* 未登录/网络异常：停留在登录表单 */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-[--background] flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-[--card-bg] rounded-2xl p-6 border border-[var(--card-border)]">
          <h1 className="text-xl font-semibold text-[--foreground] mb-6 text-center">
            管理后台
          </h1>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-[--foreground-secondary] block mb-1.5">
                管理员账号
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                placeholder="输入管理员账号"
                autoComplete="username"
                className="w-full px-4 py-3 bg-[--background-secondary] rounded-xl text-[--foreground] placeholder:text-[--foreground-tertiary] text-[15px] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-[--foreground-secondary] block mb-1.5">
                密码
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                placeholder="输入密码"
                autoComplete="current-password"
                className="w-full px-4 py-3 bg-[--background-secondary] rounded-xl text-[--foreground] placeholder:text-[--foreground-tertiary] text-[15px] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
              />
            </div>

            {error && (
              <div className="bg-[#FF3B30]/10 text-[#FF3B30] px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={loading || !username.trim() || !password.trim()}
              className="w-full py-3.5 bg-[#007AFF] text-white rounded-xl text-sm font-medium disabled:opacity-40 disabled:active:scale-100 transition-all active:scale-[0.98]"
            >
              {loading ? '登录中...' : '登录'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[--background] p-4">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-[--foreground]">
            管理后台
          </h1>
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 text-xs bg-[--background-secondary] rounded-lg text-[--foreground-secondary]"
          >
            退出登录
          </button>
        </div>

        {/* Generate New Code */}
        <div className="bg-[--card-bg] rounded-2xl p-5 border border-[var(--card-border)] space-y-4 mb-4">
          <h3 className="text-sm font-medium text-[--foreground]">生成新激活码</h3>
          <div className="flex gap-2">
            <input
              type="number"
              value={newCodeTimes}
              onChange={(e) => setNewCodeTimes(parseInt(e.target.value, 10) || 50)}
              min={1}
              max={200}
              className="w-24 px-3 py-2 bg-[--background-secondary] rounded-xl text-[--foreground] text-[15px] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
            />
            <span className="text-sm text-[--foreground-tertiary] self-center">次</span>
            <button
              onClick={handleGenerateCode}
              disabled={loading}
              className="flex-1 py-2.5 bg-[#007AFF] text-white rounded-xl text-sm font-medium disabled:opacity-40 disabled:active:scale-100 transition-all active:scale-[0.98]"
            >
              {loading ? '生成中...' : '生成'}
            </button>
          </div>
          {generatedCode && (
            <div className="bg-[#34C759]/10 rounded-xl p-3 flex items-center justify-between">
              <div>
                <span className="font-mono text-lg tracking-wider text-[--foreground]">{generatedCode}</span>
                <p className="text-xs text-[--foreground-tertiary] mt-1">有效期30天，可复制给用户</p>
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(generatedCode)}
                className="text-[#007AFF] text-sm font-medium"
              >
                复制
              </button>
            </div>
          )}
        </div>

        {/* Account Management */}
        <div className="bg-[--card-bg] rounded-2xl p-5 border border-[var(--card-border)] space-y-4 mb-4">
          <h3 className="text-sm font-medium text-[--foreground]">账号管理</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateAccount()}
              placeholder="新用户用户名"
              maxLength={32}
              className="flex-1 px-3 py-2 bg-[--background-secondary] rounded-xl text-[--foreground] text-[15px] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
            />
            <button
              onClick={handleCreateAccount}
              disabled={loading || !newUsername.trim()}
              className="px-4 py-2.5 bg-[#007AFF] text-white rounded-xl text-sm font-medium disabled:opacity-40 disabled:active:scale-100 transition-all active:scale-[0.98]"
            >
              创建账号
            </button>
          </div>
          {createdAccount && (
            <div className="bg-[#34C759]/10 rounded-xl p-3 flex items-center justify-between gap-2">
              <div className="text-sm">
                <span className="font-mono tracking-wider text-[--foreground]">
                  {createdAccount.username} / {createdAccount.password}
                </span>
                <p className="text-xs text-[--foreground-tertiary] mt-1">密码仅此一次，请复制后发给用户</p>
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(`${createdAccount.username} ${createdAccount.password}`)}
                className="text-[#007AFF] text-sm font-medium shrink-0"
              >
                复制
              </button>
            </div>
          )}
          {users.length === 0 ? (
            <p className="text-sm text-[--foreground-tertiary] text-center py-2">暂无账号</p>
          ) : (
            <div className="space-y-2">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="bg-[--background-secondary] rounded-xl p-3 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="text-sm text-[--foreground] truncate">{u.username}</span>
                    {u.role === 'admin' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[#007AFF]/10 text-[#007AFF] shrink-0">管理员</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {resetPasswords[u.id] && (
                      <span className="font-mono text-xs text-[#34C759]">{resetPasswords[u.id]}</span>
                    )}
                    <button
                      onClick={() => handleResetPassword(u.id)}
                      className="px-2.5 py-1 text-xs bg-[--card-bg] rounded-lg text-[--foreground-secondary] border border-[var(--card-border)]"
                    >
                      重置密码
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Report Funnel */}
        <div className="bg-[--card-bg] rounded-2xl p-5 border border-[var(--card-border)] space-y-4 mb-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-[--foreground]">报告付费漏斗</h3>
            <button
              onClick={fetchFunnel}
              className="px-3 py-1 text-xs bg-[--background-secondary] rounded-lg text-[--foreground]"
            >
              刷新
            </button>
          </div>

          {!funnel ? (
            <p className="text-sm text-[--foreground-tertiary] text-center py-4">暂无数据（需配置 MySQL）</p>
          ) : (
            <>
              {(() => {
                const max = Math.max(...FUNNEL_STEPS.map((s) => funnel.funnel[s.key]?.count ?? 0), 1);
                return (
                  <div className="space-y-2">
                    {FUNNEL_STEPS.map((s) => {
                      const step = funnel.funnel[s.key] ?? { count: 0, users: 0 };
                      return (
                        <div key={s.key} className="flex items-center gap-2">
                          <span className="text-xs text-[--foreground-secondary] w-20 shrink-0">{s.label}</span>
                          <div className="flex-1 h-3 bg-[--background-secondary] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#007AFF] rounded-full"
                              style={{ width: `${(step.count / max) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs text-[--foreground] w-12 text-right tabular-nums">{step.count}</span>
                          <span className="text-xs text-[--foreground-tertiary] w-14 text-right">{step.users} 人</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              <div className="flex justify-between text-xs text-[--foreground-tertiary] pt-2 border-t border-[var(--card-border)]">
                <span>曝光→确认 {funnel.rates.confirmToView === null ? '—' : `${funnel.rates.confirmToView}%`}</span>
                <span>确认→生成 {funnel.rates.generateToConfirm === null ? '—' : `${funnel.rates.generateToConfirm}%`}</span>
                <span>生成→下载 {funnel.rates.downloadToGenerate === null ? '—' : `${funnel.rates.downloadToGenerate}%`}</span>
              </div>
            </>
          )}
        </div>

        {/* Admin Codes List */}
        <div className="bg-[--card-bg] rounded-2xl p-5 border border-[var(--card-border)] space-y-4">
          <h3 className="text-sm font-medium text-[--foreground]">激活码列表</h3>

          {error && (
            <div className="bg-[#FF3B30]/10 text-[#FF3B30] px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}
          {successMsg && (
            <div className="bg-[#34C759]/10 text-[#34C759] px-4 py-3 rounded-xl text-sm">
              {successMsg}
            </div>
          )}

          {adminCodes.length === 0 && !loading ? (
            <p className="text-sm text-[--foreground-tertiary] text-center py-4">暂无激活码</p>
          ) : (
            <div className="space-y-2">
              {adminCodes.map((code) => (
                <div
                  key={code.code}
                  className="bg-[--background-secondary] rounded-xl p-3 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm tracking-wider text-[--foreground]">
                      {code.code}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        code.used
                          ? 'bg-[#007AFF]/10 text-[#007AFF]'
                          : 'bg-[#34C759]/10 text-[#34C759]'
                      }`}
                    >
                      {code.used ? '已使用' : '未使用'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-[--foreground-tertiary]">
                    <span>码额度 {code.totalTimes} 次{code.userSubRemaining !== undefined && ` · 账号剩余 ${code.userSubRemaining}`}</span>
                    <span>过期 {new Date(code.expiresAt).toLocaleDateString('zh-CN')}</span>
                  </div>
                  {code.deviceId && (
                    <div className="text-xs text-[--foreground-tertiary]">
                      设备: {code.deviceId.slice(0, 8)}...
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {adminCodeTotal > 0 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-[--foreground-tertiary]">
                共 {adminCodeTotal} 个
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => fetchAdminCodes(adminCodePage - 1)}
                  disabled={adminCodePage <= 1}
                  className="px-3 py-1 text-xs bg-[--background-secondary] rounded-lg text-[--foreground] disabled:opacity-40"
                >
                  上一页
                </button>
                <span className="px-3 py-1 text-xs text-[--foreground-tertiary]">
                  第 {adminCodePage} 页
                </span>
                <button
                  onClick={() => fetchAdminCodes(adminCodePage + 1)}
                  disabled={adminCodePage * 20 >= adminCodeTotal}
                  className="px-3 py-1 text-xs bg-[--background-secondary] rounded-lg text-[--foreground] disabled:opacity-40"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
