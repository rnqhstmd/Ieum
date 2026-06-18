package com.ieum.crdt;

/**
 * RGA 링크드 리스트의 단일 노드.
 * TS types.ts의 {@code RgaNode<V>} 인터페이스와 미러링.
 *
 * <ul>
 *   <li>{@code id}      — 이 요소의 고유 식별자</li>
 *   <li>{@code originId}— 삽입 위치 직전 요소의 id (null = 문서 시작 / sentinel 직후)</li>
 *   <li>{@code value}   — 실제 값 (문자 또는 블록 메타, Phase 2에서 제네릭화)</li>
 *   <li>{@code deleted} — tombstone 플래그 — true면 논리적으로 삭제됨</li>
 * </ul>
 *
 * Phase 1: Lombok @Data 사용. Phase 2: 제네릭 {@code <V>} 도입 예정.
 */
@lombok.Data
@lombok.AllArgsConstructor
public class RgaNode {

    /** 이 요소의 고유 id. */
    private final RgaId id;

    /**
     * 삽입 직전 요소의 id.
     * null 이면 sentinel(문서 맨 앞) 직후에 삽입됨을 의미한다.
     */
    private final RgaId originId;

    /**
     * 실제 값.
     * 글자 단위 RGA에서는 String(단일 문자), 블록 RGA에서는 BlockMeta.
     * Phase 1 골격이므로 Object로 선언.
     */
    private final Object value;

    /**
     * tombstone 플래그.
     * true면 시각적으로 숨겨지지만 노드는 리스트에 잔존한다(수렴 보장).
     */
    private boolean deleted;
}
