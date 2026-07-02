import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import CommandPaletteContainer from '../CommandPaletteContainer';
import type { Page, Workspace, Membership } from '@/src/lib/types';

// A3 FR-3/6/7 · AC-3/4/6/7/17: ⌘K 팔레트 컨테이너.
// pages(현재 워크스페이스 트리)를 평탄화·필터해 단일 그룹으로 노출하고,
// 클릭/방향키+Enter로 onNavigate·onClose를 호출한다.

const page = (over: Partial<Page>): Page => ({
  id: 'p1',
  workspaceId: 'w1',
  parentPageId: null,
  title: 'P',
  icon: null,
  position: 0,
  createdById: 'u1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  children: null,
  ...over,
});

// 현재 워크스페이스 페이지 트리(중첩 포함). 전위 순회 평탄화 순서: p1, p2, p3, p4, p5.
// AC-17: 이 pages에는 현재 워크스페이스 페이지만 담겨 있어, 타 워크스페이스 페이지는 애초에 후보에 없다.
const fixture: Page[] = [
  page({ id: 'p1', title: '주간 회의록' }),
  page({
    id: 'p2',
    title: '프로젝트 개요',
    children: [
      page({ id: 'p3', parentPageId: 'p2', title: '회의 안건' }),
      page({ id: 'p4', parentPageId: 'p2', title: '설계 노트' }),
    ],
  }),
  page({ id: 'p5', title: '아이디어' }),
];

// SHARED 확장 시나리오용 멤버 픽스처(AC-A10/A11/A14) — 이름·이메일이 서로 겹치지 않아 부분일치 오검출을 잡는다.
const members: Membership[] = [
  {
    membershipId: 'm1',
    userId: 'u1',
    userEmail: 'hong@ex.com',
    userName: '홍길동',
    role: 'MEMBER',
    joinedAt: '2026-01-01T00:00:00Z',
  },
  {
    membershipId: 'm2',
    userId: 'u2',
    userEmail: 'kim@ex.com',
    userName: '김철수',
    role: 'OWNER',
    joinedAt: '2026-01-01T00:00:00Z',
  },
];

const wsPersonal: Workspace = {
  id: 'w1',
  name: '개인 워크스페이스',
  type: 'PERSONAL',
  ownerId: 'u1',
  createdAt: '2026-01-01T00:00:00Z',
};

const wsShared: Workspace = {
  id: 'w1',
  name: '공유 워크스페이스',
  type: 'SHARED',
  ownerId: 'u1',
  createdAt: '2026-01-01T00:00:00Z',
};

let navMock: ReturnType<typeof vi.fn>;
let closeMock: ReturnType<typeof vi.fn>;
let createPageMock: ReturnType<typeof vi.fn>;
let openSettingsMock: ReturnType<typeof vi.fn>;
let openHelpMock: ReturnType<typeof vi.fn>;
let toggleThemeMock: ReturnType<typeof vi.fn>;
let openMembersMock: ReturnType<typeof vi.fn>;
let logoutMock: ReturnType<typeof vi.fn>;

function renderOpen(open = true) {
  return render(
    <CommandPaletteContainer open={open} pages={fixture} onNavigate={navMock} onClose={closeMock} />,
  );
}

/** 팔레트 다이얼로그 내부의 항목 버튼 목록(검색 input·ESC kbd는 button이 아니다). */
function itemButtons() {
  const dialog = screen.getByRole('dialog', { name: '명령 팔레트' });
  return within(dialog).getAllByRole('button');
}

beforeEach(() => {
  navMock = vi.fn();
  closeMock = vi.fn();
  createPageMock = vi.fn();
  openSettingsMock = vi.fn();
  openHelpMock = vi.fn();
  toggleThemeMock = vi.fn();
  openMembersMock = vi.fn();
  logoutMock = vi.fn();
});

