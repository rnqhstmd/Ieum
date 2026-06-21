// ─── P5 후반 제목 자동저장 — 단일 페이지 로드 + 제목 영속화 ───────
// 블록 본문은 CRDT op로 즉시 영속(슬라이스1)되므로, 이 훅은 CRDT 범위 밖인 제목(pages.title)을
// 단일 페이지 GET으로 로드하고 save-port(PATCH)로 영속한다. EditorContainer의 useAutosave에 연결.

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiPatch } from '@/src/lib/api';

interface PageDetail {
  id: string;
  title: string;
  icon: string | null;
  workspaceId: string;
}

export function usePageTitle(pageId: string, initialTitle: string) {
  const [title, setTitle] = useState(initialTitle);
  // GET 응답의 workspaceId 보관(상태 아님 — PATCH 경로 구성용, 재렌더 불필요).
  const wsRef = useRef<string | null>(null);

  // pageId 변경 시 렌더 중 즉시 초기화(React "prop 변경 시 상태 조정" 패턴): 이전 제목 플래시와
  // 이전 workspaceId로의 잘못된 PATCH를 막는다. EditorContainer는 key={pageId} remount로도 방어되나
  // 훅 단독 견고성 확보(cross-review/gemini HIGH). 이후 effect가 새 page를 GET해 채운다.
  const prevPageId = useRef(pageId);
  if (prevPageId.current !== pageId) {
    prevPageId.current = pageId;
    wsRef.current = null;
    setTitle(initialTitle);
  }

  useEffect(() => {
    let active = true;
    apiGet<PageDetail>(`/api/pages/${pageId}`)
      .then((p) => {
        if (!active) return;
        wsRef.current = p.workspaceId;
        setTitle(p.title); // 초기 title 반영(AC-5)
      })
      .catch(() => {
        /* 미인증/조회 실패: initialTitle 유지(저장은 wsId 없어 스킵) */
      });
    return () => {
      active = false;
    };
  }, [pageId]);

  // save-port: 제목을 wsId-scoped PATCH로 영속(AC-4). GET 완료 전(wsId 없음)이면 스킵.
  const saveTitle = useCallback(
    async (next: string) => {
      const ws = wsRef.current;
      if (!ws) return;
      await apiPatch(`/api/workspaces/${ws}/pages/${pageId}`, { title: next, icon: null });
    },
    [pageId],
  );

  return { title, setTitle, saveTitle };
}
