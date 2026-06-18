import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock('@/src/lib/workspaces', () => ({ listWorkspaces: vi.fn() }));
vi.mock('@/src/lib/pages', () => ({
  getPageTree: vi.fn(),
  createPage: vi.fn(),
  updatePage: vi.fn(),
  archivePage: vi.fn(),
}));

import Sidebar from '@/components/sidebar/Sidebar';
import { listWorkspaces } from '@/src/lib/workspaces';
import { getPageTree, createPage, updatePage, archivePage } from '@/src/lib/pages';
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
  vi.mocked(getPageTree).mockResolvedValue([]);
});

describe('Sidebar', () => {
  it('AC-5: 워크스페이스 2개를 모두 표시한다', async () => {
    vi.mocked(listWorkspaces).mockResolvedValue([
      ws({ id: 'w1', name: '내 워크스페이스', type: 'PERSONAL' }),
      ws({ id: 'w2', name: '이음 팀', type: 'SHARED' }),
    ]);
    render(<Sidebar />);
    expect(await screen.findByText('내 워크스페이스')).toBeInTheDocument();
    expect(screen.getByText('이음 팀')).toBeInTheDocument();
  });

  it('AC-11: 선택 워크스페이스 페이지 0건이면 빈 상태를 표시한다', async () => {
    vi.mocked(listWorkspaces).mockResolvedValue([ws({ id: 'w1', name: '내 워크스페이스', type: 'PERSONAL' })]);
    vi.mocked(getPageTree).mockResolvedValue([]);
    render(<Sidebar />);
    expect(await screen.findByText(/페이지가 없습니다/)).toBeInTheDocument();
  });

  it('AC-10: 다른 워크스페이스 선택 시 해당 워크스페이스 트리를 다시 조회한다', async () => {
    const user = userEvent.setup();
    vi.mocked(listWorkspaces).mockResolvedValue([
      ws({ id: 'w1', name: '내 워크스페이스', type: 'PERSONAL' }),
      ws({ id: 'w2', name: '이음 팀', type: 'SHARED' }),
    ]);
    render(<Sidebar />);
    await screen.findByText('내 워크스페이스');
    await waitFor(() => expect(getPageTree).toHaveBeenCalledWith('w1')); // 기본 PERSONAL

    await user.click(screen.getByRole('button', { name: /이음 팀/ }));
    await waitFor(() => expect(getPageTree).toHaveBeenLastCalledWith('w2'));
  });

  it('AC-9: "새 페이지" 클릭 시 createPage 호출 후 트리 재조회 + 새 페이지로 이동', async () => {
    const user = userEvent.setup();
    vi.mocked(listWorkspaces).mockResolvedValue([ws({ id: 'w1', name: '내 워크스페이스', type: 'PERSONAL' })]);
    vi.mocked(createPage).mockResolvedValue(page({ id: 'new1', title: '제목 없음' }));
    render(<Sidebar />);
    await screen.findByText('내 워크스페이스');

    await user.click(screen.getByRole('button', { name: /새 페이지/ }));
    await waitFor(() => expect(createPage).toHaveBeenCalledWith('w1', expect.objectContaining({ parentPageId: null })));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/page/new1'));
  });

  it('I1: 새 페이지 position은 기존 루트 형제의 최대 position + 1이다', async () => {
    const user = userEvent.setup();
    vi.mocked(listWorkspaces).mockResolvedValue([ws({ id: 'w1', name: '내 워크스페이스', type: 'PERSONAL' })]);
    vi.mocked(getPageTree).mockResolvedValue([
      page({ id: 'r1', title: 'R1', position: 0 }),
      page({ id: 'r2', title: 'R2', position: 1000 }),
    ]);
    vi.mocked(createPage).mockResolvedValue(page({ id: 'new1' }));
    render(<Sidebar />);
    await screen.findByText('R1');

    await user.click(screen.getByRole('button', { name: /새 페이지/ }));
    await waitFor(() =>
      expect(createPage).toHaveBeenCalledWith('w1', expect.objectContaining({ parentPageId: null, position: 1001 })),
    );
  });

  it('W2: 트리 행 "하위 추가" 클릭 시 parentPageId + 형제 max+1 position으로 생성한다', async () => {
    const user = userEvent.setup();
    vi.mocked(listWorkspaces).mockResolvedValue([ws({ id: 'w1', name: '내 워크스페이스', type: 'PERSONAL' })]);
    vi.mocked(getPageTree).mockResolvedValue([
      page({ id: 'a', title: 'A', children: [page({ id: 'c1', parentPageId: 'a', title: 'C1', position: 5 })] }),
    ]);
    vi.mocked(createPage).mockResolvedValue(page({ id: 'newc' }));
    render(<Sidebar />);
    await screen.findByText('A');

    await user.click(screen.getByRole('button', { name: 'A 하위 추가' }));
    await waitFor(() =>
      expect(createPage).toHaveBeenCalledWith('w1', expect.objectContaining({ parentPageId: 'a', position: 6 })),
    );
  });

  it('AC-F7: 트리 행 이름 변경 시 updatePage 호출 후 트리를 재조회한다', async () => {
    const user = userEvent.setup();
    vi.mocked(listWorkspaces).mockResolvedValue([ws({ id: 'w1', name: '내 워크스페이스', type: 'PERSONAL' })]);
    vi.mocked(getPageTree).mockResolvedValue([page({ id: 'a', title: 'A' })]);
    vi.mocked(updatePage).mockResolvedValue(page({ id: 'a', title: 'New' }));
    render(<Sidebar />);
    await screen.findByText('A');

    await user.click(screen.getByRole('button', { name: 'A 이름 변경' }));
    const input = screen.getByRole('textbox', { name: '페이지 이름' });
    fireEvent.change(input, { target: { value: 'New' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(updatePage).toHaveBeenCalledWith('w1', 'a', { title: 'New' }));
    await waitFor(() => expect(getPageTree).toHaveBeenCalledTimes(2)); // 초기 + 재조회
  });

  it('AC-F8: 아카이브는 confirm 승인 시에만 archivePage 호출 + 재조회한다', async () => {
    const user = userEvent.setup();
    vi.mocked(listWorkspaces).mockResolvedValue([ws({ id: 'w1', name: '내 워크스페이스', type: 'PERSONAL' })]);
    vi.mocked(getPageTree).mockResolvedValue([page({ id: 'a', title: 'A' })]);
    vi.mocked(archivePage).mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<Sidebar />);
    await screen.findByText('A');

    await user.click(screen.getByRole('button', { name: 'A 아카이브' }));
    expect(archivePage).not.toHaveBeenCalled(); // confirm 취소

    confirmSpy.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'A 아카이브' }));
    await waitFor(() => expect(archivePage).toHaveBeenCalledWith('w1', 'a'));
    await waitFor(() => expect(getPageTree).toHaveBeenCalledTimes(2));
  });

  it('AC-12: 트리 조회가 에러면 에러 상태를 표시한다', async () => {
    vi.mocked(listWorkspaces).mockResolvedValue([ws({ id: 'w1', name: '내 워크스페이스', type: 'PERSONAL' })]);
    vi.mocked(getPageTree).mockRejectedValue(new Error('boom'));
    render(<Sidebar />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('AC-13: 목록 조회가 401이면 로그인으로 유도한다', async () => {
    vi.mocked(listWorkspaces).mockRejectedValue(new ApiError(401, 'unauthorized'));
    render(<Sidebar />);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login'));
  });

  it('PR리뷰: 워크스페이스 전환 경쟁 상태 — 늦게 도착한 이전 응답은 무시한다', async () => {
    const user = userEvent.setup();
    vi.mocked(listWorkspaces).mockResolvedValue([
      ws({ id: 'w1', name: '내 워크스페이스', type: 'PERSONAL' }),
      ws({ id: 'w2', name: 'WS2', type: 'SHARED' }),
      ws({ id: 'w3', name: 'WS3', type: 'SHARED' }),
    ]);
    let resolveW2!: (v: Page[]) => void;
    const w2Promise = new Promise<Page[]>((r) => {
      resolveW2 = r;
    });
    vi.mocked(getPageTree).mockImplementation((id: string) => {
      if (id === 'w2') return w2Promise;
      if (id === 'w3') return Promise.resolve([page({ id: 'p3', title: 'P3-page' })]);
      return Promise.resolve([]);
    });

    render(<Sidebar />);
    await screen.findByText('내 워크스페이스');

    await user.click(screen.getByRole('button', { name: /WS2/ })); // 느린 w2 전환
    await user.click(screen.getByRole('button', { name: /WS3/ })); // 빠른 w3 전환
    await screen.findByText('P3-page');

    // w2가 뒤늦게 stale 데이터로 응답 — 무시되어야 함
    await act(async () => {
      resolveW2([page({ id: 'p2', title: 'P2-stale' })]);
    });
    expect(screen.queryByText('P2-stale')).not.toBeInTheDocument();
    expect(screen.getByText('P3-page')).toBeInTheDocument();
  });
});
