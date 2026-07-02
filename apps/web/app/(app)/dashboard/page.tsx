'use client';

// 대시보드 — 기본 워크스페이스(PERSONAL 우선)를 조회해 빈 상태 CTA를 메인으로 노출.
// 페이지 목록은 사이드바 트리가 담당하므로, 여기선 "첫 페이지 만들기"를 안내한다.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listWorkspaces } from '@/src/lib/workspaces';
import { createPage } from '@/src/lib/pages';
import { redirectOnAuthError } from '@/src/lib/auth/redirectOnAuthError';
import type { Workspace } from '@/src/lib/types';
import EmptyState from '@/components/states/EmptyState';

type Status = 'loading' | 'ready' | 'error';

export default function DashboardPage() {
  const router = useRouter();
  const [defaultWs, setDefaultWs] = useState<Workspace | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  const handleError = (e: unknown) => {
    if (redirectOnAuthError(e, router)) return;
    setStatus('error');
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const ws = await listWorkspaces();
        if (!active) return;
        setDefaultWs(ws.find((w) => w.type === 'PERSONAL') ?? ws[0] ?? null);
        setStatus('ready');
      } catch (e) {
        if (!active) return;
        handleError(e);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async () => {
    if (!defaultWs) return;
    try {
      const created = await createPage(defaultWs.id, {
        parentPageId: null,
        title: '제목 없음',
        position: 0,
      });
      router.push(`/page/${created.id}`);
    } catch (e) {
      handleError(e);
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      {status === 'loading' && <p className="text-sm text-faint">불러오는 중…</p>}
      {status === 'error' && (
        <p role="alert" className="text-sm text-danger">
          워크스페이스를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </p>
      )}
      {status === 'ready' &&
        (defaultWs ? (
          <EmptyState onCreate={handleCreate} />
        ) : (
          <p className="text-sm text-faint">워크스페이스가 없습니다.</p>
        ))}
    </div>
  );
}
