import FingerprintJS from '@fingerprintjs/fingerprintjs';

export async function getDeviceId(): Promise<string> {
  const fp = await FingerprintJS.load();
  const result = await fp.get();
  return result.visitorId;
}

/**
 * 复制文本到剪贴板，返回是否成功。
 * 优先 clipboard API；在不安全上下文（http）下降级到 execCommand。
 * 调用方须据返回值给出成功/失败反馈，不可静默当成功。
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // clipboard API 不可用或被拒绝，降级
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}