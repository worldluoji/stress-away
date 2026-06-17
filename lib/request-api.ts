// lib/api.ts
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

/**
 * 带 basePath 的 fetch 封装，用法与原生 fetch 完全一致
 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit) {
  let url = input;
  if (typeof input === 'string' && input.startsWith('/')) {
    // 相对路径自动加前缀（绝对路径如 http:// 保持不变）
    url = `${basePath}${input}`;
  }
  // 如果 input 是 URL 对象，可能需要额外处理，但通常我们传字符串，此处简化
  return fetch(url, init);
}

// 便捷方法
export const get = (url: string, options?: RequestInit) =>
  apiFetch(url, { method: 'GET', ...options });

export const post = (url: string, body?: unknown, options?: RequestInit) =>
  apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...options,
  });

// 可继续扩展 put, del 等