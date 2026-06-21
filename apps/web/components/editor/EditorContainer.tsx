'use client';

// ─── P5 에디터 컨테이너 — CRDT 진실 원천 + relay 연결 ─────────────
// 본문 블록은 @ieum/crdt DocState(useCrdtDocument)를 진실 원천으로 사용한다.
// 제목은 CRDT 범위 밖이므로 로컬 상태로 유지한다. autosave 스텁은 유지하며
// (저장 no-op) 영속화 슬라이스에서 CRDT op 영속화로 교체한다.

import { useCallback, useState } from 'react';
import Editor from '@/components/editor/Editor';
import TitleEditor from '@/components/editor/TitleEditor';
import { useCrdtDocument } from '@/src/lib/editor/useCrdtDocument';
import { useAutosave, type SaveStatus } from '@/src/lib/editor/useAutosave';

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
  const [title, setTitle] = useState(initialTitle);
  const { blocks, onBlockInput } = useCrdtDocument(pageId);

  // 제목 save-port 스텁: 영속화 슬라이스에서 실제 저장으로 교체.
  const save = useCallback(async (_title: string) => {
    // no-op (영속화 연결 지점)
  }, []);
  const { status, notifyChange } = useAutosave<string>(save, 500);

  const handleTitleChange = (next: string) => {
    setTitle(next);
    notifyChange(next);
  };

  return (
    <div data-page-id={pageId}>
      <div className="mb-2 h-4 text-xs text-faint" aria-live="polite" data-testid="autosave-status">
        {STATUS_LABEL[status]}
      </div>
      <TitleEditor title={title} onChange={handleTitleChange} />
      <Editor blocks={blocks} onBlockInput={onBlockInput} />
    </div>
  );
}
