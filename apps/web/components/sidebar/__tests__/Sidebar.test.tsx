import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }), usePathname: () => '/' }));
vi.mock('@/src/lib/workspaces', () => ({ listWorkspaces: vi.fn() }));
// API 호출만 목킹하고 flattenPageTree(순수 헬퍼)는 원본을 유지한다 — CommandPaletteContainer가 소비.
vi.mock('@/src/lib/pages', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/src/lib/pages')>();
  return {
    ...actual,
    getPageTree: vi.fn(),
    createPage: vi.fn(),
    updatePage: vi.fn(),
    archivePage: vi.fn(),
  };
});
// 팔레트 배선(FR-A2~A9/A12) 검증용 신규 목 — logout/멤버 조회.
vi.mock('@/src/lib/auth/logout', () => ({ logout: vi.fn() }));
vi.mock('@/src/lib/members', () => ({ listMembers: vi.fn() }));

import Sidebar from '@/components/sidebar/Sidebar';
import { ToastProvider } from '@/components/states/ToastProvider';
import { listWorkspaces } from '@/src/lib/workspaces';
import { getPageTree, createPage, updatePage, archivePage } from '@/src/lib/pages';
import { logout } from '@/src/lib/auth/logout';
import { listMembers } from '@/src/lib/members';
import { ApiError } from '@/src/lib/api';
import type { Page, Workspace, Membership } from '@/src/lib/types';

const ws = (over: Partial<Workspace>): Workspace => ({
  id: 'w1', name: 'WS', type: 'SHARED', ownerId: 'u1', createdAt: '2026-01-01T00:00:00Z', ...over,
});
const page = (over: Partial<Page>): Page => ({
  id: 'p1', workspaceId: 'w1', parentPageId: null, title: 'P', icon: null, position: 0,
  createdById: 'u1', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', children: null, ...over,
});
const membership = (over: Partial<Membership>): Membership => ({
  membershipId: 'm1', userId: 'u2', userEmail: 'hong@ex.com', userName: '홍길동',
  role: 'MEMBER', joinedAt: '2026-01-01T00:00:00Z', ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPageTree).mockResolvedValue([]);
});

