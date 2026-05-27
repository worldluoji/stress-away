'use client';

import { useState } from 'react';
import { getDeviceId } from '@/lib/utils';

interface ActivationCode {
  code: string;
  used: boolean;
}

interface Props {
  onActivated?: () => void;
}

type ActivationMode = 'mbaodu' | 'admin';

export function SubscriptionActivate({ onActivated }: Props) {
  const [mode, setMode] = useState<ActivationMode>('mbaodu');
  const [orderId, setOrderId] = useState('');
  const [activationCode, setActivationCode] = useState('');
  const [adminCode, setAdminCode] = useState('');
  const [codes, setCodes] = useState<ActivationCode[]>([]);
  const [step, setStep] = useState<'query' | 'activate'>('query');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ remaining: number; expiresAt?: number } | null>(null);

  const handleQueryCodes = async () => {
    if (!orderId.trim()) {
      setError('请输入订单号');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/subscription/query-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Log full response for debugging
        console.error('Query codes failed:', response.status, data);
        if (data.error === 'query_expired') {
          setError('激活码查询窗口已过期（购买后48小时内可查询）');
        } else if (data.error === 'mbaodu_auth_error') {
          setError('激活码服务配置错误，请联系管理员');
        } else if (data.error === 'mbaodu_api_error') {
          setError('激活码服务暂不可用，请稍后再试');
        } else {
          setError(data.error || data.message || '查询失败');
        }
        return;
      }

      setCodes(data.codes || []);
      setStep('activate');
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async () => {
    if (!activationCode.trim()) {
      setError('请输入激活码');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const deviceId = await getDeviceId();
      const response = await fetch('/api/subscription/mbaodu/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device-id': deviceId,
        },
        body: JSON.stringify({
          order_id: orderId.trim(),
          activation_code: activationCode.trim().toUpperCase(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || '激活失败');
        return;
      }

      setSuccess({ remaining: data.remaining_codes });
      onActivated?.();
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminActivate = async () => {
    if (!adminCode.trim()) {
      setError('请输入激活码');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const deviceId = await getDeviceId();
      const response = await fetch('/api/subscription/admin/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device-id': deviceId,
        },
        body: JSON.stringify({
          code: adminCode.trim().toUpperCase(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error === 'expired_code' ? '激活码已过期' : data.error || '激活失败');
        return;
      }

      setSuccess({ remaining: data.remainingCodes, expiresAt: data.expiresAt });
      onActivated?.();
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="bg-[--card-bg] p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#34C759]/10 flex items-center justify-center">
          <svg className="w-8 h-8 text-[#34C759]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-[--foreground] mb-2">激活成功</h2>
        <p className="text-[--foreground-tertiary] mb-4">
          剩余 <span className="text-[#007AFF] font-medium">{success.remaining}</span> 次对话额度
        </p>
        {success.expiresAt && (
          <p className="text-sm text-[--foreground-tertiary]">
            有效期至 {new Date(success.expiresAt).toLocaleDateString('zh-CN')}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5 px-5 pb-6">
      <div className="text-center mb-6">
        <h2 className="text-lg font-semibold text-[--foreground] mb-1">激活设备</h2>
        <p className="text-sm text-[--foreground-tertiary]">
          {mode === 'mbaodu' ? '输入面包多订单号获取激活码' : '输入管理端生成的激活码'}
        </p>
      </div>

      {/* Mode Switcher */}
      <div className="flex gap-2 p-1 bg-[--background-secondary] rounded-xl">
        <button
          onClick={() => { setMode('mbaodu'); setError(null); }}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 'mbaodu'
              ? 'bg-[--card-bg] text-[--foreground] shadow-sm'
              : 'text-[--foreground-tertiary]'
          }`}
        >
          面包多订单
        </button>
        <button
          onClick={() => { setMode('admin'); setError(null); setStep('query'); }}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 'admin'
              ? 'bg-[--card-bg] text-[--foreground] shadow-sm'
              : 'text-[--foreground-tertiary]'
          }`}
        >
          激活码
        </button>
      </div>

      {/* Admin Mode: Direct Activation */}
      {mode === 'admin' && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[--foreground-secondary]">
              激活码
            </label>
            <input
              type="text"
              value={adminCode}
              onChange={(e) => setAdminCode(e.target.value.toUpperCase())}
              placeholder="输入激活码"
              disabled={loading}
              className="w-full px-4 py-3 bg-[--background-secondary] rounded-xl text-[--foreground] placeholder:text-[--foreground-tertiary] text-[15px] font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 disabled:opacity-50"
            />
          </div>
          <p className="text-xs text-[--foreground-tertiary]">
            激活码有效期30天，每个码只能绑定一台设备
          </p>
          <button
            onClick={handleAdminActivate}
            disabled={loading || !adminCode.trim()}
            className="w-full py-3.5 bg-[#007AFF] text-white rounded-xl text-sm font-medium disabled:opacity-40 disabled:active:scale-100 transition-all active:scale-[0.98]"
          >
            {loading ? '激活中...' : '激活设备'}
          </button>
        </div>
      )}

      {/* Mbaodu Mode */}
      {mode === 'mbaodu' && (
        <>
          {/* Step 1: Query Codes */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-[--foreground-secondary]">
              订单号
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                placeholder="输入面包多订单号"
                disabled={loading}
                className="flex-1 px-4 py-3 bg-[--background-secondary] rounded-xl text-[--foreground] placeholder:text-[--foreground-tertiary] text-[15px] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 disabled:opacity-50"
              />
              <button
                onClick={handleQueryCodes}
                disabled={loading || !orderId.trim()}
                className="px-5 py-3 bg-[#007AFF] text-white rounded-xl text-sm font-medium disabled:opacity-40 disabled:active:scale-100 transition-all active:scale-95"
              >
                {loading ? '查询中' : '查询'}
              </button>
            </div>
          </div>

          {/* Display Codes */}
          {step === 'activate' && codes.length > 0 && (
            <div className="bg-[#FF9500]/10 border border-[#FF9500]/20 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-[#FF9500]">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="text-sm font-medium">激活码只显示一次，请妥善保存</span>
              </div>
              <div className="space-y-2">
                {codes.map((code, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between bg-[--card-bg] rounded-lg p-3"
                  >
                    <span className="font-mono text-base tracking-wider text-[--foreground]">{code.code}</span>
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
              <p className="text-xs text-[--foreground-tertiary]">
                购买后48小时内可查询，超时后将无法获取
              </p>
            </div>
          )}

          {/* Step 2: Activate Device */}
          {step === 'activate' && codes.some((c) => !c.used) && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[--foreground-secondary]">
                  订单号
                </label>
                <input
                  type="text"
                  value={orderId}
                  disabled
                  className="w-full px-4 py-3 bg-[--background-secondary] rounded-xl text-[--foreground] text-[15px] opacity-60"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[--foreground-secondary]">
                  激活码
                </label>
                <input
                  type="text"
                  value={activationCode}
                  onChange={(e) => setActivationCode(e.target.value.toUpperCase())}
                  placeholder="输入激活码"
                  disabled={loading}
                  className="w-full px-4 py-3 bg-[--background-secondary] rounded-xl text-[--foreground] placeholder:text-[--foreground-tertiary] text-[15px] font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 disabled:opacity-50"
                />
              </div>
              <button
                onClick={handleActivate}
                disabled={loading || !activationCode.trim()}
                className="w-full py-3.5 bg-[#007AFF] text-white rounded-xl text-sm font-medium disabled:opacity-40 disabled:active:scale-100 transition-all active:scale-[0.98]"
              >
                {loading ? '激活中...' : '激活设备'}
              </button>
            </div>
          )}

          {/* All codes used */}
          {step === 'activate' && codes.length > 0 && codes.every((c) => c.used) && (
            <div className="bg-[--background-secondary] rounded-xl p-6 text-center">
              <svg className="w-10 h-10 mx-auto mb-2 text-[--foreground-tertiary]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-[--foreground-secondary]">该订单的激活码已全部使用</p>
            </div>
          )}
        </>
      )}

      {/* Error */}
      {error && (
        <div className="bg-[#FF3B30]/10 text-[#FF3B30] px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
