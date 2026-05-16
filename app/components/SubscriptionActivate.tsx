'use client';

import { useState } from 'react';
import FingerprintJS from '@fingerprintjs/fingerprintjs';

interface ActivationCode {
  code: string;
  used: boolean;
}

interface Props {
  onActivated?: () => void;
}

export function SubscriptionActivate({ onActivated }: Props) {
  const [orderId, setOrderId] = useState('');
  const [activationCode, setActivationCode] = useState('');
  const [codes, setCodes] = useState<ActivationCode[]>([]);
  const [step, setStep] = useState<'query' | 'activate'>('query');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ remaining: number } | null>(null);

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
        setError(data.error || data.message || '查询失败');
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

  if (success) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-8 text-center">
        <div className="text-green-500 text-5xl mb-4">✓</div>
        <h2 className="text-xl font-semibold text-gray-800 mb-2">激活成功</h2>
        <p className="text-gray-600 mb-6">
          剩余 {success.remaining} 次对话额度
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Step 1: Query Codes */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">输入订单号查询激活码</h3>
        <div className="flex gap-4">
          <input
            type="text"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            placeholder="输入面包多订单号"
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <button
            onClick={handleQueryCodes}
            disabled={loading}
            className="px-6 py-2 bg-gradient-to-r from-amber-400 to-orange-400 text-white rounded-lg hover:shadow-lg disabled:opacity-50 transition-all"
          >
            {loading ? '查询中...' : '查询'}
          </button>
        </div>
      </div>

      {/* Display Codes */}
      {step === 'activate' && codes.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
          <p className="text-amber-700 font-medium mb-4 flex items-center gap-2">
            <span>⚠️</span>
            激活码只显示一次，请妥善保存
          </p>
          <div className="space-y-2">
            {codes.map((code, index) => (
              <div
                key={index}
                className="flex items-center justify-between bg-white rounded-lg p-3"
              >
                <span className="font-mono text-lg tracking-wider">{code.code}</span>
                <span
                  className={`text-sm px-2 py-1 rounded ${
                    code.used
                      ? 'bg-gray-100 text-gray-500'
                      : 'bg-green-100 text-green-700'
                  }`}
                >
                  {code.used ? '已使用' : '未使用'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Activate Device */}
      {step === 'activate' && codes.some((c) => !c.used) && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">激活当前设备</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">订单号</label>
              <input
                type="text"
                value={orderId}
                disabled
                className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">激活码</label>
              <input
                type="text"
                value={activationCode}
                onChange={(e) => setActivationCode(e.target.value.toUpperCase())}
                placeholder="输入激活码"
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 font-mono tracking-wider"
              />
            </div>
            <button
              onClick={handleActivate}
              disabled={loading || !activationCode.trim()}
              className="w-full py-3 bg-gradient-to-r from-amber-400 to-orange-400 text-white rounded-lg hover:shadow-lg disabled:opacity-50 transition-all"
            >
              {loading ? '激活中...' : '激活设备'}
            </button>
          </div>
        </div>
      )}

      {/* All codes used */}
      {step === 'activate' && codes.length > 0 && codes.every((c) => c.used) && (
        <div className="bg-gray-100 rounded-xl p-6 text-center">
          <p className="text-gray-600">该订单的激活码已全部使用</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}
    </div>
  );
}

async function getDeviceId(): Promise<string> {
  const fp = await FingerprintJS.load();
  const result = await fp.get();
  return result.visitorId;
}