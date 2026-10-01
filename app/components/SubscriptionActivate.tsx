'use client';

import { useState } from 'react';
import { getDeviceId } from '@/lib/utils';
import { useAuth } from './LoginModal';
import { apiFetch } from '@/lib/request-api';

interface Props {
  onActivated?: () => void;
}

export function SubscriptionActivate({ onActivated }: Props) {
  const { uid } = useAuth();
  const [adminCode, setAdminCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ remaining: number; expiresAt?: number } | null>(null);

  const handleActivate = async () => {
    if (!adminCode.trim()) {
      setError('请输入激活码');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const deviceId = await getDeviceId();
      const response = await apiFetch('/api/subscription/admin/activate', {
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
      <div className="bg-[var(--card-bg)] p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#34C759]/10 flex items-center justify-center">
          <svg className="w-8 h-8 text-[#34C759]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-[var(--foreground)] mb-2">激活成功</h2>
        <p className="text-[var(--foreground-tertiary)] mb-4">
          剩余 <span className="text-[#007AFF] font-medium">{success.remaining}</span> 次报告额度
        </p>
        {success.expiresAt && (
          <p className="text-sm text-[var(--foreground-tertiary)]">
            有效期至 {new Date(success.expiresAt).toLocaleDateString('zh-CN')}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5 px-5 pb-6">
      <div className="text-center mb-6">
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-1">激活设备</h2>
        <p className="text-sm text-[var(--foreground-tertiary)]">输入激活码直接激活</p>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-[var(--foreground-secondary)]">
            激活码
          </label>
          <input
            type="text"
            value={adminCode}
            onChange={(e) => setAdminCode(e.target.value.toUpperCase())}
            placeholder="格式：XXXX-XXXX-XXXX-XX"
            disabled={loading}
            maxLength={18}
            onKeyDown={(e) => e.key === 'Enter' && handleActivate()}
            className="w-full px-4 py-3 bg-[var(--background-secondary)] rounded-xl text-[var(--foreground)] placeholder:text-[var(--foreground-tertiary)] text-[15px] font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30 disabled:opacity-50"
          />
        </div>
        <p className="text-xs text-[var(--foreground-tertiary)]">
          激活码有效期30天，支持多次叠加绑定，额度和有效期累加
        </p>
        <button
          onClick={handleActivate}
          disabled={loading || !adminCode.trim()}
          className="w-full py-3.5 bg-[#007AFF] text-white rounded-xl text-sm font-medium disabled:opacity-40 disabled:active:scale-100 transition-all active:scale-[0.98]"
        >
          {loading ? '激活中...' : '激活设备'}
        </button>
      </div>

      {error && (
        <div className="bg-[#FF3B30]/10 text-[#FF3B30] px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      <div className="text-center pt-2">
        <p className="text-xs text-[var(--foreground-tertiary)]">
          遇到问题？联系客服微信 <span className="text-[#007AFF]">jmst_cute</span>
        </p>
      </div>
    </div>
  );
}
