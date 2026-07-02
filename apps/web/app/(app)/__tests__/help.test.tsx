import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock('@/src/lib/users', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/src/lib/auth/logout', () => ({ logout: vi.fn() }));

import HelpPage from '@/app/(app)/help/page';
import { getCurrentUser } from '@/src/lib/users';
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

describe('HelpPage', () => {
  it('AC-7: 마운트 시 앱 소개(제목/설명) 콘텐츠를 표시한다', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(me);
    render(<HelpPage />);

    expect(await screen.findByRole('heading', { name: /이음|도움말|소개/ })).toBeInTheDocument();
  });

  it('AC-8: 단축키 안내는 노출되지 않는다', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(me);
    render(<HelpPage />);
    await screen.findByRole('heading', { name: /이음|도움말|소개/ });

    expect(screen.queryByText(/⌘K|단축키/)).not.toBeInTheDocument();
  });

  it('AC-9: getCurrentUser가 401(ApiError)이면 /login으로 이동한다', async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(new ApiError(401, 'unauthorized'));
    render(<HelpPage />);

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login'));
  });

  it('AC-9: getCurrentUser가 401 이외 에러여도 정적 콘텐츠는 노출된다', async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(new Error('net'));
    render(<HelpPage />);

    expect(await screen.findByRole('heading', { name: /이음|도움말|소개/ })).toBeInTheDocument();
  });
});
