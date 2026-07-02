import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Membership, Workspace } from '@/src/lib/types';
import { ApiError } from '@/src/lib/api';

// AC-A18/A19/A20 (prd.md 기능 A) — usePaletteMembers는
// SHARED + open일 때만 listMembers를 조회하고, 진행 중엔 빈 배열,
// 401은 /login 리다이렉트, 비401은 빈 배열 유지로 동작해야 한다.

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock('@/src/lib/members', () => ({ listMembers: vi.fn() }));

import { usePaletteMembers } from '../usePaletteMembers';
import { listMembers } from '@/src/lib/members';

const ws = (over: Partial<Workspace> = {}): Workspace => ({
  id: 'w1',
  name: 'WS',
  type: 'SHARED',
  ownerId: 'u1',
  createdAt: '2026-01-01T00:00:00Z',
  ...over,
});

const membership = (over: Partial<Membership> = {}): Membership => ({
  membershipId: 'm1',
  userId: 'u1',
  userEmail: 'a@example.com',
  userName: 'Alice',
  role: 'OWNER',
  joinedAt: '2026-01-01T00:00:00Z',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('usePaletteMembers', () => {
  it('AC-A18: 조회 진행 중엔 빈 배열, 응답 도착 후 멤버 배열을 반환한다', async () => {
    let resolvePromise!: (v: Membership[]) => void;
    const pending = new Promise<Membership[]>((resolve) => {
      resolvePromise = resolve;
    });
    vi.mocked(listMembers).mockReturnValue(pending);

    const workspace = ws();
    const { result } = renderHook(() => usePaletteMembers({ open: true, workspace }));

    // 조회 진행 중(미응답) 시점 — 빈 배열이어야 한다("사람 찾기" 그룹 숨김 근거)
    expect(result.current).toEqual([]);

    const members = [membership()];
    await act(async () => {
      resolvePromise(members);
      await pending;
    });

    await waitFor(() => expect(result.current).toEqual(members));
  });

  it('AC-A19: 멤버 조회가 401이면 /login으로 이동하고 빈 배열을 유지한다', async () => {
    vi.mocked(listMembers).mockRejectedValue(new ApiError(401, '미인증'));
    const workspace = ws();
    const { result } = renderHook(() => usePaletteMembers({ open: true, workspace }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login'));
    expect(result.current).toEqual([]);
  });

  it('AC-A20: 멤버 조회가 비401(500)이면 이동하지 않고 빈 배열을 유지한다', async () => {
    vi.mocked(listMembers).mockRejectedValue(new ApiError(500, '서버 오류'));
    const workspace = ws();
    const { result } = renderHook(() => usePaletteMembers({ open: true, workspace }));

    await waitFor(() => expect(listMembers).toHaveBeenCalledTimes(1));
    // 거부 처리(catch)가 마이크로태스크 큐에서 완료될 시간을 준다
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(pushMock).not.toHaveBeenCalled();
    expect(result.current).toEqual([]);
  });

  it('계약(a): PERSONAL 워크스페이스면 멤버 조회를 하지 않고 빈 배열을 반환한다', () => {
    const workspace = ws({ type: 'PERSONAL' });
    const { result } = renderHook(() => usePaletteMembers({ open: true, workspace }));

    expect(listMembers).not.toHaveBeenCalled();
    expect(result.current).toEqual([]);
  });

  it('계약(b): open이 false면 멤버 조회를 하지 않고 빈 배열을 반환한다', () => {
    const workspace = ws();
    const { result } = renderHook(() => usePaletteMembers({ open: false, workspace }));

    expect(listMembers).not.toHaveBeenCalled();
    expect(result.current).toEqual([]);
  });

  it('계약(c): open이 false→true로 전이하면 멤버 조회가 발생한다', async () => {
    vi.mocked(listMembers).mockResolvedValue([membership()]);
    const workspace = ws();
    const { rerender } = renderHook(
      (props: { open: boolean; workspace: Workspace | null }) => usePaletteMembers(props),
      { initialProps: { open: false, workspace } },
    );

    expect(listMembers).not.toHaveBeenCalled();

    rerender({ open: true, workspace });

    await waitFor(() => expect(listMembers).toHaveBeenCalledWith(workspace.id));
  });
});
