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
  // workspaceId는 ref가 아닌 state로 둔다 — pageId와 동일 렌더 클로저에 묶여 saveTitle이 항상
  // 올바른 (pageId, workspaceId) 쌍으로 PATCH한다. ref면 페이지 전환 중 대기 저장이 이전 pageId +
  // 새 workspaceId로 잘못 보낼 수 있다(cross-review/gemini HIGH). title과 같은 시점 갱신이라 추가 렌더 없음.
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  // pageId 변경 시 렌더 중 즉시 초기화(React "prop 변경 시 상태 조정" 패턴): 이전 제목 플래시와
  // 이전 workspaceId로의 잘못된 PATCH를 막는다. EditorContainer는 key={pageId} remount로도 방어되나
  // 훅 단독 견고성 확보. 이후 effect가 새 page를 GET해 채운다.
  const prevPageId = useRef(pageId);
  if (prevPageId.current !== pageId) {
    prevPageId.current = pageId;
    setWorkspaceId(null);
    setTitle(initialTitle);
  }

  useEffect(() => {
    let active = true;
    apiGet<PageDetail>(`/api/pages/${pageId}`)
      .then((p) => {
        if (!active) return;
        setWorkspaceId(p.workspaceId);
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
  // 본문에 title만 담는다 — icon은 전송하지 않는다. 백엔드 updatePage는 부분 갱신(icon 누락=변경 안 함)
  // 이라 제목 저장이 아이콘을 건드리지 않는다. icon 변경/제거는 IconPicker 경로가 전담한다(결합 방지).
  const saveTitle = useCallback(
    async (next: string) => {
      if (!workspaceId) return;
      await apiPatch(`/api/workspaces/${workspaceId}/pages/${pageId}`, { title: next });
    },
    [pageId, workspaceId],
  );

  return { title, setTitle, saveTitle };
}
