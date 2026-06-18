/**
 * 실시간 WebSocket 연결 헬퍼
 *
 * 환경 변수:
 *   NEXT_PUBLIC_WS_URL  — WebSocket 서버 URL (기본값: ws://localhost:8080)
 *
 * TODO(Phase 2): op/presence 메시지 처리 구현
 *   - CRDT op 전송: ws.send(JSON.stringify({ type: 'op', ...op }))
 *   - presence 브로드캐스트 수신 처리
 *   - 재연결 로직 (지수 백오프)
 */

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8080';

/**
 * 페이지별 WebSocket 연결을 생성합니다.
 *
 * @param pageId - 연결할 페이지 ID
 * @returns WebSocket 인스턴스
 *
 * @example
 * const ws = connectPage('page-uuid-123');
 * ws.onmessage = (e) => console.log(JSON.parse(e.data));
 * // 연결 종료 시
 * ws.close();
 */
export function connectPage(pageId: string): WebSocket {
  const url = `${WS_URL}/ws/pages/${pageId}`;
  const ws = new WebSocket(url);

  ws.onopen = () => {
    console.log(`[ws] 페이지 연결됨: ${pageId}`);
  };

  ws.onerror = (event) => {
    console.error(`[ws] 연결 오류 (pageId=${pageId})`, event);
  };

  ws.onclose = (event) => {
    console.log(`[ws] 연결 종료 (pageId=${pageId}, code=${event.code})`);
    // TODO(Phase 2): 비정상 종료(code !== 1000) 시 재연결 시도
  };

  return ws;
}
