import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock('@/src/lib/users', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/src/lib/auth/logout', () => ({ logout: vi.fn() }));

import SettingsPage from '@/app/(app)/settings/page';
import { getCurrentUser } from '@/src/lib/users';
import { logout } from '@/src/lib/auth/logout';
import { ApiError } from '@/src/lib/api';
import type { CurrentUser } from '@/src/lib/types';

const me: CurrentUser = {
  id: 'u1',
  email: 'kim@ieum.app',
  name: '김이음',
  token: 't',
};

beforeEach(() => {
  vi.clearAllMocks();
  delete document.documentElement.dataset.theme;
  localStorage.clear();
});

describe('SettingsPage', () => {
  it('AC-3: 마운트 시 getCurrentUser 실데이터로 name/email을 표시한다', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(me);
    render(<SettingsPage />);

    expect(await screen.findByText(me.name)).toBeInTheDocument();
    expect(screen.getByText(me.email)).toBeInTheDocument();
  });

  it('AC-4: 계정 정보는 읽기전용이며 입력창/저장 버튼이 없다', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(me);
    render(<SettingsPage />);
    await screen.findByText(me.name);

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /저장/ })).not.toBeInTheDocument();
  });

  it('AC-5: 테마 전환 버튼 클릭 시 data-theme/localStorage/라벨이 바뀐다', async () => {
    const user = userEvent.setup();
    vi.mocked(getCurrentUser).mockResolvedValue(me);
    render(<SettingsPage />);
    await screen.findByText(me.name);

    await user.click(screen.getByRole('button', { name: /테마|다크|라이트/ }));

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('ieum-theme')).toBe('light');
    expect(screen.getByText('라이트')).toBeInTheDocument();
  });

  it('AC-6: 로그아웃 버튼 클릭 시 logout() 후 /login으로 이동한다', async () => {
    const user = userEvent.setup();
    vi.mocked(getCurrentUser).mockResolvedValue(me);
    vi.mocked(logout).mockResolvedValue(undefined);
    render(<SettingsPage />);
    await screen.findByText(me.name);

    await user.click(screen.getByRole('button', { name: /로그아웃/ }));

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login'));
  });

  it('AC-9: getCurrentUser가 401(ApiError)이면 /login으로 이동한다', async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(new ApiError(401, 'unauthorized'));
    render(<SettingsPage />);

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login'));
  });

  it('AC-9: getCurrentUser가 일반 에러(비-401)면 에러 상태를 표시한다', async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(new Error('net'));
    render(<SettingsPage />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('AC-9: getCurrentUser가 500(ApiError)이면 에러 상태를 표시한다', async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(new ApiError(500, 'server error'));
    render(<SettingsPage />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
