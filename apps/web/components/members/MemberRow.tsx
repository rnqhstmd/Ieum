'use client';

import type { Membership } from '@/src/lib/types';
import RoleBadge from './RoleBadge';
import { avatarColor, initialOf } from './avatar';

interface Props {
  member: Membership;
  /** 현재 로그인 사용자 본인 여부 → '(나)' 표기 */
  isSelf: boolean;
  /** OWNER 뷰에서만 ⋯ 메뉴 노출 (본인 행 제외) */
  canManage: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  /** 스텁 — updateMemberRole 연결 전까지 메뉴만 닫힘 */
  onChangeRole: () => void;
  /** 스텁 — removeMember 연결 전까지 메뉴만 닫힘 */
  onRemove: () => void;
}

/** 멤버 목록 행 — 아바타 + 이름/이메일 + 역할 뱃지 (+OWNER면 ⋯ 컨텍스트 메뉴) */
export default function MemberRow({
  member,
  isSelf,
  canManage,
  menuOpen,
  onToggleMenu,
  onChangeRole,
  onRemove,
}: Props) {
  const showMenu = canManage && !isSelf;

  return (
    <div className="flex items-center gap-3 border-b border-hair-3 py-[13px] last:border-b-0">
      <span
        aria-hidden
        style={{ backgroundColor: avatarColor(member.userId || member.userEmail) }}
        className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full text-[14px] font-bold text-black"
      >
        {initialOf(member.userName)}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[14.5px] font-semibold text-ink">{member.userName}</span>
          {isSelf && <span className="flex-none text-[12px] text-fainter">(나)</span>}
        </div>
        <div className="truncate text-[12.5px] text-faint">{member.userEmail}</div>
      </div>

      <div className="relative flex flex-none items-center gap-2" data-member-menu-root>
        <RoleBadge role={member.role} />

        {showMenu && (
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`${member.userName} 멤버 작업`}
            onClick={onToggleMenu}
            className="flex h-7 w-7 items-center justify-center rounded-md text-dim hover:bg-hover hover:text-ink"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="currentColor">
              <circle cx="5" cy="12" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="19" cy="12" r="1.6" />
            </svg>
          </button>
        )}

        {showMenu && menuOpen && (
          <div
            role="menu"
            aria-label={`${member.userName} 작업`}
            className="absolute right-0 top-[52px] z-10 w-[170px] rounded-[10px] border border-hair bg-deep p-1.5"
          >
            <button
              type="button"
              role="menuitem"
              onClick={onChangeRole}
              className="block w-full rounded-md px-3 py-[9px] text-left text-[13px] text-ink hover:bg-hover"
            >
              역할 변경
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={onRemove}
              className="block w-full rounded-md px-3 py-[9px] text-left text-[13px] text-danger hover:bg-hover"
            >
              내보내기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
