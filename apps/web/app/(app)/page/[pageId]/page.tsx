// 페이지 상세 — 블록 에디터 (P3, US-EDIT-01~03 + US-PAGE-05 제목 인라인 편집)
// TODO [P3 후속]: pageId로 페이지 메타데이터 조회(제목/아이콘 초기값) — 단일 페이지 GET API
// TODO [P5]: @ieum/crdt RGA 초기화 + WebSocket sync(Snapshot+op replay) + 영속화 연결
// TODO [P6]: <PresenceOverlay /> 통합

import EditorContainer from '@/components/editor/EditorContainer';

interface PageEditorProps {
  params: Promise<{ pageId: string }>;
}

export default async function PageEditor({ params }: PageEditorProps) {
  const { pageId } = await params;

  return (
    <div className="mx-auto max-w-3xl px-8 py-12">
      <EditorContainer pageId={pageId} />
    </div>
  );
}
