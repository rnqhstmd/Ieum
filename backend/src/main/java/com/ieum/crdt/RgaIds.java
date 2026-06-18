package com.ieum.crdt;

/**
 * RgaId 유틸리티 메서드 모음.
 * TS의 id.ts(compareIds / idEquals / idKey)와 1:1 미러링.
 *
 * <pre>
 * ── tie-break 규칙 (07 §3-4, TS compareIds와 동일) ──────────────────
 *  1. counter 내림차순: 높은 counter가 앞 → compare(a,b) &lt; 0 이면 a가 앞
 *  2. counter가 같으면 siteId 사전 역순: b.siteId.compareTo(a.siteId)
 *     ("B" &gt; "A" → B가 앞)
 * ────────────────────────────────────────────────────────────────────
 * </pre>
 */
public final class RgaIds {

    private RgaIds() {}

    /**
     * 두 RgaId를 비교한다.
     *
     * <ul>
     *   <li>&lt; 0 : a가 b보다 앞에 위치</li>
     *   <li>&gt; 0 : b가 a보다 앞에 위치</li>
     *   <li>= 0 : 동일한 id</li>
     * </ul>
     *
     * TS {@code compareIds}와 동일한 부호/의미를 보장한다.
     */
    public static int compare(RgaId a, RgaId b) {
        // 1단계: counter 내림차순 (높은 counter가 앞 → b - a)
        if (a.counter() != b.counter()) {
            // long 차이를 int로 안전하게 변환
            return Long.compare(b.counter(), a.counter());
        }
        // 2단계: siteId 사전 역순 (TS: b.siteId.localeCompare(a.siteId))
        // Java compareTo는 localeCompare와 동일한 사전순 부호를 반환한다.
        return b.siteId().compareTo(a.siteId());
    }

    /**
     * RgaId를 Map 키용 문자열로 변환한다.
     * 형식: "{counter}@{siteId}" — TS idKey와 동일.
     */
    public static String key(RgaId id) {
        return id.counter() + "@" + id.siteId();
    }

    /**
     * 두 RgaId가 동일한지 확인한다.
     * record equals()로도 가능하지만 null-safe 대칭 API를 제공한다.
     */
    public static boolean equals(RgaId a, RgaId b) {
        if (a == b) return true;
        if (a == null || b == null) return false;
        return a.counter() == b.counter() && a.siteId().equals(b.siteId());
    }
}
