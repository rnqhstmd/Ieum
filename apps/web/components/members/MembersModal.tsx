'use client';

// ─── 멤버 관리 모달 (변형 A) ─────────────────────────────────────
// 데스크탑 중앙 모달 / 모바일 바텀시트. 마운트 시 me + members(+OWNER면 invitations)를
// 조회해 OWNER/MEMBER 뷰를 분기한다. 변경 액션(초대/역할/내보내기/취소)은 실제 백엔드에
// 배선되어 있으며(실제 mutation/이메일 발송), 성공 시 목록을 재조회해 즉시 반영한다.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { redirectOnAuthError } from '@/src/lib/auth/redirectOnAuthError';
import { getCurrentUser } from '@/src/lib/users';
import { listMembers, updateMemberRole, removeMember } from '@/src/lib/members';
import { listInvitations, createInvitation, revokeInvitation } from '@/src/lib/invitations';
import type { CurrentUser, Invitation, MemberRole, Membership } from '@/src/lib/types';
import ConfirmDialog from '@/components/overlays/ConfirmDialog';
import { useToast } from '@/components/states/ToastProvider';
import InviteRow from './InviteRow';
import MemberRow from './MemberRow';
import PendingInviteRow from './PendingInviteRow';

type Status = 'loading' | 'ready' | 'error';

interface Props {
  workspaceId: string;
  workspaceName?: string;
  onClose: () => void;
}

