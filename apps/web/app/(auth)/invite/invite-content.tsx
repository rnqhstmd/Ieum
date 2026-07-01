'use client';

// 초대 수락 클라이언트 로직 — useSearchParams로 token/state를 읽어 상태를 결정한다.
// (page.tsx 서버 컴포넌트가 이 컴포넌트를 <Suspense>로 감싼다 — Next 15 경계 요건.)

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiError } from '@/src/lib/api';
import { acceptInvitation } from '@/src/lib/invitations';
import InviteCard, { type InviteState } from '@/components/invite/InviteCard';

const PREVIEW_STATES: readonly InviteState[] = ['valid', 'expired', 'already', 'invalid'];

function isPreviewState(value: string | null): value is InviteState {
  return value !== null && (PREVIEW_STATES as readonly string[]).includes(value);
}

// 상태 결정: state 쿼리(미리보기 override)가 있으면 그것,
// 없으면 token이 비었으면 'invalid', 아니면 'valid'.
function resolveState(stateParam: string | null, token: string | null): InviteState {
  if (isPreviewState(stateParam)) return stateParam;
  return token ? 'valid' : 'invalid';
}

export default function InviteContent() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token');
  // 상태를 로컬화해 수락 실패 시 카드 상태를 전환한다(초기값 = 기존 결정 로직).
  const [state, setState] = useState<InviteState>(() => resolveState(params.get('state'), token));
  const [submitting, setSubmitting] = useState(false);

  // 수락 — POST /api/invitations/accept { token }.
  // 2xx→/dashboard, ApiError 상태 매핑: 410→expired / 409→already / 404·403·그 외→invalid.
  const handleAccept = async () => {
    if (!token || submitting) return;
    setSubmitting(true);
    try {
      await acceptInvitation(token);
      router.push('/dashboard');
    } catch (e) {
      // /invite는 공개 라우트라 미인증 상태로 수락하면 401이 난다 → 로그인으로 유도.
      if (e instanceof ApiError && e.status === 401) {
        router.push('/login');
        return;
      }
      if (e instanceof ApiError && e.status === 410) setState('expired');
      else if (e instanceof ApiError && e.status === 409) setState('already');
      else setState('invalid');
      setSubmitting(false);
    }
  };

  // 거절 — 백엔드 거절 엔드포인트가 없어 홈으로 이동한다.
  const handleReject = () => {
    router.push('/');
  };

  return <InviteCard state={state} onAccept={handleAccept} onReject={handleReject} />;
}
