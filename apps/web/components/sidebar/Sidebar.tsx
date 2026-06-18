'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listWorkspaces } from '@/src/lib/workspaces';
import { getPageTree, createPage } from '@/src/lib/pages';
import { ApiError } from '@/src/lib/api';
import type { Page, Workspace } from '@/src/lib/types';
import WorkspaceSwitcher from './WorkspaceSwitcher';
import PageTree from './PageTree';
import NewPageButton from './NewPageButton';
import AccountArea from './AccountArea';

type Status = 'loading' | 'ready' | 'error';

/** 트리에서 id에 해당하는 노드를 재귀 탐색 */
function findNode(pages: Page[], id: string): Page | null {
  for (const p of pages) {
    if (p.id === id) return p;
    if (p.children) {
      const found = findNode(p.children, id);
      if (found) return found;
    }
  }
  return null;
}

interface Props {
  /** 네비게이션/생성 후 호출 — 모바일 드로어 닫기 등에 사용 */
  onNavigate?: () => void;
}

export default function Sidebar({ onNavigate }: Props = {}) {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWsId, setSelectedWsId] = useState<string | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  // 진행 중 트리 조회의 워크스페이스 ID — 빠른 전환/언마운트 시 stale 응답 무시용
  const activeWsIdRef = useRef<string | null>(null);

  const handleError = (e: unknown) => {
    if (e instanceof ApiError && e.status === 401) {
      router.push('/login');
      return;
    }
    setStatus('error');
  };

  const loadTree = async (wsId: string) => {
    activeWsIdRef.current = wsId;
    setStatus('loading');
    try {
      const tree = await getPageTree(wsId);
      if (activeWsIdRef.current !== wsId) return; // 더 최신 전환이 있었으면 stale 응답 무시
      setPages(tree);
      setStatus('ready');
    } catch (e) {
      if (activeWsIdRef.current !== wsId) return;
      handleError(e);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const ws = await listWorkspaces();
        if (!active) return;
        setWorkspaces(ws);
        const def = ws.find((w) => w.type === 'PERSONAL') ?? ws[0];
        if (def) {
          setSelectedWsId(def.id);
          await loadTree(def.id);
        } else {
          setStatus('ready');
        }
      } catch (e) {
        handleError(e);
      }
    })();
    return () => {
      active = false;
      activeWsIdRef.current = null; // 언마운트 시 진행 중 응답 무시
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelect = (id: string) => {
    setSelectedWsId(id);
    void loadTree(id);
  };

  const navigate = (pageId: string) => {
    onNavigate?.();
    router.push(`/page/${pageId}`);
  };

  /** parentId=null → 최상위, 그 외 → 하위. position은 형제 최대값 + 1(없으면 0). */
  const handleCreate = async (parentId: string | null = null) => {
    if (!selectedWsId) return;
    const siblings = parentId === null ? pages : (findNode(pages, parentId)?.children ?? []);
    const nextPosition = siblings.length ? Math.max(...siblings.map((s) => s.position)) + 1 : 0;
    try {
      const created = await createPage(selectedWsId, {
        parentPageId: parentId,
        title: '제목 없음',
        position: nextPosition,
      });
      await loadTree(selectedWsId);
      navigate(created.id);
    } catch (e) {
      handleError(e);
    }
  };

  return (
    <aside
      aria-label="사이드바"
      className="flex h-full w-[300px] flex-none flex-col gap-4 bg-deep px-3.5 py-4 text-body"
    >
      <WorkspaceSwitcher workspaces={workspaces} currentId={selectedWsId} onSelect={handleSelect} />

      <div className="min-h-0 flex-1 overflow-auto">
        {status === 'loading' && <p className="px-2.5 py-2 text-[13px] text-faint">불러오는 중…</p>}
        {status === 'error' && (
          <p role="alert" className="px-2.5 py-2 text-[13px] text-danger">
            목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
          </p>
        )}
        {status === 'ready' && (
          <PageTree pages={pages} onNavigate={navigate} onCreateChild={(parentId) => handleCreate(parentId)} />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <NewPageButton onCreate={() => handleCreate(null)} />
        <AccountArea />
      </div>
    </aside>
  );
}
