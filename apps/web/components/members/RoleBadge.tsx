import type { MemberRole } from '@/src/lib/types';

/** 역할 뱃지 — OWNER는 보더 pill('Owner · 관리자'), MEMBER는 보더 없는 텍스트('Member'). */
export default function RoleBadge({ role }: { role: MemberRole }) {
  if (role === 'OWNER') {
    return (
      <span className="rounded-full border border-hair px-[11px] py-[5px] text-[10px] font-semibold uppercase tracking-wide text-ink">
        Owner · 관리자
      </span>
    );
  }
  return <span className="text-[10px] font-semibold uppercase tracking-wide text-dim">Member</span>;
}
