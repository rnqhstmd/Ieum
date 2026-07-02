import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ToastProvider, useToast } from '../ToastProvider';

// A3 FR-8/11/12 · AC-8/11/12/13: 전역 단일 토스트 Provider.
// showError로 노출된 토스트는 role=alert로 렌더되고, 5초 후 자동 소멸하며,
// 연속 호출은 최신 하나로 교체된다.

/** useToast를 소비해 두 개의 서로 다른 오류를 트리거하는 테스트 하네스. */
function Harness({ onRetry }: { onRetry?: () => void }) {
  const { showError } = useToast();
  return (
    <>
      <button
        type="button"
        onClick={() => showError('첫 번째 오류', onRetry ? { onRetry } : undefined)}
      >
        show-1
      </button>
      <button type="button" onClick={() => showError('두 번째 오류')}>
        show-2
      </button>
    </>
  );
}

function renderWithProvider(onRetry?: () => void) {
  return render(
    <ToastProvider>
      <Harness onRetry={onRetry} />
    </ToastProvider>,
  );
}

describe('ToastProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('AC-8: showError 호출 시 role=alert와 메시지를 렌더한다', () => {
    renderWithProvider();
    // 초기에는 토스트가 없다(SSR 미렌더 초기값).
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent.click(screen.getByText('show-1'));

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('첫 번째 오류')).toBeInTheDocument();
  });

  it('AC-12: 닫기(X) 클릭 시 토스트가 사라진다', () => {
    renderWithProvider();
    fireEvent.click(screen.getByText('show-1'));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('AC-11: 5초 경과 시 토스트가 자동 소멸한다', () => {
    renderWithProvider();
    fireEvent.click(screen.getByText('show-1'));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('AC-13: 연속 showError는 토스트 1개만 유지하고 최신 메시지를 표시한다', () => {
    renderWithProvider();
    fireEvent.click(screen.getByText('show-1'));
    fireEvent.click(screen.getByText('show-2'));

    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByText('두 번째 오류')).toBeInTheDocument();
    expect(screen.queryByText('첫 번째 오류')).toBeNull();
  });

  it('교체 시 자동 소멸 타이머가 재설정된다(이전 타이머로 조기 소멸하지 않는다)', () => {
    renderWithProvider();
    fireEvent.click(screen.getByText('show-1'));
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // 3초 시점에 교체 → 새 5초 타이머 시작.
    fireEvent.click(screen.getByText('show-2'));

    // 최초 토스트 기준으로는 5초가 지났지만, 재설정됐으므로 아직 유지된다.
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText('두 번째 오류')).toBeInTheDocument();

    // 재설정 기준 5초가 지나면 소멸.
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('"다시 시도" 클릭 시 onRetry가 호출된다', () => {
    const onRetry = vi.fn();
    renderWithProvider(onRetry);
    fireEvent.click(screen.getByText('show-1'));

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('수정5: onRetry 없이 showError하면 "다시 시도" 버튼이 렌더되지 않는다', () => {
    renderWithProvider(); // onRetry 미전달 → show-2는 항상 onRetry 없이 호출
    fireEvent.click(screen.getByText('show-2'));

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull();
  });

  it('Provider 밖 useToast는 no-op을 반환한다(하위 호환 — throw 없음)', () => {
    function Outside() {
      const { showError, dismiss } = useToast();
      return (
        <button
          type="button"
          onClick={() => {
            showError('무시됨');
            dismiss();
          }}
        >
          outside
        </button>
      );
    }
    render(<Outside />);

    // 호출해도 예외가 없고 토스트도 렌더되지 않는다.
    fireEvent.click(screen.getByText('outside'));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
