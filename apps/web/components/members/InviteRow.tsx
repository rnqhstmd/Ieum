'use client';

import { useState } from 'react';
import type { MemberRole } from '@/src/lib/types';

interface Props {
  /** 스텁 — createInvitation 연결 전까지 동작 없음 (이메일 발송 X) */
  onInvite: (email: string, role: MemberRole) => void;
}

/** OWNER 전용 초대 입력 행 — 이메일 + 역할 셀렉트 + 초대 버튼. 제출은 스텁. */
export default function InviteRow({ onInvite }: Props) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('MEMBER');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onInvite(email, role);
  };

  return (
    <form onSubmit={handleSubmit} className="border-b border-hair-3 px-7 py-5">
      <label
        htmlFor="invite-email"
        className="mb-2.5 block text-[11px] font-semibold uppercase tracking-[1.6px] text-fainter"
      >
        이메일로 초대
      </label>
      <div className="flex gap-2.5">
        <input
          id="invite-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@company.com"
          className="min-w-0 flex-1 rounded-lg border border-hair bg-deep px-3.5 py-3 text-sm text-ink placeholder:text-fainter focus:outline-none"
        />
        {/* 모바일에선 역할 셀렉트를 숨겨 MEMBER로 고정한다.
            TODO: createInvitation 연결 시 모바일에도 역할 선택 수단(compact select 등)을 제공할 것. */}
        <select
          aria-label="역할"
          value={role}
          onChange={(e) => setRole(e.target.value as MemberRole)}
          className="hidden flex-none rounded-lg border border-hair bg-deep px-3 py-3 text-sm text-body sm:block"
        >
          <option value="MEMBER">멤버</option>
          <option value="OWNER">관리자</option>
        </select>
        <button
          type="submit"
          className="flex-none rounded-full border border-ink px-[22px] py-3 text-[12px] font-bold text-ink"
        >
          초대
        </button>
      </div>
    </form>
  );
}
