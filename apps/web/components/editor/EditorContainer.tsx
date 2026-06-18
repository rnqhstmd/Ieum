'use client';

// ─── P3 에디터 컨테이너 (FR-8) ─────────────────────────────────────
// 제목 + 블록 본문 상태와 자동저장 메커니즘을 보유하는 client 래퍼.
// 실제 영속화(save-port)는 P5(CrdtOp/Snapshot)에서 연결한다.

import { useCallback, useState } from 'react';
import Editor from '@/components/editor/Editor';
import TitleEditor from '@/components/editor/TitleEditor';
import { createEmptyDocument, type EditorBlock } from '@/src/lib/editor/document';
import { useAutosave, type SaveStatus } from '@/src/lib/editor/useAutosave';

interface EditorContainerProps {
  pageId: string;
  initialTitle?: string;
}

interface PageDraft {
  title: string;
  blocks: EditorBlock[];
}

const STATUS_LABEL: Record<SaveStatus, string> = {
  idle: '',
  dirty: '저장 대기…',
  saving: '저장 중…',
  saved: '저장됨',
};

export default function EditorContainer({ pageId, initialTitle = '' }: EditorContainerProps) {
  const [title, setTitle] = useState(initialTitle);
  const [blocks, setBlocks] = useState<EditorBlock[]>(() => createEmptyDocument());

  // P3 save-port 스텁: P5에서 pageId 스코프의 CrdtOp/Snapshot 전송으로 교체.
  const save = useCallback(async (_draft: PageDraft) => {
    // no-op (P5 연결 지점)
  }, []);

  const { status, notifyChange } = useAutosave<PageDraft>(save, 500);

  const handleTitleChange = (next: string) => {
    setTitle(next);
    notifyChange({ title: next, blocks });
  };

  const handleBlocksChange = (next: EditorBlock[]) => {
    setBlocks(next);
    notifyChange({ title, blocks: next });
  };

  return (
    <div data-page-id={pageId}>
      <div className="mb-2 h-4 text-xs text-faint" aria-live="polite" data-testid="autosave-status">
        {STATUS_LABEL[status]}
      </div>
      <TitleEditor title={title} onChange={handleTitleChange} />
      <Editor blocks={blocks} onChange={handleBlocksChange} />
    </div>
  );
}