export default function MembersModal({ workspaceId, workspaceName, onClose }: Props) {
  const router = useRouter();
  const { showError } = useToast();
  const [status, setStatus] = useState<Status>('loading');
  const [me, setMe] = useState<CurrentUser | null>(null);
  const [members, setMembers] = useState<Membership[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  /** 컨텍스트 메뉴가 열린 멤버의 userId (없으면 null) */
  const [openMenuUserId, setOpenMenuUserId] = useState<string | null>(null);
  /** 내보내기 확인 대상 멤버(파괴적). null이면 확인 다이얼로그 닫힘. */
  const [removeTarget, setRemoveTarget] = useState<Membership | null>(null);
  /** 초대 발송 중 — 중복 제출 방지 */
  const [inviting, setInviting] = useState(false);

  const myRole = me ? members.find((m) => m.userId === me.id)?.role : undefined;
  const canManage = myRole === 'OWNER';
  const pendingInvites = invitations.filter((inv) => inv.status === 'PENDING');

  // ── 멤버/초대 재조회 로직 (마운트·변경 액션 공용) ──
  // OWNER만 초대 목록 조회 권한이 있으므로 user 역할로 분기한다. getCurrentUser는 마운트 1회면 충분.
  const fetchLists = async (user: CurrentUser) => {
    const memberList = await listMembers(workspaceId);
    const owner = memberList.find((m) => m.userId === user.id)?.role === 'OWNER';
    const inviteList = owner ? await listInvitations(workspaceId) : [];
    return { memberList, inviteList };
  };

  /** 변경 액션 후 목록을 다시 불러와 UI를 갱신한다(me 확정 이후 호출). */
  const reload = async () => {
    if (!me) return;
    const { memberList, inviteList } = await fetchLists(me);
    setMembers(memberList);
    setInvitations(inviteList);
  };

  /** 변경 액션 실패 처리 — 401이면 로그인 유도, 그 외 전역 토스트로 알림. */
  const handleActionError = (e: unknown) => {
    if (redirectOnAuthError(e, router)) return;
    showError('작업을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  };

  // ── 마운트 시 조회 ──
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const user = await getCurrentUser();
        if (!active) return;
        setMe(user);
        const { memberList, inviteList } = await fetchLists(user);
        if (!active) return;
        setMembers(memberList);
        setInvitations(inviteList);
        setStatus('ready');
      } catch (e) {
        if (!active) return;
        if (redirectOnAuthError(e, router)) return;
        setStatus('error');
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  // ── Escape로 닫기 ──
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // ── 컨텍스트 메뉴 외부 클릭 닫기 ──
  useEffect(() => {
    if (openMenuUserId === null) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target?.closest('[data-member-menu-root]')) setOpenMenuUserId(null);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [openMenuUserId]);

  // ── 변경 액션: 실제 백엔드 배선 (OWNER 전용, 실제 mutation/이메일 발송) ──
  // mutation과 reload를 분리: mutation 실패만 에러로 알리고, 성공 후 reload 실패는
  // 액션이 이미 완료됐으므로 조용히 무시한다(다음 진입 시 최신화). 오해/중복 방지.
  const closeMenu = () => setOpenMenuUserId(null);

  /** 초대 발송 — createInvitation 후 초대 목록 재조회 (실제 이메일 발송). 중복 제출 방지. */
  const handleInvite = async (email: string, role: MemberRole) => {
    if (!me || inviting) return;
    setInviting(true);
    try {
      await createInvitation(workspaceId, { email, role });
    } catch (e) {
      handleActionError(e);
      setInviting(false);
      return;
    }
    try {
      await reload();
    } catch {
      /* 목록 갱신만 실패 — 초대는 완료됨 */
    } finally {
      setInviting(false);
    }
  };

  /** 역할 토글 — OWNER↔MEMBER 변경 후 멤버 목록 재조회. (본인 제외) */
  const handleChangeRole = async (member: Membership) => {
    if (!me || member.userId === me.id) return;
    closeMenu();
    try {
      await updateMemberRole(workspaceId, member.userId, member.role === 'OWNER' ? 'MEMBER' : 'OWNER');
    } catch (e) {
      handleActionError(e);
      return;
    }
    try {
      await reload();
    } catch {
      /* 목록 갱신만 실패 — 변경은 완료됨 */
    }
  };

  /** 멤버 내보내기 요청 — 파괴적이므로 ConfirmDialog로 확인을 받는다. (본인 제외) */
  const handleRemove = (member: Membership) => {
    if (!me || member.userId === me.id) return;
    closeMenu();
    setRemoveTarget(member);
  };

  /** 내보내기 확인 → removeMember(파괴적), 성공 시 재조회. mutation/reload 분리 유지. */
  const handleConfirmRemove = async () => {
    const member = removeTarget;
    setRemoveTarget(null);
    if (!me || !member) return;
    try {
      await removeMember(workspaceId, member.userId);
    } catch (e) {
      handleActionError(e);
      return;
    }
    try {
      await reload();
    } catch {
      /* 목록 갱신만 실패 — 제거는 완료됨 */
    }
  };

  /** 초대 취소 — revokeInvitation 후 초대 목록 재조회. */
  const handleRevoke = async (invitation: Invitation) => {
    if (!me) return;
    try {
      await revokeInvitation(workspaceId, invitation.id);
    } catch (e) {
      handleActionError(e);
      return;
    }
    try {
      await reload();
    } catch {
      /* 목록 갱신만 실패 — 취소는 완료됨 */
    }
  };

  const subtitle =
    status === 'ready'
      ? `${workspaceName ? `${workspaceName} · ` : ''}${members.length}명`
      : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* 백드롭 */}
      <div className="absolute inset-0 bg-black/60" aria-hidden onClick={onClose} />

      {/* 모달/바텀시트 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="멤버 관리"
        className="relative z-10 flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-[18px] border-t border-hair bg-surface sm:w-[580px] sm:rounded-[14px] sm:border"
      >
        {/* 모바일 그랩 핸들 */}
        <div aria-hidden className="flex justify-center pt-2.5 sm:hidden">
          <span className="h-1 w-[38px] rounded-full bg-[#26262b]" />
        </div>

        {/* 헤더 */}
        <div className="flex items-center border-b border-hair-3 px-7 pb-5 pt-6">
          <div className="min-w-0 flex-1">
            <h2 className="text-[20px] font-bold tracking-[-0.4px] text-ink">멤버</h2>
            {subtitle && <p className="text-[13px] text-faint">{subtitle}</p>}
          </div>
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="flex-none text-dim hover:text-ink"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* 본문 */}
        <div className="min-h-0 flex-1 overflow-auto">
          {status === 'loading' && (
            <p className="px-7 py-10 text-[13px] text-faint">불러오는 중…</p>
          )}

          {status === 'error' && (
            <p role="alert" className="px-7 py-10 text-[13px] text-danger">
              멤버 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
            </p>
          )}

          {status === 'ready' && (
            <>
              {/* 초대 행 — OWNER만 */}
              {canManage && <InviteRow onInvite={handleInvite} disabled={inviting} />}

              {/* 멤버 목록 */}
              <div className="px-7 pb-2 pt-3.5">
                {members.map((member) => (
                  <MemberRow
                    key={member.membershipId}
                    member={member}
                    isSelf={member.userId === me?.id}
                    canManage={canManage}
                    menuOpen={openMenuUserId === member.userId}
                    onToggleMenu={() =>
                      setOpenMenuUserId((cur) =>
                        cur === member.userId ? null : member.userId,
                      )
                    }
                    onChangeRole={() => handleChangeRole(member)}
                    onRemove={() => handleRemove(member)}
                  />
                ))}
              </div>

              {/* 보류 중 초대 — OWNER만, PENDING 존재 시 */}
              {canManage && pendingInvites.length > 0 && (
                <div className="mt-1.5 border-t border-hair-3 px-7 pb-6 pt-4">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[1.6px] text-fainter">
                    보류 중 초대 · {pendingInvites.length}
                  </div>
                  {pendingInvites.map((inv) => (
                    <PendingInviteRow key={inv.id} invitation={inv} onRevoke={() => handleRevoke(inv)} />
                  ))}
                </div>
              )}

              {/* MEMBER 뷰 안내 */}
              {!canManage && (
                <div className="px-7 pb-6 pt-4">
                  <p className="text-[12.5px] text-fainter">
                    멤버 초대와 역할 관리는 관리자(OWNER)만 할 수 있습니다.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {removeTarget && (
        <ConfirmDialog
          title="멤버를 내보낼까요?"
          message={`${removeTarget.userName} 님이 이 워크스페이스에서 제거됩니다.`}
          confirmLabel="내보내기"
          destructive
          onConfirm={handleConfirmRemove}
          onCancel={() => setRemoveTarget(null)}
        />
      )}
    </div>
  );
}
