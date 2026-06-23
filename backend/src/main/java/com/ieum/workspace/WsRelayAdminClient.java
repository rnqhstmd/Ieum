package com.ieum.workspace;

import java.util.UUID;

public interface WsRelayAdminClient {
    /**
     * 지정 사용자의 WebSocket 연결을 강제 종료한다.
     * <p>
     * best-effort — 구현체는 예외를 전파하지 않아야 한다(내부 흡수+로깅).
     *
     * @param userId 연결을 종료할 사용자 ID
     */
    void disconnectUser(UUID userId);
}
