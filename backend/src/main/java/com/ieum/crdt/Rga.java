package com.ieum.crdt;

import com.ieum.crdt.ops.DeleteOp;
import com.ieum.crdt.ops.InsertOp;
import com.ieum.crdt.ops.RgaOp;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 서버측 RGA(Replicated Growable Array) 구현체.
 * TS packages/crdt/src/rga.ts와 글자 단위로 동일하게 수렴해야 한다.
 *
 * <h2>Phase 1 골격 정책</h2>
 * <ul>
 *   <li>{@link #createRga(String)} — 초기 상태(sentinel) 생성만 구현</li>
 *   <li>나머지 메서드 — {@code UnsupportedOperationException("Phase 2 (TDD)")} throw</li>
 * </ul>
 *
 * <h2>수렴 보장 (Phase 2 구현 지침)</h2>
 * <pre>
 *  tie-break: RgaIds.compare(a, b) 사용 — counter 내림차순 → siteId 사전 역순
 *  tombstone:  deleted=true 노드는 리스트에서 제거하지 않는다
 *  pendingBuffer: originId가 아직 도착하지 않은 op는 버퍼링 후 재시도
 * </pre>
 */
public class Rga {

    // ── 내부 상태 ────────────────────────────────────────────────────

    private final String siteId;
    private long localClock;

    /** 링크드 리스트 sentinel 헤드 (값 없음, 항상 맨 앞) */
    private final RgaNode sentinel;

    /** idKey(id) → RgaNode 빠른 조회용 맵 */
    private final Map<String, RgaNode> nodeMap;

    /** 인과적으로 아직 적용 불가능한 InsertOp 버퍼 (Phase 2에서 처리) */
    private final List<InsertOp> pendingBuffer;

    // ── 생성 ─────────────────────────────────────────────────────────

    private Rga(String siteId) {
        this.siteId = siteId;
        this.localClock = 0L;
        // sentinel: id=(0, ""), originId=null, value=null, deleted=false
        RgaId sentinelId = new RgaId(0L, "");
        this.sentinel = new RgaNode(sentinelId, null, null, false);
        this.nodeMap = new HashMap<>();
        this.nodeMap.put(RgaIds.key(sentinelId), this.sentinel);
        this.pendingBuffer = new ArrayList<>();
    }

    /**
     * 새 RGA 인스턴스를 생성한다.
     *
     * @param siteId 이 편집 세션의 고유 siteId (UUID)
     * @return 초기화된 RGA (sentinel만 존재하는 빈 문서)
     */
    public static Rga createRga(String siteId) {
        if (siteId == null || siteId.isBlank()) {
            throw new IllegalArgumentException("siteId must not be blank");
        }
        return new Rga(siteId);
    }

    // ── 로컬 연산 ────────────────────────────────────────────────────

    /**
     * 로컬 삽입 연산. 가시 인덱스(index) 위치에 value를 삽입한다.
     *
     * @param index 삽입할 가시 위치 (0-based, deleted 노드 제외)
     * @param value 삽입할 값
     * @return 생성된 InsertOp (원격 브로드캐스트용)
     * @throws UnsupportedOperationException Phase 2 구현 예정
     */
    public InsertOp localInsert(int index, Object value) {
        // TODO(Phase 2): 가시 인덱스 → originId 변환 후 InsertOp 생성 및 applyRemote 호출
        throw new UnsupportedOperationException("Phase 2 (TDD)");
    }

    /**
     * 로컬 삭제 연산. 가시 인덱스(index) 위치의 요소를 tombstone 처리한다.
     *
     * @param index 삭제할 가시 위치 (0-based, deleted 노드 제외)
     * @return 생성된 DeleteOp (원격 브로드캐스트용)
     * @throws UnsupportedOperationException Phase 2 구현 예정
     */
    public DeleteOp localDelete(int index) {
        // TODO(Phase 2): 가시 인덱스 → targetId 변환 후 DeleteOp 생성 및 applyRemote 호출
        throw new UnsupportedOperationException("Phase 2 (TDD)");
    }

    // ── 원격 연산 적용 ───────────────────────────────────────────────

    /**
     * 원격에서 수신한 RGA 연산을 적용한다.
     * InsertOp / DeleteOp를 switch 패턴 매칭으로 분기한다.
     *
     * @param op 적용할 연산 (InsertOp 또는 DeleteOp)
     * @throws UnsupportedOperationException Phase 2 구현 예정
     */
    public void applyRemote(RgaOp op) {
        // TODO(Phase 2): switch(op) { case InsertOp ins -> applyInsert(ins); case DeleteOp del -> applyDelete(del); }
        // pendingBuffer 처리 포함 (인과 순서 보장)
        throw new UnsupportedOperationException("Phase 2 (TDD)");
    }

    // ── 상태 조회 ────────────────────────────────────────────────────

    /**
     * 현재 문서를 문자열로 반환한다 (deleted 노드 제외).
     *
     * @throws UnsupportedOperationException Phase 2 구현 예정
     */
    public String toText() {
        // TODO(Phase 2): sentinel.next부터 순회하며 deleted=false 노드의 value를 연결
        throw new UnsupportedOperationException("Phase 2 (TDD)");
    }

    // ── 패키지 내부 접근자 (테스트용) ────────────────────────────────

    String getSiteId() { return siteId; }
    long getLocalClock() { return localClock; }
    RgaNode getSentinel() { return sentinel; }
    Map<String, RgaNode> getNodeMap() { return nodeMap; }
}
