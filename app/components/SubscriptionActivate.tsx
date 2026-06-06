'use client';

import { useState } from 'react';
import { getDeviceId } from '@/lib/utils';
import { useAuth } from './LoginModal';

interface Props {
  onActivated?: () => void;
}

type ActivationMode = 'mbaodu' | 'admin';

export function SubscriptionActivate({ onActivated }: Props) {
  const { uid } = useAuth();
  const [mode, setMode] = useState<ActivationMode>('mbaodu');
  const [orderId, setOrderId] = useState('');
  const [adminCode, setAdminCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ remaining: number; expiresAt?: number } | null>(null);

  const handleMbaoduClaim = async () => {
    if (!orderId.trim()) {
      setError('请输入订单号');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const deviceId = await getDeviceId();
      const response = await fetch('/api/orders/claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': uid || '',
          'x-device-id': deviceId,
        },
        body: JSON.stringify({ order_id: orderId.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error === 'already_claimed_by_you') {
          setError('此订单已被你认领过了');
        } else if (data.error === 'already_claimed') {
          setError('此订单已被其他账号认领');
        } else if (data.error === 'claim_window_expired') {
          setError('订单认领窗口已过期（购买后3天内可认领）');
        } else if (data.error === 'order_not_paid') {
          setError('订单未支付，请确认支付成功后再试');
        } else if (data.error === 'invalid_order') {
          setError('订单号无效，请检查后重试');
        } else {
          setError(data.error || '认领失败，请稍后重试');
        }
        return;
      }

      setSuccess({ remaining: data.remaining });
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
          'X-User-Id': uid || '',
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
          {mode === 'mbaodu' ? '输入面包多订单号直接认领' : '输入管理端生成的激活码'}
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
          onClick={() => { setMode('admin'); setError(null); }}
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

      {/* Mbaodu Mode: Direct Claim */}
      {mode === 'mbaodu' && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[--foreground-secondary]">
              面包多订单号
            </label>
            <input
              type="text"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="输入面包多订单号"
              disabled={loading}
              className="w-full px-4 py-3 bg-[--background-secondary] rounded-xl text-[--foreground] placeholder:text-[--foreground-tertiary] text-[15px] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 disabled:opacity-50"
            />
          </div>
          <p className="text-xs text-[--foreground-tertiary]">
            购买后3天内可认领，每个订单只能认领一次
          </p>
          <button
            onClick={handleMbaoduClaim}
            disabled={loading || !orderId.trim()}
            className="w-full py-3.5 bg-[#007AFF] text-white rounded-xl text-sm font-medium disabled:opacity-40 disabled:active:scale-100 transition-all active:scale-[0.98]"
          >
            {loading ? '认领中...' : '认领订单'}
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-[#FF3B30]/10 text-[#FF3B30] px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Support contact */}
      <div className="text-center pt-2">
        <p className="text-xs text-[--foreground-tertiary]">
          遇到问题？联系客服 <span className="text-[#007AFF]">jmst_cute</span>
        </p>
      </div>
    </div>
  );
}
