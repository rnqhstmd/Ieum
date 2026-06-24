/**
 * tokenFixture.ts — HMAC 토큰 생성 헬퍼 (테스트 전용)
 *
 * 알고리즘 (설계서 골든벡터와 동일):
 *   payload  = base64url( JSON.stringify({ userId, exp }) )
 *              — JSON.stringify 기본 키 순서: userId, exp
 *   sig      = base64url( HMAC-SHA256(key=secret, msg=payload) )
 *              — msg는 UTF-8 인코딩된 payload 문자열
 *   token    = payload + "." + sig
 *
 * base64url: standard base64, '+'→'-', '/'→'_', '=' 제거 (RFC 4648 §5)
 *
 * 골든벡터 재현 확인 명령:
 *   node -e "
 *     const c=require('crypto');
 *     const SECRET='test-secret-key-32-bytes-long!!';
 *     const USERID='11111111-1111-1111-1111-111111111111';
 *     const EXP=1700000300;
 *     const p=Buffer.from(JSON.stringify({userId:USERID,exp:EXP})).toString('base64')
 *       .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
 *     const s=c.createHmac('sha256',SECRET).update(p).digest('base64')
 *       .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
 *     console.log(p+'.'+s);
 *   "
 *
 * 기대 출력:
 *   eyJ1c2VySWQiOiIxMTExMTExMS0xMTExLTExMTEtMTExMS0xMTExMTExMTExMTEiLCJleHAiOjE3MDAwMDAzMDB9.sdCpy_TTmL271ycglxyEpQmvxuMVgKSthO61r7UWRBs
 */

import { createHmac } from 'node:crypto';

function toBase64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * makeToken — 설계서 알고리즘으로 토큰 생성.
 * @param secret  HMAC 키
 * @param userId  페이로드에 삽입할 userId
 * @param exp     만료 epoch 초 (Unix timestamp)
 */
export function makeToken(secret: string, userId: string, exp: number): string {
  const payload = toBase64Url(Buffer.from(JSON.stringify({ userId, exp })));
  const sig = toBase64Url(createHmac('sha256', secret).update(payload).digest());
  return `${payload}.${sig}`;
}
