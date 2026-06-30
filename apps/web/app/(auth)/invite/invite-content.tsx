'use client';

// 초대 수락 클라이언트 로직 — useSearchParams로 token/state를 읽어 상태를 결정한다.
// (page.tsx 서버 컴포넌트가 이 컴포넌트를 <Suspense>로 감싼다 — Next 15 경계 요건.)

import { useSearchParams } from 'next/navigation';
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
  const params = useSearchParams();
  const token = params.get('token');
  const state = resolveState(params.get('state'), token);

  // 수락 스텁 — 동작 없음(no-op).
  // TODO(후속 배선): POST /api/invitations/accept { token } 호출,
  //   에러 404→'invalid' / 410→'expired' / 409→'already' / 403→대상 아님,
  //   2xx→/dashboard 이동(멱등 이미멤버 포함).
  const handleAccept = () => {
    /* TODO: accept 배선 */
  };

  // 거절 스텁 — 동작 없음(no-op).
  // TODO(후속 배선): 초대 거절 처리 후 안내 화면 전환.
  const handleReject = () => {
    /* TODO: reject 배선 */
  };

  return <InviteCard state={state} onAccept={handleAccept} onReject={handleReject} />;
}
