package com.ieum.collaboration;

import com.ieum.collaboration.dto.WsMessages.AwarenessMessage;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.WebSocketSession;

/**
 * Presence(접속 상태 / 커서 / 색상 슬롯) 서비스 스텁.
 *
 * <h2>Phase 2 구현 예정 내용 (요구사항 07 §5)</h2>
 * <ul>
 *   <li>세션 연결 시 색상 슬롯(0~7) 할당 — ConcurrentHashMap으로 pageId별 슬롯 풀 관리</li>
 *   <li>AwarenessMessage 수신 시 같은 룸에 릴레이 (발신자 제외)</li>
 *   <li>세션 종료 시 슬롯 반환 + 퇴장 브로드캐스트</li>
 * </ul>
 */
@Service
public class PresenceService {

    private final RoomManager roomManager;

    public PresenceService(RoomManager roomManager) {
        this.roomManager = roomManager;
    }

    /**
     * Awareness 메시지를 같은 룸에 릴레이한다 (발신자 제외).
     *
     * @param pageId  대상 페이지 ID
     * @param msg     파싱된 AwarenessMessage
     * @param rawMsg  원본 JSON 문자열 (릴레이용)
     * @param sender  발신자 세션 (릴레이 대상에서 제외)
     * @throws UnsupportedOperationException Phase 2 구현 예정
     */
    public void handleAwareness(String pageId, AwarenessMessage msg,
                                String rawMsg, WebSocketSession sender) {
        // TODO(Phase 2): roomManager.broadcast(pageId, rawMsg, sender)
        throw new UnsupportedOperationException("Phase 2 (TDD)");
    }

    /**
     * 세션 연결 시 색상 슬롯을 할당한다.
     *
     * @param pageId  대상 페이지 ID
     * @param session 연결된 세션
     * @return 할당된 슬롯 번호 (0~7)
     * @throws UnsupportedOperationException Phase 2 구현 예정
     */
    public int assignColorSlot(String pageId, WebSocketSession session) {
        // TODO(Phase 2): 슬롯 풀에서 미사용 슬롯 할당
        throw new UnsupportedOperationException("Phase 2 (TDD)");
    }

    /**
     * 세션 종료 시 색상 슬롯을 반환하고 퇴장 이벤트를 브로드캐스트한다.
     *
     * @param pageId  대상 페이지 ID
     * @param session 종료된 세션
     * @throws UnsupportedOperationException Phase 2 구현 예정
     */
    public void releaseColorSlot(String pageId, WebSocketSession session) {
        // TODO(Phase 2): 슬롯 반환 + roomManager.broadcast(퇴장 메시지)
        throw new UnsupportedOperationException("Phase 2 (TDD)");
    }
}
