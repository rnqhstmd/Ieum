// 초대 수락 라우트 — /invite?token=...&state=...
// 서버 컴포넌트: 클라이언트 로직(useSearchParams)은 invite-content.tsx로 분리하고
// Next 15 요건에 맞춰 <Suspense>로 감싼다.

import { Suspense } from 'react';
import InviteContent from './invite-content';

function LoadingCard() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-deep px-7 text-center">
      <p className="text-[14px] text-dim">불러오는 중…</p>
    </main>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={<LoadingCard />}>
      <InviteContent />
    </Suspense>
  );
}