describe('Sidebar', () => {
  it('AC-5: 워크스페이스 2개를 모두 표시한다', async () => {
    const user = userEvent.setup();
    vi.mocked(listWorkspaces).mockResolvedValue([
      ws({ id: 'w1', name: '내 워크스페이스', type: 'PERSONAL' }),
      ws({ id: 'w2', name: '이음 팀', type: 'SHARED' }),
    ]);
    render(<Sidebar />);
    // 디자인: 현재 워크스페이스는 헤더, 나머지는 스위처 드롭다운에 표시된다.
    expect(await screen.findByText('내 워크스페이스')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /내 워크스페이스/ }));
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

    await user.click(screen.getByRole('button', { name: /내 워크스페이스/ })); // 드롭다운 열기(트리거)
    await user.click(screen.getByRole('menuitem', { name: /이음 팀/ }));        // 드롭다운 항목
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

  it('AC-F8: 아카이브는 ConfirmDialog 확인 시에만 archivePage 호출 + 재조회한다', async () => {
    const user = userEvent.setup();
    vi.mocked(listWorkspaces).mockResolvedValue([ws({ id: 'w1', name: '내 워크스페이스', type: 'PERSONAL' })]);
    vi.mocked(getPageTree).mockResolvedValue([page({ id: 'a', title: 'A' })]);
    vi.mocked(archivePage).mockResolvedValue(undefined);
    render(<Sidebar />);
    await screen.findByText('A');

    // 취소 시: ConfirmDialog 열린 뒤 '취소' → archivePage 미호출
    await user.click(screen.getByRole('button', { name: 'A 아카이브' }));
    await user.click(screen.getByRole('button', { name: '취소' }));
    expect(archivePage).not.toHaveBeenCalled();

    // 확인 시: '아카이브' 확인 버튼 → archivePage 호출 + 재조회
    await user.click(screen.getByRole('button', { name: 'A 아카이브' }));
    await user.click(screen.getByRole('button', { name: '아카이브' }));
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

    await user.click(screen.getByRole('button', { name: /내 워크스페이스/ })); // 드롭다운 열기
    await user.click(screen.getByRole('menuitem', { name: /WS2/ })); // 느린 w2 전환(드롭다운 닫힘, 헤더 WS2)
    await user.click(screen.getByRole('button', { name: /WS2/ })); // 헤더 클릭 → 재오픈
    await user.click(screen.getByRole('menuitem', { name: /WS3/ })); // 빠른 w3 전환
    await screen.findByText('P3-page');

    // w2가 뒤늦게 stale 데이터로 응답 — 무시되어야 함
    await act(async () => {
      resolveW2([page({ id: 'p2', title: 'P2-stale' })]);
    });
    expect(screen.queryByText('P2-stale')).not.toBeInTheDocument();
    expect(screen.getByText('P3-page')).toBeInTheDocument();
  });

  it('AC-1: 전역 ⌘K(keydown)로 명령 팔레트를 연다', async () => {
    vi.mocked(listWorkspaces).mockResolvedValue([ws({ id: 'w1', name: '내 워크스페이스', type: 'PERSONAL' })]);
    vi.mocked(getPageTree).mockResolvedValue([page({ id: 'pA', title: '회의록' })]);
    render(<Sidebar />);
    await screen.findByText('회의록'); // 페이지 트리 로드 완료 후

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(await screen.findByRole('dialog', { name: '명령 팔레트' })).toBeInTheDocument();
  });

  it('회귀(수정2): Ctrl+Shift+K로는 명령 팔레트가 열리지 않는다(devtools 단축키 오매칭 방지)', async () => {
    vi.mocked(listWorkspaces).mockResolvedValue([ws({ id: 'w1', name: '내 워크스페이스', type: 'PERSONAL' })]);
    vi.mocked(getPageTree).mockResolvedValue([page({ id: 'pA', title: '회의록' })]);
    render(<Sidebar />);
    await screen.findByText('회의록');

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true, shiftKey: true });
    expect(screen.queryByRole('dialog', { name: '명령 팔레트' })).not.toBeInTheDocument();
  });

  it('회귀(수정2): 아카이브 확인 다이얼로그가 열려 있으면 ⌘K로 팔레트를 열지 않는다(모달 배타성)', async () => {
    const user = userEvent.setup();
    vi.mocked(listWorkspaces).mockResolvedValue([ws({ id: 'w1', name: '내 워크스페이스', type: 'PERSONAL' })]);
    vi.mocked(getPageTree).mockResolvedValue([page({ id: 'a', title: 'A' })]);
    render(<Sidebar />);
    await screen.findByText('A');

    // 파괴적 확인 다이얼로그 오픈 → confirmArchiveId 세팅
    await user.click(screen.getByRole('button', { name: 'A 아카이브' }));
    expect(await screen.findByRole('button', { name: '아카이브' })).toBeInTheDocument();

    // 다이얼로그가 열린 상태에서 ⌘K → 명령 팔레트는 열리지 않아야 한다
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.queryByRole('dialog', { name: '명령 팔레트' })).not.toBeInTheDocument();
  });

  it('AC-2: 검색 버튼 클릭으로 명령 팔레트를 연다', async () => {
    const user = userEvent.setup();
    vi.mocked(listWorkspaces).mockResolvedValue([ws({ id: 'w1', name: '내 워크스페이스', type: 'PERSONAL' })]);
    vi.mocked(getPageTree).mockResolvedValue([page({ id: 'pA', title: '회의록' })]);
    render(<Sidebar />);
    await screen.findByText('회의록');

    await user.click(screen.getByRole('button', { name: '검색' }));
    expect(await screen.findByRole('dialog', { name: '명령 팔레트' })).toBeInTheDocument();
  });

  it('AC-5: 팔레트가 열린 뒤 Escape로 닫힌다', async () => {
    const user = userEvent.setup();
    vi.mocked(listWorkspaces).mockResolvedValue([ws({ id: 'w1', name: '내 워크스페이스', type: 'PERSONAL' })]);
    vi.mocked(getPageTree).mockResolvedValue([page({ id: 'pA', title: '회의록' })]);
    render(<Sidebar />);
    await screen.findByText('회의록');

    await user.click(screen.getByRole('button', { name: '검색' }));
    expect(await screen.findByRole('dialog', { name: '명령 팔레트' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '명령 팔레트' })).not.toBeInTheDocument(),
    );
  });

  it('AC-4: 팔레트에서 페이지 항목 클릭 시 해당 페이지로 이동한다', async () => {
    const user = userEvent.setup();
    vi.mocked(listWorkspaces).mockResolvedValue([ws({ id: 'w1', name: '내 워크스페이스', type: 'PERSONAL' })]);
    vi.mocked(getPageTree).mockResolvedValue([page({ id: 'pA', title: '회의록' })]);
    render(<Sidebar />);
    await screen.findByText('회의록');

    await user.click(screen.getByRole('button', { name: '검색' }));
    const dialog = await screen.findByRole('dialog', { name: '명령 팔레트' });
    // 트리의 동명 항목과 구분하기 위해 팔레트 dialog 스코프 내에서 항목 버튼을 찾는다.
    await user.click(within(dialog).getByRole('button', { name: /회의록/ }));
    expect(pushMock).toHaveBeenCalledWith('/page/pA');
  });
});

