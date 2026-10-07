'use client';

import { apiFetch } from '@/lib/request-api';
import { getDeviceId } from '@/lib/utils';

export type ClientEventType =
  | 'calculator'
  | 'paywall_view'
  | 'paywall_confirm'
  | 'paywall_cancel'
  | 'report_download'
  | 'login_gate';

/**
 * 上报客户端埋点事件（fire-and-forget，失败静默，绝不影响主流程）。
 * uid 归属由服务端从会话 cookie 解析，客户端不自报身份。
 */
export async function trackEvent(
  eventType: ClientEventType,
  options: { meta?: Record<string, unknown> } = {}
): Promise<void> {
  try {
    const deviceId = await getDeviceId();
    await apiFetch('/api/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-id': deviceId,
      },
      body: JSON.stringify({ eventType, meta: options.meta }),
    });
  } catch {
    // 埋点失败不影响业务
  }
}
