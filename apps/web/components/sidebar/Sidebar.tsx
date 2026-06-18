'use client';

import { useEffect, useState } from 'react';
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

export default function Sidebar() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWsId, setSelectedWsId] = useState<string | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [status, setStatus] = useState<Status>('loading');

  const handleError = (e: unknown) => {
    if (e instanceof ApiError && e.status === 401) {
      router.push('/login');
      return;
    }
    setStatus('error');
  };

  const loadTree = async (wsId: string) => {
    setStatus('loading');
    try {
      const tree = await getPageTree(wsId);
      setPages(tree);
      setStatus('ready');
    } catch (e) {
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelect = (id: string) => {
    setSelectedWsId(id);
    void loadTree(id);
  };

  const handleCreate = async () => {
    if (!selectedWsId) return;
    try {
      const created = await createPage(selectedWsId, {
        parentPageId: null,
        title: '제목 없음',
        position: pages.length,
      });
      await loadTree(selectedWsId);
      router.push(`/page/${created.id}`);
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
          <PageTree pages={pages} onNavigate={(id) => router.push(`/page/${id}`)} />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <NewPageButton onCreate={handleCreate} />
        <AccountArea />
      </div>
    </aside>
  );
}
