import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import CommandPaletteContainer from '../CommandPaletteContainer';
import type { Page } from '@/src/lib/types';

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

let navMock: ReturnType<typeof vi.fn>;
let closeMock: ReturnType<typeof vi.fn>;

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
});
