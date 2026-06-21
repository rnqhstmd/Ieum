import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { applyCursorUpdate, applyCursorLeave, useCursor } from '../useCursor';
import type { CursorMap } from '../useCursor';
import type { CursorInfo } from '../protocol';

// P6 라이브 커서 / AC-4 유사·AC-9: 커서 상태는 순수 reducer로 분리되어 React 없이 검증.
const BLOCK = { counter: 0, siteId: 'genesis' };
const info = (clientId: string, anchorId: CursorInfo['anchorId'] = null): CursorInfo => ({
  clientId,
  blockId: BLOCK,
  anchorId,
});

describe('useCursor — 순수 reducer', () => {
  it('applyCursorUpdate는 추가/갱신하고 입력 맵을 변형하지 않는다', () => {
    const m0: CursorMap = new Map();
    const m1 = applyCursorUpdate(m0, info('c2', { counter: 5, siteId: 'b' }));
    expect(m0.size).toBe(0); // 입력 불변
    expect(m1.size).toBe(1);
    expect(m1.get('c2')).toEqual(info('c2', { counter: 5, siteId: 'b' }));
    // 동일 clientId 갱신(중복 추가 아님)
    const m2 = applyCursorUpdate(m1, info('c2', { counter: 9, siteId: 'b' }));
    expect(m2.size).toBe(1);
    expect(m2.get('c2')!.anchorId).toEqual({ counter: 9, siteId: 'b' });
  });

  it('AC-9: applyCursorLeave는 제거하고 입력 맵을 변형하지 않는다', () => {
    const m0: CursorMap = new Map([
      ['c1', info('c1')],
      ['c2', info('c2')],
    ]);
    const m1 = applyCursorLeave(m0, 'c1');
    expect(m0.size).toBe(2); // 입력 불변
    expect(m1.has('c1')).toBe(false);
    expect([...m1.keys()]).toEqual(['c2']);
  });
});

describe('useCursor — 훅', () => {
  it('onCursorUpdate/Leave가 cursors(clientId 정렬)를 갱신한다', () => {
    const { result } = renderHook(() => useCursor());
    expect(result.current.cursors).toEqual([]);

    act(() => result.current.onCursorUpdate(info('c2')));
    act(() => result.current.onCursorUpdate(info('c1')));
    expect(result.current.cursors.map((c) => c.clientId)).toEqual(['c1', 'c2']);

    act(() => result.current.onCursorLeave('c1'));
    expect(result.current.cursors.map((c) => c.clientId)).toEqual(['c2']);
  });
});
