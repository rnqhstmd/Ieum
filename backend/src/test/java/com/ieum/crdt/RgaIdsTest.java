package com.ieum.crdt;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * RgaIds.compare에 대한 JUnit 5 conformance 테스트.
 *
 * TS packages/crdt/tests/id.test.ts의 동일 시나리오를 Java로 재현한다.
 * 두 구현이 같은 tie-break 규칙을 가지는지 공유 conformance 의도로 작성됨.
 *
 * tie-break 규칙 (07 §3-4):
 *   1. counter 내림차순 (높은 counter가 앞 → 반환값 < 0 이면 a가 앞)
 *   2. counter가 같으면 siteId 사전 역순 ("B" > "A" → B가 앞)
 */
class RgaIdsTest {

    // ── compare ────────────────────────────────────────────────────

    @Test
    @DisplayName("counter가 높은 id가 앞에 위치한다 (내림차순)")
    void compare_higherCounterComesFirst() {
        // TS: counter 3 > counter 1 → compareIds(a, b) < 0
        RgaId a = new RgaId(3L, "A");
        RgaId b = new RgaId(1L, "A");

        assertTrue(RgaIds.compare(a, b) < 0, "a(counter=3)가 b(counter=1)보다 앞이어야 한다");
        assertTrue(RgaIds.compare(b, a) > 0, "b(counter=1)가 a(counter=3)보다 뒤여야 한다");
    }

    @Test
    @DisplayName("counter가 같을 때 siteId 사전 역순으로 tie-break 된다 (B > A → B가 앞)")
    void compare_sameCounter_siteIdReverseLexicographic() {
        // TS id.test.ts: "07 §2-2 시나리오: id:(2,A)와 id:(2,B)가 같은 originId에 동시 삽입"
        // siteId "B" > "A" → B가 앞 → compare({2,B}, {2,A}) < 0
        RgaId siteA = new RgaId(2L, "A");
        RgaId siteB = new RgaId(2L, "B");

        assertTrue(RgaIds.compare(siteB, siteA) < 0, "siteB(\"B\")가 siteA(\"A\")보다 앞이어야 한다");
        assertTrue(RgaIds.compare(siteA, siteB) > 0, "siteA(\"A\")가 siteB(\"B\")보다 뒤여야 한다");
    }

    @Test
    @DisplayName("counter가 같고 siteId도 같으면 0을 반환한다")
    void compare_identical_returnsZero() {
        RgaId a = new RgaId(5L, "site-xyz");
        RgaId b = new RgaId(5L, "site-xyz");

        assertEquals(0, RgaIds.compare(a, b));
    }

    @Test
    @DisplayName("07 §4 수렴 예시: Hi?! 시나리오 — tie-break 순서 검증")
    void compare_hiScenario_concurrentInsertTieBreak() {
        // TS id.test.ts: "07 §4 수렴 예시: Hi?! 시나리오"
        // 사이트 A: id=(2,A) '!' , 사이트 B: id=(2,B) '?' — 같은 originId에 동시 삽입
        // tie-break: counter 동일(2) → siteId 역순: "B" > "A" → (2,B)가 앞
        // 결과 텍스트: "Hi?!" (B의 '?' 먼저, A의 '!' 나중)
        RgaId opA = new RgaId(2L, "A"); // '!'
        RgaId opB = new RgaId(2L, "B"); // '?'

        assertTrue(RgaIds.compare(opB, opA) < 0,
                "opB('?')가 opA('!')보다 앞이어야 한다 → 결과: Hi?!");
    }

    // ── key ────────────────────────────────────────────────────────

    @Test
    @DisplayName("key()는 \"counter@siteId\" 형식의 문자열을 반환한다")
    void key_format() {
        // TS: idKey({counter:42, siteId:'site-001'}) === '42@site-001'
        RgaId id = new RgaId(42L, "site-001");
        assertEquals("42@site-001", RgaIds.key(id));
    }

    @Test
    @DisplayName("서로 다른 id는 서로 다른 키를 반환한다")
    void key_distinctIds_distinctKeys() {
        // TS: "1@2" vs "12@" — 구분 가능한 형식인지 확인
        RgaId a = new RgaId(1L, "2");
        RgaId b = new RgaId(12L, "");

        assertNotEquals(RgaIds.key(a), RgaIds.key(b));
    }

    // ── equals ────────────────────────────────────────────────────

    @Test
    @DisplayName("counter와 siteId가 모두 같으면 equals는 true를 반환한다")
    void equals_sameFields_returnsTrue() {
        RgaId a = new RgaId(7L, "session-abc");
        RgaId b = new RgaId(7L, "session-abc");

        assertTrue(RgaIds.equals(a, b));
    }

    @Test
    @DisplayName("counter가 다르면 equals는 false를 반환한다")
    void equals_differentCounter_returnsFalse() {
        RgaId a = new RgaId(1L, "X");
        RgaId b = new RgaId(2L, "X");

        assertFalse(RgaIds.equals(a, b));
    }

    @Test
    @DisplayName("siteId가 다르면 equals는 false를 반환한다")
    void equals_differentSiteId_returnsFalse() {
        RgaId a = new RgaId(1L, "X");
        RgaId b = new RgaId(1L, "Y");

        assertFalse(RgaIds.equals(a, b));
    }
}
