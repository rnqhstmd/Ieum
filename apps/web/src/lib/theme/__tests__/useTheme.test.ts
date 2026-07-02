import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useTheme } from '../useTheme';

// AC-5: 테마 상태·저장값·라벨 — dataset.theme 동기화, toggleTheme 저장/반전,
// 인스턴스 간 pub/sub 동기화, localStorage 예외 시 크래시 없음.

beforeEach(() => {
  delete document.documentElement.dataset.theme;
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('useTheme', () => {
  it('AC-5: dataset.theme 미설정 시 초기 라벨은 다크다', async () => {
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.theme).toBe('다크'));
  });

  it('AC-5: dataset.theme=light로 시드된 경우 초기 라벨은 라이트다', async () => {
    document.documentElement.dataset.theme = 'light';
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.theme).toBe('라이트'));
  });

  it('AC-5: toggleTheme 호출 시 dataset·localStorage·라벨이 모두 라이트로 전환된다', async () => {
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.theme).toBe('다크'));

    act(() => {
      result.current.toggleTheme();
    });

    await waitFor(() => expect(result.current.theme).toBe('라이트'));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('ieum-theme')).toBe('light');
  });

  it('AC-5: 한 인스턴스의 toggleTheme이 다른 인스턴스의 라벨도 동기화한다(pub/sub)', async () => {
    const a = renderHook(() => useTheme());
    const b = renderHook(() => useTheme());

    await waitFor(() => expect(a.result.current.theme).toBe('다크'));
    await waitFor(() => expect(b.result.current.theme).toBe('다크'));

    act(() => {
      a.result.current.toggleTheme();
    });

    await waitFor(() => expect(a.result.current.theme).toBe('라이트'));
    await waitFor(() => expect(b.result.current.theme).toBe('라이트'));
  });

  it('AC-5: localStorage.setItem이 예외를 던져도 크래시 없이 dataset은 반전된다', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });

    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.theme).toBe('다크'));

    expect(() => {
      act(() => {
        result.current.toggleTheme();
      });
    }).not.toThrow();

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));
  });
});
