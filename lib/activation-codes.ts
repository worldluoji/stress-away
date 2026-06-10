/**
 * Admin Activation Codes — 纯前端生成，无需外部 API
 *
 * 格式: XXXX-XXXX-XXXX-XX (14字符带 Mod 97 校验位)
 * 字符集: 23456789ABCDEFGHJKLMNPQRSTUVWXYZ（32字符，排除易混淆字符）
 */

import crypto from 'crypto';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CHECK_DIGITS = 2;

// Format: XXXX-XXXX-XXXX-XX
const CODE_REGEX = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[0-9]{2}$/;

export function generateActivationCode(): string {
  const bytes = crypto.randomBytes(12);
  let data = '';
  for (const byte of bytes) {
    data += CODE_CHARS[byte % CODE_CHARS.length];
  }

  // Mod 97 (ISO 7064) check digit
  let num = BigInt(0);
  for (const char of data) {
    const val = BigInt(CODE_CHARS.indexOf(char));
    num = num * BigInt(32) + val;
  }
  const checkDigit = Number((BigInt(98) - (num % BigInt(97))) % BigInt(97));
  const checkStr = checkDigit.toString().padStart(CHECK_DIGITS, '0');

  return `${data.slice(0, 4)}-${data.slice(4, 8)}-${data.slice(8, 12)}-${checkStr}`;
}

export function isValidActivationCode(code: string): boolean {
  if (!CODE_REGEX.test(code)) return false;

  const parts = code.split('-');
  const data = parts[0] + parts[1] + parts[2];
  const checkStr = parts[3];

  let num = BigInt(0);
  for (const char of data) {
    const val = CODE_CHARS.indexOf(char);
    if (val === -1) return false;
    num = num * BigInt(32) + BigInt(val);
  }

  const expectedCheck = Number((BigInt(98) - (num % BigInt(97))) % BigInt(97));
  return parseInt(checkStr, 10) === expectedCheck;
}
