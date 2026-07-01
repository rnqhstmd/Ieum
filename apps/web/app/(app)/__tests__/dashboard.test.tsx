import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock('@/src/lib/workspaces', () => ({ listWorkspaces: vi.fn() }));
vi.mock('@/src/lib/pages', () => ({ createPage: vi.fn() }));

import DashboardPage from '@/app/(app)/dashboard/page';
import { listWorkspaces } from '@/src/lib/workspaces';
import { createPage } from '@/src/lib/pages';
import { ApiError } from '@/src/lib/api';
import type { Page, Workspace } from '@/src/lib/types';

const ws = (over: Partial<Workspace>): Workspace => ({
  id: 'w1', name: 'WS', type: 'SHARED', ownerId: 'u1', createdAt: '2026-01-01T00:00:00Z', ...over,
});
const page = (over: Partial<Page>): Page => ({
  id: 'p1', workspaceId: 'w1', parentPageId: null, title: 'P', icon: null, position: 0,
  createdById: 'u1', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', children: null, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DashboardPage', () => {
  it('B-2: 기본 워크스페이스(PERSONAL 우선) 조회 후 빈 상태 CTA로 첫 페이지를 만든다', async () => {
    const user = userEvent.setup();
    vi.mocked(listWorkspaces).mockResolvedValue([
      ws({ id: 'w2', name: '이음 팀', type: 'SHARED' }),
      ws({ id: 'w1', name: '내 워크스페이스', type: 'PERSONAL' }),
    ]);
    vi.mocked(createPage).mockResolvedValue(page({ id: 'new1', workspaceId: 'w1', title: '제목 없음' }));
    render(<DashboardPage />);

    const cta = await screen.findByRole('button', { name: /첫 페이지 만들기/ });
    await user.click(cta);

    await waitFor(() =>
      expect(createPage).toHaveBeenCalledWith('w1', { parentPageId: null, title: '제목 없음', position: 0 }),
    );
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/page/new1'));
  });

  it('B-2: 목록 조회가 401이면 로그인으로 유도한다', async () => {
    vi.mocked(listWorkspaces).mockRejectedValue(new ApiError(401, 'unauthorized'));
    render(<DashboardPage />);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login'));
  });

  it('B-2: 목록 조회가 일반 에러면 에러 상태를 표시한다', async () => {
    vi.mocked(listWorkspaces).mockRejectedValue(new Error('boom'));
    render(<DashboardPage />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
