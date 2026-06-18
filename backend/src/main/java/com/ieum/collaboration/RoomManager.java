package com.ieum.collaboration;

import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.Collections;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * WebSocket 룸(room) 관리자.
 * pageId를 키로 연결된 세션 집합을 관리하고 브로드캐스트를 담당한다.
 *
 * <p>스레드 안전성: ConcurrentHashMap + ConcurrentHashMap.newKeySet()으로 보장.
 */
@Component
public class RoomManager {

    /** pageId → 연결된 WebSocketSession 집합 */
    private final ConcurrentHashMap<String, Set<WebSocketSession>> rooms =
            new ConcurrentHashMap<>();

    /**
     * 세션을 해당 pageId 룸에 참가시킨다.
     *
     * @param pageId  룸 식별자 (페이지 ID)
     * @param session 참가할 WebSocket 세션
     */
    public void join(String pageId, WebSocketSession session) {
        rooms.computeIfAbsent(pageId, k -> ConcurrentHashMap.newKeySet())
             .add(session);
    }

    /**
     * 세션을 룸에서 제거한다. 룸이 비면 맵에서 삭제한다.
     *
     * @param pageId  룸 식별자
     * @param session 제거할 WebSocket 세션
     */
    public void leave(String pageId, WebSocketSession session) {
        Set<WebSocketSession> sessions = rooms.get(pageId);
        if (sessions != null) {
            sessions.remove(session);
            if (sessions.isEmpty()) {
                rooms.remove(pageId, sessions);
            }
        }
    }

    /**
     * 룸의 모든 세션(exclude 제외)에 메시지를 브로드캐스트한다.
     *
     * <p>전송 실패한 세션은 로그만 남기고 계속 순회한다(단일 실패가 전체를 중단하지 않는다).
     *
     * @param pageId  룸 식별자
     * @param message 전송할 JSON 문자열
     * @param exclude 발신자 세션 (null 허용 — null이면 모두에게 전송)
     */
    public void broadcast(String pageId, String message, WebSocketSession exclude) {
        Set<WebSocketSession> sessions = rooms.getOrDefault(pageId, Collections.emptySet());
        TextMessage textMessage = new TextMessage(message);
        for (WebSocketSession session : sessions) {
            if (session.equals(exclude)) continue;
            if (!session.isOpen()) continue;
            try {
                session.sendMessage(textMessage);
            } catch (IOException e) {
                // TODO(Phase 2): 로깅 프레임워크(SLF4J)로 교체
                System.err.println("[RoomManager] broadcast failed for session "
                        + session.getId() + ": " + e.getMessage());
            }
        }
    }

    /**
     * 룸의 현재 세션 수를 반환한다 (테스트/모니터링용).
     */
    public int sessionCount(String pageId) {
        Set<WebSocketSession> sessions = rooms.get(pageId);
        return sessions == null ? 0 : sessions.size();
    }
}
