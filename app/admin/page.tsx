'use client';

import { useState } from 'react';
import FingerprintJS from '@fingerprintjs/fingerprintjs';

interface CodeInfo {
  code: string;
  used: boolean;
}

async function getDeviceId(): Promise<string> {
  const fp = await FingerprintJS.load();
  const result = await fp.get();
  return result.visitorId;
}

export default function AdminPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [password, setPassword] = useState('');
  const [orderId, setOrderId] = useState('');
  const [codes, setCodes] = useState<CodeInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleLogin = async () => {
    setError('');
    setLoading(true);

    try {
      const deviceId = await getDeviceId();
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, deviceId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '登录失败');
        return;
      }

      setIsLoggedIn(true);
      setPassword('');
    } catch {
      setError('网络错误');
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
                管理密码
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                placeholder="输入管理密码"
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
              disabled={loading || !password.trim()}
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
          管理后台 - 激活码管理
        </h1>

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
      </div>
    </div>
  );
}