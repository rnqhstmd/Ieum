'use client';

// 멤버 관리 모달 호스트 라우트 — /workspace/{wsId}/members
// MembersModal이 백드롭+오버레이를 포함하므로 wsId만 읽어 렌더하고, 닫기는 router.back().

import { useParams, useRouter } from 'next/navigation';
import MembersModal from '@/components/members/MembersModal';

export default function MembersPage() {
  const router = useRouter();
  const params = useParams<{ wsId: string }>();

  return <MembersModal workspaceId={params.wsId} onClose={() => router.back()} />;
}
