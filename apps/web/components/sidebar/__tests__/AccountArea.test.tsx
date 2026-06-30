import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock('@/src/lib/users', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/src/lib/auth/logout', () => ({ logout: vi.fn() }));

import AccountArea from '@/components/sidebar/AccountArea';
import { getCurrentUser } from '@/src/lib/users';
import { logout } from '@/src/lib/auth/logout';

const me = {
  id: 'u1',
  email: 'kim@ieum.app',
  name: '김이음',
  token: 't',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue(me);
  delete document.documentElement.dataset.theme;
  localStorage.clear();
});

describe('AccountArea', () => {
  it('마운트 시 getCurrentUser 실데이터로 name/email을 표시한다', async () => {
    render(<AccountArea />);
    expect(await screen.findByText('김이음')).toBeInTheDocument();
    expect(screen.getByText('kim@ieum.app')).toBeInTheDocument();
  });

  it('getCurrentUser 실패 시 기존 기본값(내 계정)을 유지한다', async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(new Error('unauth'));
    render(<AccountArea />);
    expect(await screen.findByText('내 계정')).toBeInTheDocument();
  });

  it('계정 행 클릭으로 메뉴를 토글하고 Escape로 닫는다', async () => {
    const user = userEvent.setup();
    render(<AccountArea />);
    await screen.findByText('김이음');

    await user.click(screen.getByRole('button')); // 트리거(열기 전 유일 버튼)
    expect(screen.getByRole('menu', { name: '계정 메뉴' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('로그아웃 클릭 시 logout() 후 /login으로 이동한다', async () => {
    const user = userEvent.setup();
    vi.mocked(logout).mockResolvedValue(undefined);
    render(<AccountArea />);
    await screen.findByText('김이음');

    await user.click(screen.getByRole('button'));
    await user.click(screen.getByRole('menuitem', { name: /로그아웃/ }));

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login'));
  });

  it('테마 토글 시 data-theme/localStorage를 갱신하고 배지를 바꾼다', async () => {
    const user = userEvent.setup();
    render(<AccountArea />);
    await screen.findByText('김이음');

    await user.click(screen.getByRole('button'));
    await user.click(screen.getByRole('menuitem', { name: /테마/ }));

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('ieum-theme')).toBe('light');
    expect(screen.getByText('라이트')).toBeInTheDocument();
  });

  it('설정 클릭은 no-op 스텁이라 네비게이션이 없다', async () => {
    const user = userEvent.setup();
    render(<AccountArea />);
    await screen.findByText('김이음');

    await user.click(screen.getByRole('button'));
    await user.click(screen.getByRole('menuitem', { name: /설정/ }));

    expect(pushMock).not.toHaveBeenCalled();
  });
});
