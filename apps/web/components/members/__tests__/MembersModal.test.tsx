import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/states/ToastProvider';
import { ApiError } from '@/src/lib/api';
import type { CurrentUser, Membership } from '@/src/lib/types';

// AC-B1/B2/B3 (feat-palette-search-global-toast prd.md 기능 B) —
// MembersModal의 handleActionError는 alert() 대신 useToast().showError를 호출해야 한다.
// 현재 구현은 alert()를 사용하므로 아래 "alert 미호출 + 토스트 렌더" 단정은 반드시 RED다.

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));

vi.mock('@/src/lib/users', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/src/lib/members', () => ({
  listMembers: vi.fn(),
  updateMemberRole: vi.fn(),
  removeMember: vi.fn(),
}));
vi.mock('@/src/lib/invitations', () => ({
  listInvitations: vi.fn(),
  createInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
}));

import MembersModal from '../MembersModal';
import { getCurrentUser } from '@/src/lib/users';
import { listMembers, updateMemberRole, removeMember } from '@/src/lib/members';
import { listInvitations } from '@/src/lib/invitations';

const me: CurrentUser = { id: 'u1', email: 'owner@ex.com', name: '오너', token: 't' };

const ownerMembership: Membership = {
  membershipId: 'm1',
  userId: 'u1',
  userEmail: 'owner@ex.com',
  userName: '오너',
  role: 'OWNER',
  joinedAt: '2026-01-01T00:00:00Z',
};

/** 본인(me)이 아닌 멤버 — 역할변경/내보내기 액션 대상(본인 행은 액션 불가). */
const other: Membership = {
  membershipId: 'm2',
  userId: 'u2',
  userEmail: 'other@ex.com',
  userName: '다른멤버',
  role: 'MEMBER',
  joinedAt: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue(me);
  vi.mocked(listMembers).mockResolvedValue([ownerMembership, other]);
  vi.mocked(listInvitations).mockResolvedValue([]);
});

/** ToastProvider로 감싸 렌더 후 'ready' 진입(다른 멤버 행 노출)까지 대기한다. */
async function renderReady() {
  render(
    <ToastProvider>
      <MembersModal workspaceId="ws1" workspaceName="워크스페이스" onClose={vi.fn()} />
    </ToastProvider>,
  );
  await screen.findByText('다른멤버');
}

/** '다른멤버' 행의 ⋯ 컨텍스트 메뉴를 열고 지정한 라벨의 menuitem을 클릭한다. */
async function openOtherMenuAndClick(user: ReturnType<typeof userEvent.setup>, itemLabel: string) {
  await user.click(screen.getByRole('button', { name: '다른멤버 멤버 작업' }));
  await user.click(screen.getByRole('menuitem', { name: itemLabel }));
}

describe('MembersModal — 변경 액션 실패 시 전역 토스트(AC-B1/B2/B3)', () => {
  it('AC-B1: 역할 변경 비401 실패 → window.alert 미호출 + 전역 토스트(role=alert) 렌더', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.mocked(updateMemberRole).mockRejectedValueOnce(new ApiError(500, '서버 오류'));
    const user = userEvent.setup();
    await renderReady();

    await openOtherMenuAndClick(user, '역할 변경');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('작업을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('AC-B2: 역할 변경 401 실패 → router.push(/login) 호출 + 토스트 미렌더', async () => {
    vi.mocked(updateMemberRole).mockRejectedValueOnce(new ApiError(401, '미인증'));
    const user = userEvent.setup();
    await renderReady();

    await openOtherMenuAndClick(user, '역할 변경');

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('AC-B3: 멤버 내보내기 비401 실패 → 동일 토스트 문구(role=alert) 렌더', async () => {
    vi.mocked(removeMember).mockRejectedValueOnce(new ApiError(500, '서버 오류'));
    const user = userEvent.setup();
    await renderReady();

    await openOtherMenuAndClick(user, '내보내기');
    // ConfirmDialog 확인 버튼 클릭 — menuitem과 문구는 같지만 role은 button(default)이다.
    await user.click(screen.getByRole('button', { name: '내보내기' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('작업을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  });
});
