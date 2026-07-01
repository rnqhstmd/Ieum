// 페이지 상세 — 블록 에디터 (P3 + P5 walking skeleton: CRDT op WebSocket relay)
// P5 완료: EditorContainer → useCrdtDocument(DocState 진실원천) + ws relay 2탭 라이브 수렴.
// TODO [P3 후속]: pageId로 페이지 메타데이터 조회(제목/아이콘 초기값) — 단일 페이지 GET API
// TODO [P5 후속]: CrdtOp 영속화 + sync-request/Snapshot 초기로드 + 재접속 op 복원 / 구조편집 블록 op 전송
// TODO [P6]: <PresenceOverlay /> 통합

import EditorContainer from '@/components/editor/EditorContainer';

interface PageEditorProps {
  params: Promise<{ pageId: string }>;
}

export default async function PageEditor({ params }: PageEditorProps) {
  const { pageId } = await params;

  // key={pageId}: 페이지 이동 시 EditorContainer를 remount하여 이전 페이지
  // 상태(제목·블록)가 남지 않도록 강제한다. 풀높이 레이아웃(탑바 풀폭 + 본문 중앙)은
  // EditorContainer가 직접 제어하므로 바깥 패딩/센터링 래퍼를 제거한다.
  return <EditorContainer key={pageId} pageId={pageId} />;
}
