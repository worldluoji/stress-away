'use client';

import { useState } from 'react';
import { signInWithPassword, getCurrentUser } from '@/lib/tcb';

interface CodeInfo {
  code: string;
  used: boolean;
}

interface AdminCodeInfo {
  code: string;
  createdAt: number;
  expiresAt: number;
  totalTimes: number;
  remainingTimes: number;
  used: boolean;
  deviceId?: string;
  activationTime?: number;
}

type Tab = 'order' | 'admin-code';

export default function AdminPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tab, setTab] = useState<Tab>('order');
  const [orderId, setOrderId] = useState('');
  const [codes, setCodes] = useState<CodeInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Admin code state
  const [adminCodes, setAdminCodes] = useState<AdminCodeInfo[]>([]);
  const [adminCodePage, setAdminCodePage] = useState(1);
  const [adminCodeTotal, setAdminCodeTotal] = useState(0);
  const [newCodeTimes, setNewCodeTimes] = useState(50);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);

  const handleLogin = async () => {
    setError('');
    setLoading(true);

    try {
      // 1. TCB login
      await signInWithPassword(email, password);

      // 2. Get uid from TCB session
      const user = await getCurrentUser();
      if (!user?.id) {
        setError('登录失败，未获取到会话');
        return;
      }

      // 3. Exchange TCB session for admin token
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': user.id,
        },
        body: JSON.stringify({ uid: user.id }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error === 'not_admin' ? '当前账号无管理权限' : data.error || '登录失败');
        return;
      }

      setIsLoggedIn(true);
      setPassword('');
      setEmail('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Invalid username') || msg.includes('wrong password')) {
        setError('邮箱或密码错误');
      } else if (msg.includes('fail to fetch') || msg.includes('fetch') || msg.includes('network') || msg.includes('Network')) {
        setError('网络连接失败，请检查网络后重试');
      } else if (msg) {
        setError(msg);
      } else {
        setError('登录失败，请重试');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleQuery = async () => {
    if (!orderId.trim()) {
      setError('请输入订单号');
      return;
    }

    setError('');
    setSuccess('');
    setCodes([]);
    setLoading(true);

    try {
      const res = await fetch(`/api/admin/orders/${orderId.trim()}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '查询失败');
        return;
      }

      setCodes(data.codes || []);
      if (codes.length === 0) {
        setSuccess('该订单暂无激活码');
      }
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async () => {
    if (!orderId.trim()) {
      setError('请输入订单号');
      return;
    }

    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const res = await fetch(`/api/admin/orders/${orderId.trim()}`, {
        method: 'POST',
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '生成失败');
        return;
      }

      setCodes(data.codes || []);
      setSuccess('新激活码已生成');
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateAdminCode = async () => {
    setError('');
    setSuccess('');
    setGeneratedCode(null);
    setLoading(true);

    try {
      const res = await fetch('/api/admin/codes', {
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
      setSuccess('激活码已生成');
      // Refresh list
      fetchAdminCodes(adminCodePage);
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  };

  const fetchAdminCodes = async (page: number) => {
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`/api/admin/codes?page=${page}&limit=20`);
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
                管理员邮箱
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                placeholder="输入管理员邮箱"
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
              disabled={loading || !email.trim() || !password.trim()}
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
        <h1 className="text-xl font-semibold text-[--foreground] mb-6">
          管理后台
        </h1>

        {/* Tab Switcher */}
        <div className="flex gap-2 p-1 bg-[--background-secondary] rounded-xl mb-4">
          <button
            onClick={() => setTab('order')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'order'
                ? 'bg-[--card-bg] text-[--foreground] shadow-sm'
                : 'text-[--foreground-tertiary]'
            }`}
          >
            订单管理
          </button>
          <button
            onClick={() => { setTab('admin-code'); fetchAdminCodes(1); }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'admin-code'
                ? 'bg-[--card-bg] text-[--foreground] shadow-sm'
                : 'text-[--foreground-tertiary]'
            }`}
          >
            激活码管理
          </button>
        </div>

        {/* Order Management Tab */}
        {tab === 'order' && (
          <div className="bg-[--card-bg] rounded-2xl p-5 border border-[var(--card-border)] space-y-4">
            <div>
              <label className="text-sm font-medium text-[--foreground-secondary] block mb-1.5">
                订单号
              </label>
              <input
                type="text"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
                placeholder="输入面包多订单号"
                className="w-full px-4 py-3 bg-[--background-secondary] rounded-xl text-[--foreground] placeholder:text-[--foreground-tertiary] text-[15px] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleQuery}
                disabled={loading || !orderId.trim()}
                className="flex-1 py-3 bg-[#007AFF] text-white rounded-xl text-sm font-medium disabled:opacity-40 disabled:active:scale-100 transition-all active:scale-[0.98]"
              >
                {loading ? '查询中...' : '查询'}
              </button>
              <button
                onClick={handleRegenerate}
                disabled={loading || !orderId.trim()}
                className="flex-1 py-3 bg-[#FF9500] text-white rounded-xl text-sm font-medium disabled:opacity-40 disabled:active:scale-100 transition-all active:scale-[0.98]"
              >
                {loading ? '生成中...' : '重新生成'}
              </button>
            </div>

            {error && (
              <div className="bg-[#FF3B30]/10 text-[#FF3B30] px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="bg-[#34C759]/10 text-[#34C759] px-4 py-3 rounded-xl text-sm">
                {success}
              </div>
            )}

            {codes.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-[--foreground-secondary]">
                  当前激活码
                </h3>
                {codes.map((code, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between bg-[--background-secondary] rounded-xl p-3"
                  >
                    <span className="font-mono text-base tracking-wider text-[--foreground]">
                      {code.code}
                    </span>
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        code.used
                          ? 'bg-[--apple-gray-light]/30 text-[--foreground-tertiary]'
                          : 'bg-[#34C759]/10 text-[#34C759]'
                      }`}
                    >
                      {code.used ? '已使用' : '未使用'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Admin Code Management Tab */}
        {tab === 'admin-code' && (
          <div className="space-y-4">
            {/* Generate New Code */}
            <div className="bg-[--card-bg] rounded-2xl p-5 border border-[var(--card-border)] space-y-4">
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
                  onClick={handleGenerateAdminCode}
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

            {/* Admin Codes List */}
            <div className="bg-[--card-bg] rounded-2xl p-5 border border-[var(--card-border)] space-y-4">
              <h3 className="text-sm font-medium text-[--foreground]">激活码列表</h3>

              {error && (
                <div className="bg-[#FF3B30]/10 text-[#FF3B30] px-4 py-3 rounded-xl text-sm">
                  {error}
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
                        <span>剩余 {code.remainingTimes}/{code.totalTimes} 次</span>
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

              {/* Pagination */}
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
        )}
      </div>
    </div>
  );
}