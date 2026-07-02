import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import ErrorToast from '../ErrorToast';

// 보안 감사 MEDIUM #1: "다시 시도" 버튼은 1회 클릭 이후 추가 클릭에 반응하지 않아야 한다.
// (5초 자동소멸 전 연타 시 onRetry=mutation 재호출이 중복 실행되어 빈 페이지 등이
//  중복 생성되는 문제를 막기 위함. ErrorToast 내부 로컬 상태로 처리 예정.)

describe('ErrorToast', () => {
  it('M1-1: "다시 시도" 버튼을 연속 2회 클릭해도 onRetry는 정확히 1회만 호출된다', () => {
    const onRetry = vi.fn();
    render(<ErrorToast message="저장 실패" onRetry={onRetry} onDismiss={vi.fn()} />);

    const retryBtn = screen.getByRole('button', { name: '다시 시도' });
    fireEvent.click(retryBtn);
    fireEvent.click(retryBtn);

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('M1-2(회귀 가드): onRetry가 없으면 "다시 시도" 버튼이 렌더되지 않고, "닫기" 버튼은 1회 클릭 시 onDismiss가 호출된다', () => {
    const onDismiss = vi.fn();
    render(<ErrorToast message="저장 실패" onDismiss={onDismiss} />);

    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('M1-3: "다시 시도" 버튼은 1회 클릭 후 disabled 상태가 된다', () => {
    const onRetry = vi.fn();
    render(<ErrorToast message="저장 실패" onRetry={onRetry} onDismiss={vi.fn()} />);

    const retryBtn = screen.getByRole('button', { name: '다시 시도' });
    fireEvent.click(retryBtn);

    expect(retryBtn).toBeDisabled();
  });
});
