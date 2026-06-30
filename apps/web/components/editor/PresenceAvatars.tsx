'use client';

// ─── P6 presence 아바타 목록 (presentational) ────────────────────
// 접속자(self 포함, 강조 없음)를 색상 배지 + 이니셜로 렌더한다. props만 사용하므로
// 데이터 출처(usePresence/relay)와 분리되어 render 단위로 검증된다.

import type { PresenceInfo } from '@/src/lib/realtime/protocol';

/** 이니셜 = displayName의 '#' 뒤 첫 글자 대문자 ("사용자 #a1b2" → "A"). siteId hex 식별. */
function initialOf(displayName: string): string {
  const afterHash = displayName.includes('#')
    ? (displayName.split('#').pop() ?? '')
    : displayName;
  const ch = afterHash.trim().charAt(0) || displayName.charAt(0);
  return ch.toUpperCase();
}

export default function PresenceAvatars({ presences }: { presences: PresenceInfo[] }) {
  return (
    <div role="list" aria-label="접속자" data-testid="presence-avatars" className="flex items-center">
      {presences.map((p, i) => (
        <div
          key={p.clientId}
          role="listitem"
          aria-label={p.displayName}
          title={p.displayName}
          data-color={p.color}
          style={{ backgroundColor: p.color }}
          className={`flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 border-surface text-xs font-bold text-black sm:h-[30px] sm:w-[30px]${
            i > 0 ? ' -ml-[10px]' : ''
          }`}
        >
          {initialOf(p.displayName)}
        </div>
      ))}
    </div>
  );
}
