import { createHmac, timingSafeEqual } from 'node:crypto';

export interface VerifiedToken {
  userId: string;
}

export function verifyToken(
  token: string | undefined,
  secret: string,
  now: number,
): VerifiedToken | null {
  if (token === undefined) return null;

  const dotIdx = token.indexOf('.');
  if (dotIdx === -1) return null;

  const p = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);

  // 서명 검증 (타이밍 안전 — 원시 바이트 비교)
  const expectedBuf = createHmac('sha256', secret).update(p).digest();
  const sigBuf = Buffer.from(sig, 'base64url');
  if (sigBuf.length !== expectedBuf.length) return null;
  try {
    if (!timingSafeEqual(expectedBuf, sigBuf)) return null;
  } catch {
    return null;
  }

  // 페이로드 디코딩
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(p, 'base64url').toString());
  } catch {
    return null;
  }

  if (typeof payload !== 'object' || payload === null) return null;

  // proto pollution 가드
  const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'];
  if (DANGEROUS_KEYS.some((k) => Object.prototype.hasOwnProperty.call(payload, k))) return null;

  const o = payload as Record<string, unknown>;

  // 만료 검사: exp > now (비정수·Infinity·NaN 거부)
  if (typeof o.exp !== 'number' || !Number.isInteger(o.exp) || o.exp <= now) return null;

  // userId 검증
  if (typeof o.userId !== 'string' || o.userId.length > 64) return null;

  return { userId: o.userId };
}
