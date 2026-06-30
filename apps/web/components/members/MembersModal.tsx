'use client';

// ─── 멤버 관리 모달 (변형 A) ─────────────────────────────────────
// 데스크탑 중앙 모달 / 모바일 바텀시트. 마운트 시 me + members(+OWNER면 invitations)를
// 조회해 OWNER/MEMBER 뷰를 분기한다. 변경 액션(초대/역할/내보내기/취소)은 이번 범위에서
// 미배선 — 핸들러는 스텁이며 대응 클라이언트 함수는 TODO 주석으로 명시한다.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/src/lib/api';
import { getCurrentUser } from '@/src/lib/users';
import { listMembers } from '@/src/lib/members';
import { listInvitations } from '@/src/lib/invitations';
import type { CurrentUser, Invitation, Membership } from '@/src/lib/types';
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
  const [status, setStatus] = useState<Status>('loading');
  const [me, setMe] = useState<CurrentUser | null>(null);
  const [members, setMembers] = useState<Membership[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  /** 컨텍스트 메뉴가 열린 멤버의 userId (없으면 null) */
  const [openMenuUserId, setOpenMenuUserId] = useState<string | null>(null);

  const myRole = me ? members.find((m) => m.userId === me.id)?.role : undefined;
  const canManage = myRole === 'OWNER';
  const pendingInvites = invitations.filter((inv) => inv.status === 'PENDING');

  // ── 마운트 시 조회 (GET만 배선) ──
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [user, memberList] = await Promise.all([
          getCurrentUser(),
          listMembers(workspaceId),
        ]);
        if (!active) return;
        setMe(user);
        setMembers(memberList);

        // OWNER만 초대 목록 조회 권한이 있다.
        const owner = memberList.find((m) => m.userId === user.id)?.role === 'OWNER';
        if (owner) {
          const inviteList = await listInvitations(workspaceId);
          if (!active) return;
          setInvitations(inviteList);
        }
        if (!active) return;
        setStatus('ready');
      } catch (e) {
        if (!active) return;
        if (e instanceof ApiError && e.status === 401) {
          router.push('/login');
          return;
        }
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

  // ── 변경 액션: 스텁 (이번 범위 미배선, 실제 mutation/이메일 발송 없음) ──
  const closeMenu = () => setOpenMenuUserId(null);
  // TODO: createInvitation(workspaceId, { email, role }) 연결 (OWNER, 실제 이메일 발송)
  const handleInvite = () => {
    /* no-op: 초대 발송 미배선 */
  };
  // TODO: updateMemberRole(workspaceId, userId, nextRole) 연결 (OWNER)
  const handleChangeRole = () => {
    closeMenu();
  };
  // TODO: removeMember(workspaceId, userId) 연결 (OWNER)
  const handleRemove = () => {
    closeMenu();
  };
  // TODO: revokeInvitation(workspaceId, invitationId) 연결 (OWNER, PENDING)
  const handleRevoke = () => {
    /* no-op: 초대 취소 미배선 */
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
              {canManage && <InviteRow onInvite={handleInvite} />}

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
                    onChangeRole={handleChangeRole}
                    onRemove={handleRemove}
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
                    <PendingInviteRow key={inv.id} invitation={inv} onRevoke={handleRevoke} />
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
    </div>
  );
}
