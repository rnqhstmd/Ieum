'use client';

// ─── P5 에디터 컨테이너 — CRDT 진실 원천 + relay 연결 ─────────────
// 본문 블록은 @ieum/crdt DocState(useCrdtDocument)를 진실 원천으로 사용한다.
// 제목은 CRDT 범위 밖이므로 로컬 상태로 유지한다. autosave 스텁은 유지하며
// (저장 no-op) 영속화 슬라이스에서 CRDT op 영속화로 교체한다.

import { useRef } from 'react';
import Editor from '@/components/editor/Editor';
import TitleEditor from '@/components/editor/TitleEditor';
import PresenceAvatars from '@/components/editor/PresenceAvatars';
import { useCrdtDocument } from '@/src/lib/editor/useCrdtDocument';
import { useAutosave, type SaveStatus } from '@/src/lib/editor/useAutosave';
import { usePageTitle } from '@/src/lib/editor/usePageTitle';

interface EditorContainerProps {
  pageId: string;
  initialTitle?: string;
}

const STATUS_LABEL: Record<SaveStatus, string> = {
  idle: '',
  dirty: '저장 대기…',
  saving: '저장 중…',
  saved: '저장됨',
};

export default function EditorContainer({ pageId, initialTitle = '' }: EditorContainerProps) {
  const { blocks, presences, cursors, localClientId, onBlockInput, onCursorMove, resolveCursorIndex, onEnter, onBackspace, onSetType, authError, restoreError, retryRestore } =
    useCrdtDocument(pageId);

  // 제목 로드(단일 페이지 GET)·저장(PATCH save-port). 블록 본문은 CRDT op로 별도 즉시 영속.
  const { title, setTitle, saveTitle } = usePageTitle(pageId, initialTitle);
  const { status, notifyChange } = useAutosave<string>(saveTitle, 500);

  const handleTitleChange = (next: string) => {
    setTitle(next);
    notifyChange(next);
  };

  // 제목에서 Enter → 본문 첫 블록으로 포커스 이동(노션식). 첫 [data-block-id]에 캐럿 배치.
  const rootRef = useRef<HTMLDivElement>(null);
  const focusFirstBlock = () => {
    const el = rootRef.current?.querySelector<HTMLElement>('[data-block-id]');
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  };

  return (
    <div data-page-id={pageId} ref={rootRef}>
      {authError && (
        <div role="alert" data-testid="auth-error" className="text-sm text-red-600">
          세션이 만료되었습니다. <a href="/login">login</a>이 필요합니다.
        </div>
      )}
      {restoreError && !authError && (
        <div role="alert" data-testid="restore-error" className="text-sm text-red-600">
          이전 편집 내용을 불러오지 못했습니다.{' '}
          <button type="button" onClick={retryRestore} className="underline">재시도</button>
        </div>
      )}
      {/* 본인(self) 아바타는 숨기고 협업자만 표시 — localClientId 일치분 제외 */}
      <PresenceAvatars presences={presences.filter((p) => p.clientId !== localClientId)} />
      <div className="mb-2 h-4 text-xs text-faint" aria-live="polite" data-testid="autosave-status">
        {STATUS_LABEL[status]}
      </div>
      <TitleEditor title={title} onChange={handleTitleChange} onEnter={focusFirstBlock} />
      <Editor
        blocks={blocks}
        onBlockInput={onBlockInput}
        cursors={cursors}
        presences={presences}
        localClientId={localClientId}
        resolveCursorIndex={resolveCursorIndex}
        onCursorMove={onCursorMove}
        onEnter={onEnter}
        onBackspace={onBackspace}
        onSetType={onSetType}
      />
    </div>
  );
}
