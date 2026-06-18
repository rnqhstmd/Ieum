import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutosave } from '@/src/lib/editor/useAutosave';

describe('editor/useAutosave — debounce 자동저장 훅', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('AC-17: 변경 후 debounce(500ms) 경과 시 save가 정확히 1회 호출된다', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutosave(save, 500));

    act(() => {
      result.current.notifyChange('v1');
    });
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('v1');
  });

  it('AC-18: 연속 변경 시 마지막 값 기준으로 1회만 저장된다', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutosave(save, 500));

    act(() => {
      result.current.notifyChange('v1');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    act(() => {
      result.current.notifyChange('v2');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('v2');
  });

  it('AC-19: 저장 상태가 idle → saving → saved로 전이한다', async () => {
    let resolveSave!: () => void;
    const save = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const { result } = renderHook(() => useAutosave(save, 500));

    expect(result.current.status).toBe('idle');

    act(() => {
      result.current.notifyChange('v1');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(result.current.status).toBe('saving');

    await act(async () => {
      resolveSave();
      await Promise.resolve();
    });
    expect(result.current.status).toBe('saved');
  });
});
