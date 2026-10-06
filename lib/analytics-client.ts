'use client';

import { apiFetch } from '@/lib/request-api';
import { getDeviceId } from '@/lib/utils';

export type ClientEventType =
  | 'calculator'
  | 'paywall_view'
  | 'paywall_confirm'
  | 'paywall_cancel'
  | 'report_download';

/**
 * 上报客户端埋点事件（fire-and-forget，失败静默，绝不影响主流程）
 */
export async function trackEvent(
  eventType: ClientEventType,
  options: { uid?: string | null; meta?: Record<string, unknown> } = {}
): Promise<void> {
  try {
    const deviceId = await getDeviceId();
    await apiFetch('/api/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': options.uid ?? '',
        'x-device-id': deviceId,
      },
      body: JSON.stringify({ eventType, meta: options.meta }),
    });
  } catch {
    // 埋点失败不影响业务
  }
}
