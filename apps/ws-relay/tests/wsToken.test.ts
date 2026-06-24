/**
 * wsToken.test.ts — verifyToken 단위 테스트 (WS-AUTH-01 RED)
 *
 * 검증 대상: apps/ws-relay/src/wsToken.ts (아직 미존재 → 전부 RED)
 * 인터페이스: verifyToken(token: string|undefined, secret: string, now: number): {userId:string}|null
 *   - now: Unix epoch 초
 *   - 반환 null: 부재·서명 불일치·만료(exp <= now)
 *   - 반환 {userId}: 서명 일치 + exp > now
 */

import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyToken } from '../src/wsToken.js';

// ─── 골든벡터 (설계서 정본, 리터럴 박제) ──────────────────────────────────
const SECRET = 'test-secret-key-32-bytes-long!!';
const USERID = '11111111-1111-1111-1111-111111111111';
const EXP    = 1700000300;
const TOKEN  =
  'eyJ1c2VySWQiOiIxMTExMTExMS0xMTExLTExMTEtMTExMS0xMTExMTExMTExMTEiLCJleHAiOjE3MDAwMDAzMDB9' +
  '.sdCpy_TTmL271ycglxyEpQmvxuMVgKSthO61r7UWRBs';

describe('verifyToken — 골든벡터 정합', () => {
  it('유효 토큰(만료 1초 전) → {userId} 반환', () => {
    const result = verifyToken(TOKEN, SECRET, EXP - 1);
    expect(result).not.toBeNull();
    expect(result!.userId).toBe(USERID);
  });

  it('만료 토큰(exp == now) → null (exp≤now 경계)', () => {
    expect(verifyToken(TOKEN, SECRET, EXP)).toBeNull();
  });

  it('만료 토큰(exp < now) → null', () => {
    expect(verifyToken(TOKEN, SECRET, EXP + 1)).toBeNull();
  });

  it('서명 위조(wrong secret) → null', () => {
    expect(verifyToken(TOKEN, 'wrong-secret', EXP - 1)).toBeNull();
  });

  it('토큰 부재(undefined) → null', () => {
    expect(verifyToken(undefined, SECRET, EXP - 1)).toBeNull();
  });
});

describe('verifyToken — 입력 방어', () => {
  it('토큰 형식 오류(점 없음) → null', () => {
    expect(verifyToken('notavalidtoken', SECRET, EXP - 1)).toBeNull();
  });

  it('페이로드가 유효한 base64url이 아닌 경우 → null', () => {
    expect(verifyToken('!!!invalid!!!.sig', SECRET, EXP - 1)).toBeNull();
  });

  it('페이로드가 JSON이지만 userId 필드 없음 → null', () => {
    // base64url({ exp: EXP }) — userId 없음
    const payload = Buffer.from(JSON.stringify({ exp: EXP }))
      .toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const forged = `${payload}.fakesig`;
    expect(verifyToken(forged, SECRET, EXP - 1)).toBeNull();
  });

  it('보안: payload에 __proto__ 키 포함 → null (prototype 오염 방지)', () => {
    // __proto__ 포함 payload를 base64url로 인코딩
    const payload = Buffer.from('{"userId":"x","exp":9999999999,"__proto__":{"polluted":1}}')
      .toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const forged = `${payload}.fakesig`;
    expect(verifyToken(forged, SECRET, 0)).toBeNull();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

// ─── R5: exp 비정수(Infinity·소수) 토큰 거부 (RED) ──────────────────────────
//
// 버그: verifyToken은 typeof o.exp !== 'number' 만 체크하고 isFinite/Number.isInteger 를 안 봄.
//   - exp:1e999 → JSON.parse 시 Infinity → typeof === 'number' 통과 + Infinity <= now 는 false → 유효 반환
//   - exp:1.5   → typeof === 'number' 통과 + 1.5 <= now(0) 는 false → 유효 반환
// 기대: 둘 다 null 반환.
describe('verifyToken — R5: 비정수 exp 거부', () => {
  /** 임의 payload 문자열을 SECRET으로 서명해 올바른 토큰을 만든다 (JSON.stringify 우회). */
  function signRaw(payloadStr: string): string {
    const p = Buffer.from(payloadStr, 'utf8').toString('base64url');
    const sig = createHmac('sha256', SECRET).update(p).digest().toString('base64url');
    return `${p}.${sig}`;
  }

  it('R5-a: exp:1e999 (Infinity) → null', () => {
    // 수동 문자열로 1e999 유지 — JSON.stringify({exp:1e999}) 는 "null"이 되므로 직접 구성
    const token = signRaw(`{"userId":"${USERID}","exp":1e999}`);
    // 현재 구현에서는 Infinity > now 이므로 {userId} 반환 → RED
    expect(verifyToken(token, SECRET, 1700000299)).toBeNull();
  });

  it('R5-b: exp:1.5 (소수) → null', () => {
    const token = signRaw(`{"userId":"${USERID}","exp":1.5}`);
    // 현재 구현에서는 1.5 > 0(now) 이므로 {userId} 반환 → RED
    expect(verifyToken(token, SECRET, 0)).toBeNull();
  });
});
