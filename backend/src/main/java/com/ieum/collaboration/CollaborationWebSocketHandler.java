package com.ieum.collaboration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ieum.collaboration.dto.WsMessages;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.UUID;

/**
 * 실시간 협업 WebSocket 핸들러.
 *
 * <h2>연결 URL 규약</h2>
 * {@code ws://.../ws/pages/{pageId}} — pageId는 URI 마지막 세그먼트.
 *
 * <h2>메시지 분기 (opType 필드 기준)</h2>
 * <ul>
 *   <li>{@code "op"}           → {@link OpService#handleOp}</li>
 *   <li>{@code "awareness"}    → {@link PresenceService#handleAwareness}</li>
 *   <li>{@code "sync_request"} → TODO(Phase 2): SyncResponse 응답</li>
 *   <li>그 외                  → 무시 (로그)</li>
 * </ul>
 *
 * <h2>인증</h2>
 * TODO(Phase 2): afterConnectionEstablished에서 세션 쿠키/토큰 검증.
 * 현재는 인증 없이 pageId 파싱 후 룸 참가.
 */
@Component
public class CollaborationWebSocketHandler extends TextWebSocketHandler {

    private static final String ATTR_PAGE_ID = "pageId";

    private final RoomManager roomManager;
    private final OpService opService;
    private final PresenceService presenceService;
    private final ObjectMapper objectMapper;

    public CollaborationWebSocketHandler(RoomManager roomManager,
                                         OpService opService,
                                         PresenceService presenceService,
                                         ObjectMapper objectMapper) {
        this.roomManager = roomManager;
        this.opService = opService;
        this.presenceService = presenceService;
        this.objectMapper = objectMapper;
    }

    // ── 연결 수립 ────────────────────────────────────────────────────

    /**
     * 연결 수립 시 URI에서 pageId를 파싱하고 룸에 참가한다.
     *
     * URI 형식: /ws/pages/{pageId}
     */
    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String pageId = extractPageId(session);
        if (pageId == null) {
            // pageId를 파싱할 수 없으면 연결을 닫는다.
            session.close(CloseStatus.BAD_DATA.withReason("pageId missing in URI"));
            return;
        }

        // 세션 속성에 pageId 저장 (afterConnectionClosed에서 재사용)
        session.getAttributes().put(ATTR_PAGE_ID, pageId);

        // TODO(Phase 2): 세션 쿠키/토큰으로 인증 처리
        roomManager.join(pageId, session);
    }

    // ── 메시지 수신 ──────────────────────────────────────────────────

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        String rawMsg = message.getPayload();
        String pageId = (String) session.getAttributes().get(ATTR_PAGE_ID);
        if (pageId == null) return;

        JsonNode root;
        try {
            root = objectMapper.readTree(rawMsg);
        } catch (Exception e) {
            // JSON 파싱 실패 — 무시
            return;
        }

        String type = root.path("type").asText("");

        switch (type) {
            case "op" -> handleOpMessage(session, pageId, root, rawMsg);
            case "awareness" -> handleAwarenessMessage(session, pageId, root, rawMsg);
            case "sync_request" -> handleSyncRequest(session, pageId, root);
            default -> {
                // TODO(Phase 2): 알 수 없는 메시지 타입 로깅
            }
        }
    }

    // ── 연결 종료 ────────────────────────────────────────────────────

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        String pageId = (String) session.getAttributes().get(ATTR_PAGE_ID);
        if (pageId != null) {
            roomManager.leave(pageId, session);
            // TODO(Phase 2): presenceService.releaseColorSlot(pageId, session)
        }
    }

    // ── 내부 분기 핸들러 ────────────────────────────────────────────

    /**
     * CRDT op 메시지 처리.
     * opType 필드를 포함한 wire 봉투를 OpMessage로 역직렬화 후 OpService에 위임.
     */
    private void handleOpMessage(WebSocketSession session, String pageId,
                                  JsonNode root, String rawMsg) {
        try {
            WsMessages.OpMessage msg = objectMapper.treeToValue(root, WsMessages.OpMessage.class);
            // TODO(Phase 2): pageId를 UUID로 변환 시 검증 예외 처리
            opService.handleOp(UUID.fromString(pageId), msg, rawMsg);
        } catch (UnsupportedOperationException e) {
            // Phase 2 미구현 — 조용히 패스
        } catch (Exception e) {
            // TODO(Phase 2): 에러 메시지를 클라이언트에 전송
        }
    }

    /**
     * Awareness 메시지 처리.
     * AwarenessMessage로 역직렬화 후 PresenceService에 위임.
     */
    private void handleAwarenessMessage(WebSocketSession session, String pageId,
                                         JsonNode root, String rawMsg) {
        try {
            WsMessages.AwarenessMessage msg =
                    objectMapper.treeToValue(root, WsMessages.AwarenessMessage.class);
            presenceService.handleAwareness(pageId, msg, rawMsg, session);
        } catch (UnsupportedOperationException e) {
            // Phase 2 미구현 — 조용히 패스
        } catch (Exception e) {
            // TODO(Phase 2): 에러 처리
        }
    }

    /**
     * 동기화 요청 처리.
     * TODO(Phase 2): CrdtOpRepository에서 knownVersion 이후 op를 조회해 SyncResponse 전송.
     */
    private void handleSyncRequest(WebSocketSession session, String pageId, JsonNode root) {
        // TODO(Phase 2):
        //   WsMessages.SyncRequest req = objectMapper.treeToValue(root, WsMessages.SyncRequest.class);
        //   List<CrdtOp> ops = crdtOpRepository
        //       .findByPageIdAndServerSeqGreaterThanOrderByServerSeqAsc(UUID.fromString(pageId), req.knownVersion());
        //   session.sendMessage(new TextMessage(objectMapper.writeValueAsString(
        //       WsMessages.SyncResponse.of(pageId, currentVersion, serializedOps))));
    }

    // ── URI 파싱 유틸 ────────────────────────────────────────────────

    /**
     * 세션 URI에서 pageId를 추출한다.
     * URI 형식: /ws/pages/{pageId}
     *
     * @return pageId 문자열, 파싱 불가 시 null
     */
    private String extractPageId(WebSocketSession session) {
        if (session.getUri() == null) return null;
        String path = session.getUri().getPath(); // e.g. "/ws/pages/550e8400-e29b-41d4..."
        if (path == null) return null;
        String[] segments = path.split("/");
        // segments: ["", "ws", "pages", "{pageId}"]
        if (segments.length >= 4 && "pages".equals(segments[segments.length - 2])) {
            return segments[segments.length - 1];
        }
        return null;
    }
}