// 신규(FR-B2/BR-B1/BR-B2): mutation(생성/이름변경/아이콘/아카이브확정) 비401 실패는 트리를
// setStatus('error')로 오류화하는 대신 전역 토스트(+재시도)로 알리고 트리는 유지되어야 한다.
// 토스트는 role=alert(인라인 오류와 동일 role)라 텍스트로 단정한다 — 설계서 "테스트 전략" 참조.
describe('Sidebar — mutation 실패 토스트 전환(FR-B2/BR-B1/BR-B2)', () => {
  it('AC-B4: status=ready에서 생성 비401 실패 시 트리를 유지하고 전역 토스트를 렌더한다', async () => {
    const user = userEvent.setup();
    vi.mocked(listWorkspaces).mockResolvedValue([ws({ id: 'w1', name: '내 워크스페이스', type: 'PERSONAL' })]);
    vi.mocked(getPageTree).mockResolvedValue([page({ id: 'a', title: 'A' })]);
    vi.mocked(createPage).mockRejectedValue(new Error('boom'));
    render(
      <ToastProvider>
        <Sidebar />
      </ToastProvider>,
    );
    await screen.findByText('A');

    await user.click(screen.getByRole('button', { name: /새 페이지/ }));
    await waitFor(() => expect(createPage).toHaveBeenCalled());

    await waitFor(() => {
      expect(screen.getByText('A')).toBeInTheDocument();
      expect(screen.queryByText(/목록을 불러오지 못했습니다/)).not.toBeInTheDocument();
      expect(screen.getByText('페이지를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
    });
  });

  it('AC-B5: 이름변경 비401 실패 시 트리를 유지하고 전역 토스트를 렌더한다', async () => {
    const user = userEvent.setup();
    vi.mocked(listWorkspaces).mockResolvedValue([ws({ id: 'w1', name: '내 워크스페이스', type: 'PERSONAL' })]);
    vi.mocked(getPageTree).mockResolvedValue([page({ id: 'a', title: 'A' })]);
    vi.mocked(updatePage).mockRejectedValue(new Error('boom'));
    render(
      <ToastProvider>
        <Sidebar />
      </ToastProvider>,
    );
    await screen.findByText('A');

    await user.click(screen.getByRole('button', { name: 'A 이름 변경' }));
    const input = screen.getByRole('textbox', { name: '페이지 이름' });
    fireEvent.change(input, { target: { value: 'New' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(updatePage).toHaveBeenCalledWith('w1', 'a', { title: 'New' }));

    await waitFor(() => {
      expect(screen.getByText('A')).toBeInTheDocument();
      expect(screen.queryByText(/목록을 불러오지 못했습니다/)).not.toBeInTheDocument();
      expect(screen.getByText('이름을 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
    });
  });

  it('AC-B6: 아이콘 변경 비401 실패 시 트리를 유지하고 전역 토스트를 렌더한다', async () => {
    const user = userEvent.setup();
    vi.mocked(listWorkspaces).mockResolvedValue([ws({ id: 'w1', name: '내 워크스페이스', type: 'PERSONAL' })]);
    vi.mocked(getPageTree).mockResolvedValue([page({ id: 'a', title: 'A' })]);
    vi.mocked(updatePage).mockRejectedValue(new Error('boom'));
    render(
      <ToastProvider>
        <Sidebar />
      </ToastProvider>,
    );
    await screen.findByText('A');

    await user.click(screen.getByRole('button', { name: 'A 아이콘 변경' }));
    await user.click(screen.getByRole('button', { name: '🔥' }));

    await waitFor(() => expect(updatePage).toHaveBeenCalledWith('w1', 'a', { icon: '🔥' }));

    await waitFor(() => {
      expect(screen.getByText('A')).toBeInTheDocument();
      expect(screen.queryByText(/목록을 불러오지 못했습니다/)).not.toBeInTheDocument();
      expect(screen.getByText('아이콘을 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
    });
  });

  it('AC-B7: 아카이브 확정 비401 실패 시 트리를 유지하고 전역 토스트를 렌더한다', async () => {
    const user = userEvent.setup();
    vi.mocked(listWorkspaces).mockResolvedValue([ws({ id: 'w1', name: '내 워크스페이스', type: 'PERSONAL' })]);
    vi.mocked(getPageTree).mockResolvedValue([page({ id: 'a', title: 'A' })]);
    vi.mocked(archivePage).mockRejectedValue(new Error('boom'));
    render(
      <ToastProvider>
        <Sidebar />
      </ToastProvider>,
    );
    await screen.findByText('A');

    await user.click(screen.getByRole('button', { name: 'A 아카이브' }));
    await user.click(screen.getByRole('button', { name: '아카이브' }));

    await waitFor(() => expect(archivePage).toHaveBeenCalledWith('w1', 'a'));

    await waitFor(() => {
      expect(screen.getByText('A')).toBeInTheDocument();
      expect(screen.queryByText(/목록을 불러오지 못했습니다/)).not.toBeInTheDocument();
      expect(screen.getByText('페이지를 아카이브하지 못했습니다. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
    });
  });

  it('AC-B8(회귀 가드): mutation 401 실패는 로그인으로 이동하고 토스트·인라인 오류 모두 미렌더한다', async () => {
    const user = userEvent.setup();
    vi.mocked(listWorkspaces).mockResolvedValue([ws({ id: 'w1', name: '내 워크스페이스', type: 'PERSONAL' })]);
    vi.mocked(getPageTree).mockResolvedValue([page({ id: 'a', title: 'A' })]);
    vi.mocked(createPage).mockRejectedValue(new ApiError(401, 'unauthorized'));
    render(
      <ToastProvider>
        <Sidebar />
      </ToastProvider>,
    );
    await screen.findByText('A');

    await user.click(screen.getByRole('button', { name: /새 페이지/ }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login'));
    expect(screen.queryByText(/페이지를 만들지 못했습니다/)).not.toBeInTheDocument();
    expect(screen.queryByText(/목록을 불러오지 못했습니다/)).not.toBeInTheDocument();
  });

  it('AC-B9(회귀 가드): 워크스페이스 전환 트리 조회 비401 실패는 인라인 오류를 유지하고 토스트는 렌더하지 않는다', async () => {
    const user = userEvent.setup();
    vi.mocked(listWorkspaces).mockResolvedValue([
      ws({ id: 'w1', name: '내 워크스페이스', type: 'PERSONAL' }),
      ws({ id: 'w2', name: '이음 팀', type: 'SHARED' }),
    ]);
    vi.mocked(getPageTree).mockImplementation((id: string) =>
      id === 'w2' ? Promise.reject(new Error('boom')) : Promise.resolve([page({ id: 'a', title: 'A' })]),
    );
    render(
      <ToastProvider>
        <Sidebar />
      </ToastProvider>,
    );
    await screen.findByText('A');

    await user.click(screen.getByRole('button', { name: /내 워크스페이스/ }));
    await user.click(screen.getByRole('menuitem', { name: /이음 팀/ }));

    expect(await screen.findByText('목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument();
  });

  it('AC-B11: 생성 실패 토스트의 "다시 시도" 클릭 시 동일 인자로 createPage를 재호출한다', async () => {
    const user = userEvent.setup();
    vi.mocked(listWorkspaces).mockResolvedValue([ws({ id: 'w1', name: '내 워크스페이스', type: 'PERSONAL' })]);
    vi.mocked(getPageTree).mockResolvedValue([page({ id: 'a', title: 'A' })]);
    vi.mocked(createPage).mockRejectedValue(new Error('boom'));
    render(
      <ToastProvider>
        <Sidebar />
      </ToastProvider>,
    );
    await screen.findByText('A');

    await user.click(screen.getByRole('button', { name: /새 페이지/ }));
    await waitFor(() => expect(createPage).toHaveBeenCalledTimes(1));

    const retryBtn = await screen.findByRole('button', { name: '다시 시도' });
    await user.click(retryBtn);

    await waitFor(() => expect(createPage).toHaveBeenCalledTimes(2));
  });

  it('AC-B11(이름변경): 이름변경 실패 토스트의 "다시 시도" 클릭 시 동일 인자로 updatePage를 재호출한다', async () => {
    const user = userEvent.setup();
    vi.mocked(listWorkspaces).mockResolvedValue([ws({ id: 'w1', name: '내 워크스페이스', type: 'PERSONAL' })]);
    vi.mocked(getPageTree).mockResolvedValue([page({ id: 'a', title: 'A' })]);
    vi.mocked(updatePage).mockRejectedValue(new Error('boom'));
    render(
      <ToastProvider>
        <Sidebar />
      </ToastProvider>,
    );
    await screen.findByText('A');

    await user.click(screen.getByRole('button', { name: 'A 이름 변경' }));
    const input = screen.getByRole('textbox', { name: '페이지 이름' });
    fireEvent.change(input, { target: { value: 'New' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(updatePage).toHaveBeenCalledTimes(1));

    const retryBtn = await screen.findByRole('button', { name: '다시 시도' });
    await user.click(retryBtn);

    await waitFor(() => expect(updatePage).toHaveBeenCalledTimes(2));
    expect(updatePage).toHaveBeenLastCalledWith('w1', 'a', { title: 'New' });
  });
});

// 신규(FR-A2~A9/A12, FR-B4): Sidebar가 CommandPaletteContainer에 workspace/members/액션 콜백을
// 실제 배선해 팔레트의 "명령 실행"/"사람 찾기" 그룹이 라우팅·테마·로그아웃·페이지 생성을 구동해야 한다.
// 설계서 "4. Sidebar" 팔레트 배선 절 + prd.md AC-A3~A9/A12/B10 참조.
describe('Sidebar — ⌘K 팔레트 배선(FR-A2~A9/A12, FR-B4)', () => {
  beforeEach(() => {
    // SHARED+팔레트 open 조합에서 usePaletteMembers가 항상 listMembers를 호출하므로 기본 목을 반드시 등록한다.
    vi.mocked(listMembers).mockResolvedValue([]);
  });

  it('AC-A3: 팔레트의 "새 페이지 만들기" 클릭 시 createPage 호출 후 새 페이지로 이동한다(기존 생성 흐름 재사용)', async () => {
    const user = userEvent.setup();
    vi.mocked(listWorkspaces).mockResolvedValue([ws({ id: 'w1', name: '내 워크스페이스', type: 'PERSONAL' })]);
    vi.mocked(getPageTree).mockResolvedValue([]);
    vi.mocked(createPage).mockResolvedValue(page({ id: 'new1', title: '제목 없음' }));
    render(
      <ToastProvider>
        <Sidebar />
      </ToastProvider>,
    );
    await screen.findByText('내 워크스페이스');

    await user.click(screen.getByRole('button', { name: '검색' }));
    const dialog = await screen.findByRole('dialog', { name: '명령 팔레트' });
    await user.click(within(dialog).getByRole('button', { name: '새 페이지 만들기' }));

    await waitFor(() =>
      expect(createPage).toHaveBeenCalledWith('w1', expect.objectContaining({ parentPageId: null })),
    );
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/page/new1'));
  });

  it('AC-A4: 팔레트의 "설정 열기" 클릭 시 /settings로 이동한다', async () => {
    const user = userEvent.setup();
    vi.mocked(listWorkspaces).mockResolvedValue([ws({ id: 'w1', name: '내 워크스페이스', type: 'PERSONAL' })]);
    vi.mocked(getPageTree).mockResolvedValue([]);
    render(
      <ToastProvider>
        <Sidebar />
      </ToastProvider>,
    );
    await screen.findByText('내 워크스페이스');

    await user.click(screen.getByRole('button', { name: '검색' }));
    const dialog = await screen.findByRole('dialog', { name: '명령 팔레트' });
    await user.click(within(dialog).getByRole('button', { name: '설정 열기' }));

    expect(pushMock).toHaveBeenCalledWith('/settings');
  });

  it('AC-A5: 팔레트의 "도움말 열기" 클릭 시 /help로 이동한다', async () => {
    const user = userEvent.setup();
    vi.mocked(listWorkspaces).mockResolvedValue([ws({ id: 'w1', name: '내 워크스페이스', type: 'PERSONAL' })]);
    vi.mocked(getPageTree).mockResolvedValue([]);
    render(
      <ToastProvider>
        <Sidebar />
      </ToastProvider>,
    );
    await screen.findByText('내 워크스페이스');

    await user.click(screen.getByRole('button', { name: '검색' }));
    const dialog = await screen.findByRole('dialog', { name: '명령 팔레트' });
    await user.click(within(dialog).getByRole('button', { name: '도움말 열기' }));

    expect(pushMock).toHaveBeenCalledWith('/help');
  });

  it('AC-A6: 팔레트의 "테마 전환" 클릭 시 테마를 토글한다', async () => {
    const user = userEvent.setup();
    // AccountArea.test 관용 — 테마 케이스는 dataset/localStorage를 로컬에서 리셋한다.
    delete document.documentElement.dataset.theme;
    localStorage.clear();
    vi.mocked(listWorkspaces).mockResolvedValue([ws({ id: 'w1', name: '내 워크스페이스', type: 'PERSONAL' })]);
    vi.mocked(getPageTree).mockResolvedValue([]);
    render(
      <ToastProvider>
        <Sidebar />
      </ToastProvider>,
    );
    await screen.findByText('내 워크스페이스');

    await user.click(screen.getByRole('button', { name: '검색' }));
    const dialog = await screen.findByRole('dialog', { name: '명령 팔레트' });
    await user.click(within(dialog).getByRole('button', { name: '테마 전환' }));

    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('AC-A7: SHARED 워크스페이스에서 팔레트의 "멤버 관리 열기" 클릭 시 멤버 페이지로 이동한다', async () => {
    const user = userEvent.setup();
    // PERSONAL 없이 SHARED 하나만 두어 기본 선택 로직(PERSONAL 우선→ws[0])이 SHARED를 고르게 한다.
    vi.mocked(listWorkspaces).mockResolvedValue([ws({ id: 'w2', name: '이음 팀', type: 'SHARED' })]);
    vi.mocked(getPageTree).mockResolvedValue([]);
    render(
      <ToastProvider>
        <Sidebar />
      </ToastProvider>,
    );
    await screen.findByText('이음 팀');

    await user.click(screen.getByRole('button', { name: '검색' }));
    const dialog = await screen.findByRole('dialog', { name: '명령 팔레트' });
    await user.click(within(dialog).getByRole('button', { name: '멤버 관리 열기' }));

    expect(pushMock).toHaveBeenCalledWith('/workspace/w2/members');
  });

  it('AC-A8: 팔레트의 "로그아웃" 클릭 + logout 성공 시 /login으로 이동한다', async () => {
    const user = userEvent.setup();
    vi.mocked(listWorkspaces).mockResolvedValue([ws({ id: 'w1', name: '내 워크스페이스', type: 'PERSONAL' })]);
    vi.mocked(getPageTree).mockResolvedValue([]);
    vi.mocked(logout).mockResolvedValue(undefined);
    render(
      <ToastProvider>
        <Sidebar />
      </ToastProvider>,
    );
    await screen.findByText('내 워크스페이스');

    await user.click(screen.getByRole('button', { name: '검색' }));
    const dialog = await screen.findByRole('dialog', { name: '명령 팔레트' });
    await user.click(within(dialog).getByRole('button', { name: '로그아웃' }));

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login'));
  });

  it('AC-A9: 팔레트의 "로그아웃" 클릭 + logout 실패 시 세션을 유지한다(/login 미이동)', async () => {
    const user = userEvent.setup();
    vi.mocked(listWorkspaces).mockResolvedValue([ws({ id: 'w1', name: '내 워크스페이스', type: 'PERSONAL' })]);
    vi.mocked(getPageTree).mockResolvedValue([]);
    vi.mocked(logout).mockRejectedValue(new Error('network'));
    render(
      <ToastProvider>
        <Sidebar />
      </ToastProvider>,
    );
    await screen.findByText('내 워크스페이스');

    await user.click(screen.getByRole('button', { name: '검색' }));
    const dialog = await screen.findByRole('dialog', { name: '명령 팔레트' });
    await user.click(within(dialog).getByRole('button', { name: '로그아웃' }));

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    // catch에서 조용히 무시되므로 실패 후 마이크로태스크가 모두 흘러도 /login으로 가지 않는다.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(pushMock).not.toHaveBeenCalledWith('/login');
  });

  it('AC-A12: SHARED 워크스페이스에서 팔레트를 열고 사람 이름으로 검색 후 클릭하면 멤버 페이지로 이동한다', async () => {
    const user = userEvent.setup();
    vi.mocked(listWorkspaces).mockResolvedValue([ws({ id: 'w2', name: '이음 팀', type: 'SHARED' })]);
    vi.mocked(getPageTree).mockResolvedValue([]);
    vi.mocked(listMembers).mockResolvedValue([membership({ userId: 'u2', userName: '홍길동', userEmail: 'hong@ex.com' })]);
    render(
      <ToastProvider>
        <Sidebar />
      </ToastProvider>,
    );
    await screen.findByText('이음 팀');

    await user.click(screen.getByRole('button', { name: '검색' }));
    const dialog = await screen.findByRole('dialog', { name: '명령 팔레트' });
    await waitFor(() => expect(listMembers).toHaveBeenCalledWith('w2'));

    await user.type(within(dialog).getByRole('textbox', { name: '명령 검색' }), '홍길동');
    await user.click(within(dialog).getByRole('button', { name: /홍길동/ }));

    expect(pushMock).toHaveBeenCalledWith('/workspace/w2/members');
  });

  it('AC-B10: 팔레트의 "새 페이지 만들기" 클릭 후 createPage 비401 실패 시 트리를 유지하고 전역 토스트를 렌더한다', async () => {
    const user = userEvent.setup();
    vi.mocked(listWorkspaces).mockResolvedValue([ws({ id: 'w1', name: '내 워크스페이스', type: 'PERSONAL' })]);
    vi.mocked(getPageTree).mockResolvedValue([page({ id: 'a', title: 'A' })]);
    vi.mocked(createPage).mockRejectedValue(new Error('boom'));
    render(
      <ToastProvider>
        <Sidebar />
      </ToastProvider>,
    );
    await screen.findByText('A');

    await user.click(screen.getByRole('button', { name: '검색' }));
    const dialog = await screen.findByRole('dialog', { name: '명령 팔레트' });
    await user.click(within(dialog).getByRole('button', { name: '새 페이지 만들기' }));

    await waitFor(() => expect(createPage).toHaveBeenCalled());

    await waitFor(() => {
      expect(screen.getByText('A')).toBeInTheDocument();
      expect(screen.queryByText(/목록을 불러오지 못했습니다/)).not.toBeInTheDocument();
      expect(screen.getByText('페이지를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
    });
  });
});
