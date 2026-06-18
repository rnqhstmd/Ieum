package com.ieum.collaboration.dto;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.List;

/**
 * WebSocket wire 메시지 타입 정의.
 *
 * <h2>wire 봉투 구조 (요구사항 06/07)</h2>
 * <pre>
 * Client → Server:
 *   { siteId, seq, opType, payload }
 *   payload INSERT: { id: {counter,siteId}, originId: {counter,siteId}|null, value }
 *   payload DELETE: { targetId: {counter,siteId} }
 *
 * Server → Client:
 *   OpAck / SyncResponse / ErrorMessage
 * </pre>
 *
 * <p>모든 record는 Jackson 직렬화 가능. 필드명은 camelCase JSON 기본 매핑을 따른다.
 * {@code @JsonIgnoreProperties(ignoreUnknown = true)}를 붙여 버전 호환성을 확보한다.
 */
public final class WsMessages {

    private WsMessages() {}

    // ── Client → Server ──────────────────────────────────────────────

    /**
     * CRDT 연산 메시지.
     * opType: "INSERT" | "DELETE" (OpType enum 문자열)
     * payload: INSERT={id,originId,value} / DELETE={targetId} — Jackson JsonNode로 수신 후 파싱.
     */
    @com.fasterxml.jackson.annotation.JsonIgnoreProperties(ignoreUnknown = true)
    public record OpMessage(
            String siteId,
            long seq,
            String opType,       // "INSERT" | "DELETE"
            JsonNode payload     // 파싱은 OpService에서 처리
    ) {}

    /**
     * Awareness(커서/선택 영역/온라인 상태) 메시지.
     * data: 클라이언트가 정의하는 자유 형식 JsonNode (Phase 2에서 스키마 확정).
     */
    @com.fasterxml.jackson.annotation.JsonIgnoreProperties(ignoreUnknown = true)
    public record AwarenessMessage(
            String siteId,
            JsonNode data
    ) {}

    /**
     * 동기화 요청 메시지.
     * 클라이언트가 연결 직후 또는 재연결 시 전송한다.
     * knownVersion: 클라이언트가 마지막으로 받은 serverSeq (없으면 0).
     */
    @com.fasterxml.jackson.annotation.JsonIgnoreProperties(ignoreUnknown = true)
    public record SyncRequest(
            String pageId,
            long knownVersion
    ) {}

    // ── Server → Client ──────────────────────────────────────────────

    /**
     * 서버가 op를 수신·저장한 후 발신자에게 보내는 확인 응답.
     * serverSeq: 서버가 부여한 단조증가 시퀀스 번호.
     */
    public record OpAck(
            String type,         // 항상 "op_ack"
            String siteId,
            long clientSeq,
            long serverSeq
    ) {
        public static OpAck of(String siteId, long clientSeq, long serverSeq) {
            return new OpAck("op_ack", siteId, clientSeq, serverSeq);
        }
    }

    /**
     * 동기화 응답 메시지.
     * ops: knownVersion 이후의 op 목록 (JSON 배열).
     * currentVersion: 현재 최신 serverSeq.
     *
     * TODO(Phase 2): snapshot 포함 여부 결정 (ops 수가 임계값 초과 시 snapshot으로 대체).
     */
    public record SyncResponse(
            String type,         // 항상 "sync_response"
            String pageId,
            long currentVersion,
            List<JsonNode> ops   // 직렬화된 CrdtOp 목록
    ) {
        public static SyncResponse of(String pageId, long currentVersion, List<JsonNode> ops) {
            return new SyncResponse("sync_response", pageId, currentVersion, ops);
        }
    }

    /**
     * 서버 에러 메시지.
     */
    public record ErrorMessage(
            String type,         // 항상 "error"
            String code,
            String message
    ) {
        public static ErrorMessage of(String code, String message) {
            return new ErrorMessage("error", code, message);
        }
    }
}