describe('CommandPaletteContainer', () => {
  it('AC-6: 빈 검색어면 전체 페이지를 표시한다', () => {
    renderOpen();
    expect(screen.getByText('주간 회의록')).toBeInTheDocument();
    expect(screen.getByText('프로젝트 개요')).toBeInTheDocument();
    expect(screen.getByText('회의 안건')).toBeInTheDocument();
    expect(screen.getByText('설계 노트')).toBeInTheDocument();
    expect(screen.getByText('아이디어')).toBeInTheDocument();
    expect(itemButtons()).toHaveLength(5);
  });

  it("AC-3: '회의' 입력 시 제목에 포함하는 페이지만 남는다(중첩 포함)", async () => {
    const user = userEvent.setup();
    renderOpen();
    const input = screen.getByRole('textbox', { name: '명령 검색' });

    await user.type(input, '회의');

    // 일치: 주간 회의록(p1), 회의 안건(p3, 중첩) — 평탄화가 자식까지 후보에 포함함을 검증.
    expect(screen.getByText('주간 회의록')).toBeInTheDocument();
    expect(screen.getByText('회의 안건')).toBeInTheDocument();
    // 불일치는 사라진다.
    expect(screen.queryByText('프로젝트 개요')).not.toBeInTheDocument();
    expect(screen.queryByText('설계 노트')).not.toBeInTheDocument();
    expect(screen.queryByText('아이디어')).not.toBeInTheDocument();
  });

  it('AC-4: 항목 클릭 시 onNavigate(page.id)와 onClose를 호출한다', async () => {
    const user = userEvent.setup();
    renderOpen();

    await user.click(screen.getByText('아이디어'));

    expect(navMock).toHaveBeenCalledWith('p5');
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it('AC-7: 방향키로 하이라이트를 이동하고 Enter로 해당 항목을 실행한다', async () => {
    const user = userEvent.setup();
    renderOpen();
    const input = screen.getByRole('textbox', { name: '명령 검색' });
    input.focus();

    // 초기 activeIndex=0(p1). ↓ 1회 → index 1(p2) → Enter.
    await user.keyboard('{ArrowDown}{Enter}');
    expect(navMock).toHaveBeenCalledWith('p2');
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it('AC-7: ↑는 하이라이트를 되돌린다(클램프)', async () => {
    const user = userEvent.setup();
    renderOpen();
    const input = screen.getByRole('textbox', { name: '명령 검색' });
    input.focus();

    // ↓↓ → index 2(p3), ↑ → index 1(p2), Enter → p2.
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}{Enter}');
    expect(navMock).toHaveBeenCalledWith('p2');
  });

  it('open={false}이면 아무것도 렌더하지 않는다', () => {
    renderOpen(false);
    expect(screen.queryByRole('dialog', { name: '명령 팔레트' })).not.toBeInTheDocument();
    expect(screen.queryByText('주간 회의록')).not.toBeInTheDocument();
  });

  it('AC-6: 닫았다 다시 열면 직전 검색어가 초기화된 빈 상태로 시작한다', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <CommandPaletteContainer open pages={fixture} onNavigate={navMock} onClose={closeMock} />,
    );

    // 검색어 입력 → 후보가 좁혀진다.
    await user.type(screen.getByRole('textbox', { name: '명령 검색' }), '회의');
    expect(screen.queryByText('아이디어')).not.toBeInTheDocument();

    // 닫기(open false 전이) → 다시 열기.
    rerender(
      <CommandPaletteContainer open={false} pages={fixture} onNavigate={navMock} onClose={closeMock} />,
    );
    rerender(
      <CommandPaletteContainer open pages={fixture} onNavigate={navMock} onClose={closeMock} />,
    );

    // 검색 input은 비어 있고 전체 페이지가 다시 노출된다.
    expect(screen.getByRole('textbox', { name: '명령 검색' })).toHaveValue('');
    expect(screen.getByText('아이디어')).toBeInTheDocument();
    expect(itemButtons()).toHaveLength(5);
  });

  it('수정1: 검색 결과가 없으면 "검색 결과가 없습니다" 안내를 노출한다', async () => {
    const user = userEvent.setup();
    renderOpen();

    // 어떤 제목에도 없는 검색어 → 후보 0개.
    await user.type(screen.getByRole('textbox', { name: '명령 검색' }), 'zzz없는검색어');

    expect(screen.getByText('검색 결과가 없습니다')).toBeInTheDocument();
    const dialog = screen.getByRole('dialog', { name: '명령 팔레트' });
    expect(within(dialog).queryAllByRole('button')).toHaveLength(0);
  });

  it('수정1: 페이지가 0개면 "페이지가 없습니다" 안내를 노출한다', () => {
    render(<CommandPaletteContainer open pages={[]} onNavigate={navMock} onClose={closeMock} />);

    expect(screen.getByText('페이지가 없습니다')).toBeInTheDocument();
  });

  it('수정1: loading이면 항목보다 "불러오는 중…" 안내를 우선 노출한다', () => {
    render(<CommandPaletteContainer open pages={[]} loading onNavigate={navMock} onClose={closeMock} />);

    expect(screen.getByText('불러오는 중…')).toBeInTheDocument();
  });

  // ── A3 확장: 명령 실행/사람 찾기 그룹 (feat-palette-search-global-toast) ──

  it('AC-A1/A13: PERSONAL + 모든 액션 제공 시 "멤버 관리 열기" 제외 명령 5개를 노출하고, members가 있어도 "사람 찾기" 그룹 제목은 렌더되지 않는다', () => {
    render(
      <CommandPaletteContainer
        open
        pages={[]}
        onNavigate={navMock}
        onClose={closeMock}
        workspace={wsPersonal}
        members={members}
        onCreatePage={createPageMock}
        onOpenSettings={openSettingsMock}
        onOpenHelp={openHelpMock}
        onToggleTheme={toggleThemeMock}
        onOpenMembers={openMembersMock}
        onLogout={logoutMock}
      />,
    );

    expect(screen.getByText('명령 실행')).toBeInTheDocument();
    expect(screen.getByText('새 페이지 만들기')).toBeInTheDocument();
    expect(screen.getByText('설정 열기')).toBeInTheDocument();
    expect(screen.getByText('도움말 열기')).toBeInTheDocument();
    expect(screen.getByText('테마 전환')).toBeInTheDocument();
    expect(screen.getByText('로그아웃')).toBeInTheDocument();
    expect(screen.queryByText('멤버 관리 열기')).not.toBeInTheDocument();
    // AC-A13: PERSONAL이면 members가 주어져도 "사람 찾기" 그룹 자체가 미렌더.
    expect(screen.queryByText('사람 찾기')).not.toBeInTheDocument();
    expect(itemButtons()).toHaveLength(5);
  });

  it('AC-A2: SHARED + 모든 액션 제공 시 "멤버 관리 열기"를 포함한 명령 6개를 노출한다', () => {
    render(
      <CommandPaletteContainer
        open
        pages={[]}
        onNavigate={navMock}
        onClose={closeMock}
        workspace={wsShared}
        onCreatePage={createPageMock}
        onOpenSettings={openSettingsMock}
        onOpenHelp={openHelpMock}
        onToggleTheme={toggleThemeMock}
        onOpenMembers={openMembersMock}
        onLogout={logoutMock}
      />,
    );

    expect(screen.getByText('멤버 관리 열기')).toBeInTheDocument();
    expect(itemButtons()).toHaveLength(6);
  });

  it('AC-A10/A14: SHARED에서 멤버 이름에만 일치하는 검색어는 "사람 찾기"만 남기고 "페이지"·"명령 실행" 제목을 숨긴다', async () => {
    const user = userEvent.setup();
    render(
      <CommandPaletteContainer
        open
        pages={fixture}
        onNavigate={navMock}
        onClose={closeMock}
        workspace={wsShared}
        members={members}
        onOpenSettings={openSettingsMock}
      />,
    );

    // '길동'은 홍길동에만 일치, 페이지 제목·명령 문구 어디에도 없다.
    await user.type(screen.getByRole('textbox', { name: '명령 검색' }), '길동');

    expect(screen.getByText('사람 찾기')).toBeInTheDocument();
    expect(screen.getByText('홍길동')).toBeInTheDocument();
    expect(screen.queryByText('김철수')).not.toBeInTheDocument();
    expect(screen.queryByText('페이지')).not.toBeInTheDocument();
    expect(screen.queryByText('명령 실행')).not.toBeInTheDocument();
  });

  it('AC-A15: 페이지·사람·명령 모두 무결과인 검색어는 "검색 결과가 없습니다"만 보여주고 세 그룹 제목을 숨긴다', async () => {
    const user = userEvent.setup();
    render(
      <CommandPaletteContainer
        open
        pages={fixture}
        onNavigate={navMock}
        onClose={closeMock}
        workspace={wsShared}
        members={members}
        onOpenSettings={openSettingsMock}
      />,
    );

    // 사전 조건: 검색어가 비어 있을 땐 세 그룹이 모두 노출되어 있어야 아래 무결과 검증이 의미를 갖는다.
    expect(screen.getByText('명령 실행')).toBeInTheDocument();
    expect(screen.getByText('사람 찾기')).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: '명령 검색' }), 'zzz아무것도없음');

    expect(screen.getByText('검색 결과가 없습니다')).toBeInTheDocument();
    expect(screen.queryByText('페이지')).not.toBeInTheDocument();
    expect(screen.queryByText('사람 찾기')).not.toBeInTheDocument();
    expect(screen.queryByText('명령 실행')).not.toBeInTheDocument();
  });

  it('AC-A11: 이메일 부분일치로 사람을 검색한다', async () => {
    const user = userEvent.setup();
    render(
      <CommandPaletteContainer
        open
        pages={[]}
        onNavigate={navMock}
        onClose={closeMock}
        workspace={wsShared}
        members={members}
      />,
    );

    await user.type(screen.getByRole('textbox', { name: '명령 검색' }), 'kim@');

    expect(screen.getByText('김철수')).toBeInTheDocument();
    expect(screen.queryByText('홍길동')).not.toBeInTheDocument();
  });

  it('AC-A3: "새 페이지 만들기" 클릭 시 onCreatePage와 onClose를 호출한다', async () => {
    const user = userEvent.setup();
    render(
      <CommandPaletteContainer
        open
        pages={[]}
        onNavigate={navMock}
        onClose={closeMock}
        workspace={wsShared}
        onCreatePage={createPageMock}
      />,
    );

    await user.click(screen.getByText('새 페이지 만들기'));

    expect(createPageMock).toHaveBeenCalledTimes(1);
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it('AC-A4: "설정 열기" 클릭 시 onOpenSettings와 onClose를 호출한다', async () => {
    const user = userEvent.setup();
    render(
      <CommandPaletteContainer
        open
        pages={[]}
        onNavigate={navMock}
        onClose={closeMock}
        onOpenSettings={openSettingsMock}
      />,
    );

    await user.click(screen.getByText('설정 열기'));

    expect(openSettingsMock).toHaveBeenCalledTimes(1);
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it('AC-A5: "도움말 열기" 클릭 시 onOpenHelp와 onClose를 호출한다', async () => {
    const user = userEvent.setup();
    render(
      <CommandPaletteContainer open pages={[]} onNavigate={navMock} onClose={closeMock} onOpenHelp={openHelpMock} />,
    );

    await user.click(screen.getByText('도움말 열기'));

    expect(openHelpMock).toHaveBeenCalledTimes(1);
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it('AC-A6: "테마 전환" 클릭 시 onToggleTheme과 onClose를 호출한다', async () => {
    const user = userEvent.setup();
    render(
      <CommandPaletteContainer
        open
        pages={[]}
        onNavigate={navMock}
        onClose={closeMock}
        onToggleTheme={toggleThemeMock}
      />,
    );

    await user.click(screen.getByText('테마 전환'));

    expect(toggleThemeMock).toHaveBeenCalledTimes(1);
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it('AC-A7: "멤버 관리 열기" 클릭 시 onOpenMembers와 onClose를 호출한다', async () => {
    const user = userEvent.setup();
    render(
      <CommandPaletteContainer
        open
        pages={[]}
        onNavigate={navMock}
        onClose={closeMock}
        workspace={wsShared}
        onOpenMembers={openMembersMock}
      />,
    );

    await user.click(screen.getByText('멤버 관리 열기'));

    expect(openMembersMock).toHaveBeenCalledTimes(1);
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it('로그아웃 클릭 시 onLogout과 onClose를 호출한다(라우팅은 컨테이너 밖에서 검증)', async () => {
    const user = userEvent.setup();
    render(
      <CommandPaletteContainer open pages={[]} onNavigate={navMock} onClose={closeMock} onLogout={logoutMock} />,
    );

    await user.click(screen.getByText('로그아웃'));

    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it('AC-A12: 사람 항목 클릭 시 onOpenMembers와 onClose를 호출한다', async () => {
    const user = userEvent.setup();
    render(
      <CommandPaletteContainer
        open
        pages={[]}
        onNavigate={navMock}
        onClose={closeMock}
        workspace={wsShared}
        members={members}
        onOpenMembers={openMembersMock}
      />,
    );

    await user.click(screen.getByText('홍길동'));

    expect(openMembersMock).toHaveBeenCalledTimes(1);
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it('AC-A16: 방향키가 페이지 그룹 끝에서 사람 그룹 첫 항목으로 경계를 넘어간다(Enter-프록시)', async () => {
    const user = userEvent.setup();
    render(
      <CommandPaletteContainer
        open
        pages={fixture}
        onNavigate={navMock}
        onClose={closeMock}
        workspace={wsShared}
        members={members}
        onOpenMembers={openMembersMock}
      />,
    );
    const input = screen.getByRole('textbox', { name: '명령 검색' });
    input.focus();

    // flat 순서: 페이지 5개(p1~p5, index0~4) → 사람 2명(홍길동 index5, 김철수 index6) → 명령…
    // 초기 activeIndex=0. ↓ 5회로 페이지 끝을 넘어 사람 그룹 첫 항목(홍길동)까지 이동 후 Enter.
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{Enter}');

    expect(openMembersMock).toHaveBeenCalledTimes(1);
    expect(closeMock).toHaveBeenCalledTimes(1);
    expect(navMock).not.toHaveBeenCalled();
  });

  it('AC-A17: 방향키로 "설정 열기"까지 이동한 뒤 Enter로 실행한다(키보드만)', async () => {
    const user = userEvent.setup();
    const onlyPage: Page[] = [page({ id: 'q1', title: '단일 페이지' })];
    render(
      <CommandPaletteContainer
        open
        pages={onlyPage}
        onNavigate={navMock}
        onClose={closeMock}
        onOpenSettings={openSettingsMock}
        onOpenHelp={openHelpMock}
        onToggleTheme={toggleThemeMock}
        onLogout={logoutMock}
      />,
    );
    const input = screen.getByRole('textbox', { name: '명령 검색' });
    input.focus();

    // flat 순서: 단일 페이지(index0) → 설정 열기(index1) → 도움말 열기 → 테마 전환 → 로그아웃.
    // workspace 미확정이라 '새 페이지 만들기'·'멤버 관리 열기'는 후보에 없다(설계서 명령 순서 고정 규칙).
    await user.keyboard('{ArrowDown}{Enter}');

    expect(openSettingsMock).toHaveBeenCalledTimes(1);
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it('AC-A21: loading이면 명령·사람·페이지 항목 없이 "불러오는 중…"만 노출한다', () => {
    render(
      <CommandPaletteContainer
        open
        pages={fixture}
        loading
        onNavigate={navMock}
        onClose={closeMock}
        workspace={wsShared}
        members={members}
        onOpenSettings={openSettingsMock}
        onOpenHelp={openHelpMock}
        onToggleTheme={toggleThemeMock}
        onCreatePage={createPageMock}
        onOpenMembers={openMembersMock}
        onLogout={logoutMock}
      />,
    );

    expect(screen.getByText('불러오는 중…')).toBeInTheDocument();
    expect(screen.queryByText('페이지')).not.toBeInTheDocument();
    expect(screen.queryByText('사람 찾기')).not.toBeInTheDocument();
    expect(screen.queryByText('명령 실행')).not.toBeInTheDocument();
    expect(screen.queryByText('설정 열기')).not.toBeInTheDocument();
    expect(screen.queryByText('홍길동')).not.toBeInTheDocument();
    expect(screen.queryByText('주간 회의록')).not.toBeInTheDocument();
    // 항목 0개: getAllByRole는 0매치 시 throw하므로 queryAllByRole로 빈 목록을 단정한다(208행과 동일 관용).
    const dialog = screen.getByRole('dialog', { name: '명령 팔레트' });
    expect(within(dialog).queryAllByRole('button')).toHaveLength(0);
  });

  it('AC-A22: workspace가 null이면 컨텍스트 의존 명령은 숨기고 상시 명령만 노출한다', () => {
    render(
      <CommandPaletteContainer
        open
        pages={[]}
        onNavigate={navMock}
        onClose={closeMock}
        workspace={null}
        onCreatePage={createPageMock}
        onOpenSettings={openSettingsMock}
        onOpenHelp={openHelpMock}
        onToggleTheme={toggleThemeMock}
        onOpenMembers={openMembersMock}
        onLogout={logoutMock}
      />,
    );

    expect(screen.queryByText('새 페이지 만들기')).not.toBeInTheDocument();
    expect(screen.queryByText('멤버 관리 열기')).not.toBeInTheDocument();
    expect(screen.getByText('설정 열기')).toBeInTheDocument();
    expect(screen.getByText('도움말 열기')).toBeInTheDocument();
    expect(screen.getByText('테마 전환')).toBeInTheDocument();
    expect(screen.getByText('로그아웃')).toBeInTheDocument();
  });

  it('AC-A23: 명령 검색어로 좁힌 뒤 닫았다 다시 열면 입력이 비워지고 세 그룹이 다시 노출된다', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <CommandPaletteContainer
        open
        pages={fixture}
        onNavigate={navMock}
        onClose={closeMock}
        workspace={wsShared}
        members={members}
        onOpenSettings={openSettingsMock}
      />,
    );

    await user.type(screen.getByRole('textbox', { name: '명령 검색' }), '설정');
    expect(screen.queryByText('페이지')).not.toBeInTheDocument();
    expect(screen.queryByText('사람 찾기')).not.toBeInTheDocument();
    expect(screen.getByText('설정 열기')).toBeInTheDocument();

    rerender(
      <CommandPaletteContainer
        open={false}
        pages={fixture}
        onNavigate={navMock}
        onClose={closeMock}
        workspace={wsShared}
        members={members}
        onOpenSettings={openSettingsMock}
      />,
    );
    rerender(
      <CommandPaletteContainer
        open
        pages={fixture}
        onNavigate={navMock}
        onClose={closeMock}
        workspace={wsShared}
        members={members}
        onOpenSettings={openSettingsMock}
      />,
    );

    expect(screen.getByRole('textbox', { name: '명령 검색' })).toHaveValue('');
    expect(screen.getByText('페이지')).toBeInTheDocument();
    expect(screen.getByText('사람 찾기')).toBeInTheDocument();
    expect(screen.getByText('명령 실행')).toBeInTheDocument();
  });

  // ── 보안 감사 MEDIUM #3: 사람 그룹 지연 삽입 시 activeIndex stale 문제 ──

  it('AC-SEC-M3: 사람 그룹이 지연 삽입되면 activeIndex를 0으로 리셋해 stale 하이라이트로 엉뚱한 항목이 실행되지 않는다', async () => {
    const user = userEvent.setup();
    const singlePage: Page[] = [page({ id: 'sec1', title: '보안 감사 페이지' })];
    const { rerender } = render(
      <CommandPaletteContainer
        open
        pages={singlePage}
        onNavigate={navMock}
        onClose={closeMock}
        workspace={wsShared}
        members={[]}
        onOpenSettings={openSettingsMock}
        onOpenHelp={openHelpMock}
        onToggleTheme={toggleThemeMock}
        onLogout={logoutMock}
      />,
    );
    const input = screen.getByRole('textbox', { name: '명령 검색' });
    input.focus();

    // members=[]인 동안(비동기 조회 완료 전) flat 순서: 보안 감사 페이지(index0) →
    // 설정 열기(1) → 도움말 열기(2) → 테마 전환(3) → 로그아웃(4).
    // ↓ 4회로 하이라이트를 명령 그룹의 마지막 항목(로그아웃)까지 이동시킨다.
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}');

    // usePaletteMembers의 비동기 완료를 흉내: 같은 인스턴스에 members를 채워 rerender한다.
    // "사람 찾기" 그룹이 페이지와 명령 사이에 삽입되어 flat 인덱스가 밀린다.
    rerender(
      <CommandPaletteContainer
        open
        pages={singlePage}
        onNavigate={navMock}
        onClose={closeMock}
        workspace={wsShared}
        members={members}
        onOpenSettings={openSettingsMock}
        onOpenHelp={openHelpMock}
        onToggleTheme={toggleThemeMock}
        onLogout={logoutMock}
      />,
    );

    await user.keyboard('{Enter}');

    // 기대: members 변화로 activeIndex가 0으로 리셋되어 첫 항목(보안 감사 페이지)의 onSelect가 실행된다.
    expect(navMock).toHaveBeenCalledWith('sec1');
    expect(closeMock).toHaveBeenCalledTimes(1);
    // 이동 전 하이라이트했던 로그아웃은 실행되지 않아야 한다.
    expect(logoutMock).not.toHaveBeenCalled();
  });
});
