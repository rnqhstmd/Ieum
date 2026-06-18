import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/src/lib/workspaces', () => ({ listWorkspaces: vi.fn() }));
vi.mock('@/src/lib/pages', () => ({ getPageTree: vi.fn(), createPage: vi.fn() }));

import AppLayout from '@/app/(app)/layout';
import { listWorkspaces } from '@/src/lib/workspaces';
import { getPageTree } from '@/src/lib/pages';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listWorkspaces).mockResolvedValue([]);
  vi.mocked(getPageTree).mockResolvedValue([]);
});

describe('App shell', () => {
  it('AC-16: 앱 셸이 다크 서피스 컨테이너 + 사이드바 landmark + main으로 렌더된다', async () => {
    const { container } = render(<AppLayout>{<div>본문</div>}</AppLayout>);

    expect(await screen.findByLabelText('사이드바')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(container.querySelector('.bg-surface')).not.toBeNull();
  });
});
