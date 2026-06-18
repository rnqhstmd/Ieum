import { describe, it, expect } from 'vitest';
import { compareIds, idEquals, idKey } from '../src/id.js';
import type { RgaId } from '../src/types.js';

describe('compareIds', () => {
  it('counter가 높은 id가 앞에 위치한다 (내림차순)', () => {
    // counter 3 > counter 1 → a(counter=3)가 앞 → compareIds(a, b) < 0
    const a: RgaId = { counter: 3, siteId: 'A' };
    const b: RgaId = { counter: 1, siteId: 'A' };

    expect(compareIds(a, b)).toBeLessThan(0);
    expect(compareIds(b, a)).toBeGreaterThan(0);
  });

  it('counter가 같을 때 siteId 사전 역순으로 tie-break 된다 (B > A → B가 앞)', () => {
    // 07 §2-2 시나리오: id:(2,A)와 id:(2,B)가 같은 originId에 동시 삽입
    // siteId "B" > "A" → B가 앞 → compareIds({2,B}, {2,A}) < 0
    const siteA: RgaId = { counter: 2, siteId: 'A' };
    const siteB: RgaId = { counter: 2, siteId: 'B' };

    expect(compareIds(siteB, siteA)).toBeLessThan(0); // B가 앞
    expect(compareIds(siteA, siteB)).toBeGreaterThan(0); // A가 뒤
  });

  it('counter가 같고 siteId도 같으면 0을 반환한다', () => {
    const a: RgaId = { counter: 5, siteId: 'site-xyz' };
    const b: RgaId = { counter: 5, siteId: 'site-xyz' };

    expect(compareIds(a, b)).toBe(0);
  });

  it('07 §4 수렴 예시: Hi?! 시나리오 tie-break 순서를 검증한다', () => {
    // 사이트 A: id=(2,A), 사이트 B: id=(2,B), originId=(1,B)로 동시 삽입
    // tie-break: counter 동일(2) → siteId 역순: B > A → (2,B)가 앞
    const opA: RgaId = { counter: 2, siteId: 'A' }; // '!'
    const opB: RgaId = { counter: 2, siteId: 'B' }; // '?'

    // compareIds(opB, opA) < 0 → opB가 opA보다 앞
    expect(compareIds(opB, opA)).toBeLessThan(0);
    // 결과 텍스트: "Hi?!" (B의 '?' 먼저, A의 '!' 나중)
  });
});

describe('idEquals', () => {
  it('counter와 siteId가 모두 같으면 true를 반환한다', () => {
    const a: RgaId = { counter: 7, siteId: 'session-abc' };
    const b: RgaId = { counter: 7, siteId: 'session-abc' };

    expect(idEquals(a, b)).toBe(true);
  });

  it('counter가 다르면 false를 반환한다', () => {
    const a: RgaId = { counter: 1, siteId: 'X' };
    const b: RgaId = { counter: 2, siteId: 'X' };

    expect(idEquals(a, b)).toBe(false);
  });

  it('siteId가 다르면 false를 반환한다', () => {
    const a: RgaId = { counter: 1, siteId: 'X' };
    const b: RgaId = { counter: 1, siteId: 'Y' };

    expect(idEquals(a, b)).toBe(false);
  });
});

describe('idKey', () => {
  it('"counter@siteId" 형식의 문자열을 반환한다', () => {
    const id: RgaId = { counter: 42, siteId: 'site-001' };
    expect(idKey(id)).toBe('42@site-001');
  });

  it('서로 다른 id는 서로 다른 키를 반환한다', () => {
    const a: RgaId = { counter: 1, siteId: '2' };
    const b: RgaId = { counter: 12, siteId: '' };

    // "1@2" vs "12@" — 구분 가능한 형식인지 확인
    expect(idKey(a)).not.toBe(idKey(b));
  });
});
