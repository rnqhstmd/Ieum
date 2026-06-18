import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PageTree from '@/components/sidebar/PageTree';
import type { Page } from '@/src/lib/types';

const node = (over: Partial<Page>): Page => ({
  id: 'x',
  workspaceId: 'w1',
  parentPageId: null,
  title: 'T',
  icon: null,
  position: 0,
  createdById: 'u1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  children: null,
  ...over,
});

describe('PageTree', () => {
  it('AC-6: 부모 A{자식 B, 자식 C}를 렌더하면 A와 자식 B·C가 표시된다(기본 펼침)', () => {
    const tree = [
      node({ id: 'a', title: 'A', children: [node({ id: 'b', parentPageId: 'a', title: 'B' }), node({ id: 'c', parentPageId: 'a', title: 'C' })] }),
    ];
    render(<PageTree pages={tree} onNavigate={vi.fn()} />);

    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
  });

  it('AC-7: 부모 노드의 토글(chevron)을 클릭하면 자식 가시성이 토글된다', async () => {
    const user = userEvent.setup();
    const tree = [node({ id: 'a', title: 'A', children: [node({ id: 'b', parentPageId: 'a', title: 'B' })] })];
    render(<PageTree pages={tree} onNavigate={vi.fn()} />);

    expect(screen.getByText('B')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '접기' }));
    expect(screen.queryByText('B')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '펼치기' }));
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('AC-8: 페이지 행 클릭 시 onNavigate(pageId)가 호출된다', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const tree = [node({ id: 'a', title: 'A', children: [node({ id: 'b', parentPageId: 'a', title: 'B' })] })];
    render(<PageTree pages={tree} onNavigate={onNavigate} />);

    await user.click(screen.getByRole('button', { name: 'B' }));
    expect(onNavigate).toHaveBeenCalledWith('b');
  });

  it('AC-11: 페이지가 0건이면 빈 상태 안내가 표시된다', () => {
    render(<PageTree pages={[]} onNavigate={vi.fn()} />);
    expect(screen.getByText(/페이지가 없습니다/)).toBeInTheDocument();
  });

  it('W2: 행의 "하위 추가" 버튼 클릭 시 onCreateChild(pageId)가 호출된다', async () => {
    const user = userEvent.setup();
    const onCreateChild = vi.fn();
    render(<PageTree pages={[node({ id: 'a', title: 'A' })]} onNavigate={vi.fn()} onCreateChild={onCreateChild} />);

    await user.click(screen.getByRole('button', { name: 'A 하위 추가' }));
    expect(onCreateChild).toHaveBeenCalledWith('a');
  });

  it('AC-F3: 인라인 이름 변경 — "이름 변경" 클릭 → 입력 → Enter → onRename(id, newTitle)', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    render(<PageTree pages={[node({ id: 'a', title: 'A' })]} onNavigate={vi.fn()} onRename={onRename} />);

    await user.click(screen.getByRole('button', { name: 'A 이름 변경' }));
    const input = screen.getByRole('textbox', { name: '페이지 이름' });
    fireEvent.change(input, { target: { value: 'B' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onRename).toHaveBeenCalledWith('a', 'B');
  });

  it('AC-F4: 이름 변경 중 Escape를 누르면 취소되고 onRename이 호출되지 않는다', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    render(<PageTree pages={[node({ id: 'a', title: 'A' })]} onNavigate={vi.fn()} onRename={onRename} />);

    await user.click(screen.getByRole('button', { name: 'A 이름 변경' }));
    const input = screen.getByRole('textbox', { name: '페이지 이름' });
    fireEvent.change(input, { target: { value: 'X' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: '페이지 이름' })).not.toBeInTheDocument();
  });

  it('AC-F5: 아이콘 설정 — "아이콘 변경" 클릭 → 이모지 입력 → Enter → onSetIcon(id, value)', async () => {
    const user = userEvent.setup();
    const onSetIcon = vi.fn();
    render(<PageTree pages={[node({ id: 'a', title: 'A' })]} onNavigate={vi.fn()} onSetIcon={onSetIcon} />);

    await user.click(screen.getByRole('button', { name: 'A 아이콘 변경' }));
    const input = screen.getByRole('textbox', { name: '페이지 아이콘' });
    fireEvent.change(input, { target: { value: '🔥' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSetIcon).toHaveBeenCalledWith('a', '🔥');
  });

  it('AC-F6: 아카이브 — "아카이브" 클릭 → onArchive(id)', async () => {
    const user = userEvent.setup();
    const onArchive = vi.fn();
    render(<PageTree pages={[node({ id: 'a', title: 'A' })]} onNavigate={vi.fn()} onArchive={onArchive} />);

    await user.click(screen.getByRole('button', { name: 'A 아카이브' }));
    expect(onArchive).toHaveBeenCalledWith('a');
  });

  it('PR리뷰#3: 편집 중에는 행 액션 버튼(아카이브·하위 추가)이 숨겨진다', async () => {
    const user = userEvent.setup();
    render(
      <PageTree
        pages={[node({ id: 'a', title: 'A' })]}
        onNavigate={vi.fn()}
        onRename={vi.fn()}
        onSetIcon={vi.fn()}
        onArchive={vi.fn()}
        onCreateChild={vi.fn()}
      />,
    );

    // 편집 진입 전엔 액션 노출
    expect(screen.getByRole('button', { name: 'A 아카이브' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'A 이름 변경' }));

    // 편집 중엔 액션 그룹 전체 숨김(오작동 방지)
    expect(screen.queryByRole('button', { name: 'A 아카이브' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'A 하위 추가' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '페이지 이름' })).toBeInTheDocument();
  });

  it('PR리뷰#1: Enter 커밋은 onRename을 정확히 1회 호출한다(중복 커밋 가드)', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    render(<PageTree pages={[node({ id: 'a', title: 'A' })]} onNavigate={vi.fn()} onRename={onRename} />);

    await user.click(screen.getByRole('button', { name: 'A 이름 변경' }));
    const input = screen.getByRole('textbox', { name: '페이지 이름' });
    fireEvent.change(input, { target: { value: 'B' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onRename).toHaveBeenCalledWith('a', 'B');
  });

  it('PR리뷰: WAI-ARIA Tree 마크업(treeitem/aria-expanded/group)을 따른다', () => {
    const tree = [node({ id: 'a', title: 'A', children: [node({ id: 'b', parentPageId: 'a', title: 'B' })] })];
    render(<PageTree pages={tree} onNavigate={vi.fn()} />);

    const items = screen.getAllByRole('treeitem');
    expect(items).toHaveLength(2); // A, B
    const a = items.find((el) => el.textContent?.includes('A'));
    expect(a).toHaveAttribute('aria-expanded', 'true'); // 부모는 펼침 상태
    expect(screen.getByRole('group')).toBeInTheDocument(); // 하위 ul
  });
});
