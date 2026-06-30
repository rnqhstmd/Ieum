'use client';

import type { Invitation } from '@/src/lib/types';

/** expiresAt까지 남은 일수(올림). 과거/오늘이면 0 이하. */
function daysUntil(iso: string): number {
  const diffMs = new Date(iso).getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/** '초대됨 · {n}일 후 만료' 메타 라벨 (만료 임박/지남은 '곧 만료'). */
function metaLabel(expiresAt: string): string {
  const days = daysUntil(expiresAt);
  return days <= 0 ? '초대됨 · 곧 만료' : `초대됨 · ${days}일 후 만료`;
}

interface Props {
  invitation: Invitation;
  /** 스텁 — revokeInvitation 연결 전까지 동작 없음 */
  onRevoke: () => void;
}

/** 보류 중(PENDING) 초대 행 — dashed 아바타 + 이메일 + 만료 메타 + 취소(스텁) */
export default function PendingInviteRow({ invitation, onRevoke }: Props) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span
        aria-hidden
        className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full border border-dashed border-hair text-[14px] text-fainter"
      >
        @
      </span>

      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium text-body">{invitation.email}</div>
        <div className="text-[12px] text-faint">{metaLabel(invitation.expiresAt)}</div>
      </div>

      <button
        type="button"
        aria-label={`${invitation.email} 초대 취소`}
        onClick={onRevoke}
        className="flex-none text-[13px] text-faint underline underline-offset-[3px] hover:text-body"
      >
        취소
      </button>
    </div>
  );
}
