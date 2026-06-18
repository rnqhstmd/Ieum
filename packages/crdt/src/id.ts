import type { RgaId } from './types.js';

/**
 * 두 RgaId를 비교한다. 정렬 기준 (07 §3-4):
 *  1. counter 내림차순 (높은 counter가 앞 → 음수 반환 시 a가 앞)
 *  2. counter가 같으면 siteId 사전 역순 (B > A → B가 앞)
 *
 * 반환값:
 *  < 0  →  a가 b보다 앞에 위치해야 함
 *  > 0  →  b가 a보다 앞에 위치해야 함
 *    0  →  동일한 id
 */
export function compareIds(a: RgaId, b: RgaId): number {
  // 1단계: counter 내림차순
  if (a.counter !== b.counter) {
    return b.counter - a.counter;
  }
  // 2단계: siteId 사전 역순 (localeCompare: a > b → 양수, 역순이므로 부호 반전)
  return b.siteId.localeCompare(a.siteId);
}

/**
 * 두 RgaId가 동일한지 확인한다.
 */
export function idEquals(a: RgaId, b: RgaId): boolean {
  return a.counter === b.counter && a.siteId === b.siteId;
}

/**
 * RgaId를 Map 키로 사용할 수 있는 문자열로 변환한다.
 * 형식: "{counter}@{siteId}"
 */
export function idKey(id: RgaId): string {
  return `${id.counter}@${id.siteId}`;
}
