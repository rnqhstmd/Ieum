import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
