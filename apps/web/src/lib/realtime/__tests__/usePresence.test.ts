import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { applyPresenceUpdate, applyPresenceLeave, usePresence } from '../usePresence';
import type { PresenceMap } from '../usePresence';
import type { PresenceInfo } from '../protocol';

// P6 / AC-4,5: presence 상태는 순수 reducer로 분리되어 React 없이 결정적으로 검증된다.
const info = (clientId: string, displayName = 'n', color = '#000'): PresenceInfo => ({
  clientId,
  displayName,
  color,
});

describe('usePresence — 순수 reducer', () => {
  it('AC-4: applyPresenceUpdate는 새 clientId를 추가하고 입력 맵을 변형하지 않는다', () => {
    const m0: PresenceMap = new Map();
    const m1 = applyPresenceUpdate(m0, info('c2', '사용자 #c3d4', '#64B5F6'));
    expect(m0.size).toBe(0); // 입력 불변
    expect(m1.size).toBe(1);
    expect(m1.get('c2')).toEqual(info('c2', '사용자 #c3d4', '#64B5F6'));
  });

  it('applyPresenceUpdate는 기존 clientId를 갱신한다(중복 추가 아님)', () => {
    const m0: PresenceMap = new Map([['c2', info('c2', 'old', '#000')]]);
    const m1 = applyPresenceUpdate(m0, info('c2', 'new', '#fff'));
    expect(m1.size).toBe(1);
    expect(m1.get('c2')!.displayName).toBe('new');
  });

  it('AC-5: applyPresenceLeave는 clientId를 제거하고 입력 맵을 변형하지 않는다', () => {
    const m0: PresenceMap = new Map([
      ['c1', info('c1')],
      ['c2', info('c2')],
    ]);
    const m1 = applyPresenceLeave(m0, 'c1');
    expect(m0.size).toBe(2); // 입력 불변
    expect(m1.size).toBe(1);
    expect(m1.has('c1')).toBe(false);
    expect([...m1.keys()]).toEqual(['c2']);
  });
});

describe('usePresence — 훅', () => {
  it('onPresenceUpdate/Leave가 presences(clientId 정렬 배열)를 갱신한다', () => {
    const { result } = renderHook(() => usePresence());
    expect(result.current.presences).toEqual([]);

    act(() => result.current.onPresenceUpdate(info('c2', 'B', '#1')));
    act(() => result.current.onPresenceUpdate(info('c1', 'A', '#2')));
    expect(result.current.presences.map((p) => p.clientId)).toEqual(['c1', 'c2']); // 정렬

    act(() => result.current.onPresenceLeave('c1'));
    expect(result.current.presences.map((p) => p.clientId)).toEqual(['c2']);
  });
});
