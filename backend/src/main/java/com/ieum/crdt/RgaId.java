package com.ieum.crdt;

/**
 * RGA 요소의 고유 식별자.
 * TS types.ts의 RgaId 인터페이스와 미러링한다.
 *
 * <pre>
 *   counter — 사이트 내 단조증가 논리 클락 (long: TS의 number와 안전 범위 일치)
 *   siteId  — 편집 세션/탭마다 생성되는 UUID 문자열
 * </pre>
 *
 * record이므로 equals/hashCode/toString이 자동 생성된다.
 */
public record RgaId(long counter, String siteId) {

    /**
     * null-safe 생성을 강제한다.
     */
    public RgaId {
        if (siteId == null) throw new NullPointerException("siteId must not be null");
    }
}
