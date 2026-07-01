'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { listWorkspaces } from '@/src/lib/workspaces';
import { getPageTree, createPage, updatePage, archivePage } from '@/src/lib/pages';
import { ApiError } from '@/src/lib/api';
import type { Page, Workspace } from '@/src/lib/types';
import ConfirmDialog from '@/components/overlays/ConfirmDialog';
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
  // 아카이브 확인 대상 페이지 ID(파괴적). null이면 확인 다이얼로그 닫힘.
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
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
        title: '', // 빈 제목으로 생성 → 에디터/트리에서 "제목 없음" placeholder 표시
        position: nextPosition,
      });
      await loadTree(selectedWsId);
      navigate(created.id);
    } catch (e) {
      handleError(e);
    }
  };

  /** 페이지 이름 변경 → updatePage 후 트리 재조회 */
  const handleRename = async (id: string, title: string) => {
    if (!selectedWsId) return;
    try {
      await updatePage(selectedWsId, id, { title });
      await loadTree(selectedWsId);
    } catch (e) {
      handleError(e);
    }
  };

  /** 페이지 아이콘 설정 → updatePage 후 트리 재조회 */
  const handleSetIcon = async (id: string, icon: string) => {
    if (!selectedWsId) return;
    try {
      await updatePage(selectedWsId, id, { icon });
      await loadTree(selectedWsId);
    } catch (e) {
      handleError(e);
    }
  };

  /** 페이지 아카이브 요청 — 파괴적이므로 ConfirmDialog로 확인을 받는다. */
  const handleArchive = (id: string) => {
    setConfirmArchiveId(id);
  };

  /** 아카이브 확인 → archivePage(재귀 soft delete) 후 트리 재조회. */
  const handleConfirmArchive = async () => {
    const id = confirmArchiveId;
    setConfirmArchiveId(null);
    if (!selectedWsId || !id) return;
    try {
      await archivePage(selectedWsId, id);
      await loadTree(selectedWsId);
    } catch (e) {
      handleError(e);
    }
  };

  const currentWs = workspaces.find((w) => w.id === selectedWsId) ?? null;

  return (
    <aside
      aria-label="사이드바"
      className="flex h-full w-[300px] flex-none flex-col border-r border-hair-2 bg-deep px-3.5 pb-3.5 pt-[18px] text-body"
    >
      <WorkspaceSwitcher workspaces={workspaces} currentId={selectedWsId} onSelect={handleSelect} />

      {/* 검색창 — 시각 전용 플레이스홀더(검색 미배선, 비기능) */}
      <div
        aria-hidden
        className="mt-1.5 flex items-center gap-[9px] rounded-[7px] border border-hair-2 px-2.5 py-2 text-fainter"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5 flex-none"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <span className="flex-1 text-[13px]">검색</span>
        <kbd className="rounded-[4px] border border-hair-2 px-[5px] py-[3px] font-sans text-[10px] leading-none">
          ⌘K
        </kbd>
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-auto">
        {currentWs && (
          <div className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[1.6px] text-label">
            {currentWs.type === 'PERSONAL' ? '개인' : `공유 · ${currentWs.name}`}
          </div>
        )}
        {status === 'loading' && <p className="px-2.5 py-2 text-[13px] text-faint">불러오는 중…</p>}
        {status === 'error' && (
          <p role="alert" className="px-2.5 py-2 text-[13px] text-danger">
            목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
          </p>
        )}
        {status === 'ready' && (
          <PageTree
            pages={pages}
            onNavigate={navigate}
            onCreateChild={(parentId) => handleCreate(parentId)}
            onRename={handleRename}
            onSetIcon={handleSetIcon}
            onArchive={handleArchive}
          />
        )}
      </div>

      <div className="mt-2 flex flex-col gap-2">
        {/* 멤버 진입 — 공유(SHARED) 워크스페이스에서만 노출(개인은 멤버 관리 무의미) */}
        {currentWs?.type === 'SHARED' && selectedWsId && (
          <button
            type="button"
            onClick={() => {
              onNavigate?.();
              router.push(`/workspace/${selectedWsId}/members`);
            }}
            className="flex items-center gap-2 rounded-[7px] px-2.5 py-2 text-[13px] text-faint hover:bg-hover hover:text-body"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4 flex-none"
            >
              <path d="M16 19v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 19v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span>멤버</span>
          </button>
        )}
        <NewPageButton onCreate={() => handleCreate(null)} />
        {/* 새 워크스페이스 — 시각 전용 텍스트 버튼(생성 모달 미배선, no-op) */}
        <button
          type="button"
          aria-disabled="true"
          className="px-1 py-1 text-center text-[12px] font-medium text-faint hover:text-body"
        >
          새 워크스페이스
        </button>
      </div>
      <AccountArea />

      {/* 아카이브 확인 — 사이드바 래퍼의 transform 컨테이닝 블록을 벗어나 전체화면을 덮도록
          document.body로 포털한다. confirmArchiveId가 초기 null이라 SSR/하이드레이션엔 렌더되지 않음. */}
      {confirmArchiveId &&
        createPortal(
          <div className="fixed inset-0 z-50">
            <ConfirmDialog
              title="페이지를 아카이브할까요?"
              message="이 페이지와 모든 하위 페이지가 함께 아카이브됩니다."
              confirmLabel="아카이브"
              destructive
              onConfirm={handleConfirmArchive}
              onCancel={() => setConfirmArchiveId(null)}
            />
          </div>,
          document.body,
        )}
    </aside>
  );
}
