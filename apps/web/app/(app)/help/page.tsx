'use client';

// 도움말 페이지 — 이음 앱 소개 정적 콘텐츠(단축키 안내는 노출하지 않는다).

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser } from '@/src/lib/users';
import { ApiError } from '@/src/lib/api';

type Status = 'loading' | 'ready';

export default function HelpPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('loading');

  // 마운트 시 인증 가드(401만 로그인으로 리다이렉트, 그 외에는 정적 콘텐츠 노출)
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await getCurrentUser();
        if (!active) return;
        setStatus('ready');
      } catch (e) {
        if (!active) return;
        if (e instanceof ApiError && e.status === 401) {
          router.push('/login');
          return;
        }
        setStatus('ready');
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-8">
      {status === 'loading' && <p className="text-faint">불러오는 중…</p>}
      {status === 'ready' && (
        <div>
          <h1 className="text-lg font-semibold text-ink">이음 소개</h1>
          <p>이음은 실시간으로 함께 문서를 작성하고 편집할 수 있는 협업 워크스페이스입니다.</p>
          <p>워크스페이스 안에서 페이지를 만들고, 팀원을 초대해 동시에 편집해 보세요.</p>
          <p>변경 사항은 자동으로 저장되어 언제든 이어서 작업할 수 있습니다.</p>
        </div>
      )}
    </div>
  );
}
