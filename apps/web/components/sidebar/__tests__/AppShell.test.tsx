import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/src/lib/workspaces', () => ({ listWorkspaces: vi.fn() }));
vi.mock('@/src/lib/pages', () => ({ getPageTree: vi.fn(), createPage: vi.fn() }));

import AppShell from '@/components/sidebar/AppShell';
import { listWorkspaces } from '@/src/lib/workspaces';
import { getPageTree } from '@/src/lib/pages';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listWorkspaces).mockResolvedValue([]);
  vi.mocked(getPageTree).mockResolvedValue([]);
});

describe('AppShell', () => {
  it('W1: 모바일 햄버거로 사이드바 드로어를 토글한다', async () => {
    const user = userEvent.setup();
    render(<AppShell>{<div>본문</div>}</AppShell>);

    const burger = screen.getByLabelText('사이드바 열기');
    expect(burger).toHaveAttribute('aria-expanded', 'false');

    await user.click(burger);
    expect(burger).toHaveAttribute('aria-expanded', 'true');
  });

  it('AC-16: 다크 서피스 컨테이너 + 사이드바 landmark + main을 렌더한다', async () => {
    const { container } = render(<AppShell>{<div>본문</div>}</AppShell>);
    expect(await screen.findByLabelText('사이드바')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(container.querySelector('.bg-surface')).not.toBeNull();
  });
});
