// TODO [Phase 1]: pageId로 페이지 메타데이터 조회 (GET /api/pages/:pageId)
// TODO [Phase 2]: @ieum/crdt RGA 인스턴스 초기화 + WebSocket 연결 (실시간 서버)
// TODO [Phase 2]: <Editor /> 컴포넌트 통합 (04-architecture §2-1 참조)
// TODO [Phase 2]: <PresenceOverlay /> 컴포넌트 통합

interface PageEditorProps {
  params: Promise<{ pageId: string }>;
}

export default async function PageEditor({ params }: PageEditorProps) {
  const { pageId } = await params;

  return (
    <div className="mx-auto max-w-3xl px-8 py-12">
      <p className="text-xs text-gray-400">pageId: {pageId}</p>
      <h1 className="mt-4 text-3xl font-bold text-gray-900 outline-none">
        제목 없음
        {/* TODO [Phase 2]: 편집 가능한 제목 */}
      </h1>
      <div className="mt-6 min-h-[400px] text-gray-400">
        {/* TODO [Phase 2]: 블록 에디터 자리 */}
        [에디터 — Phase 2]
      </div>
    </div>
  );
}
