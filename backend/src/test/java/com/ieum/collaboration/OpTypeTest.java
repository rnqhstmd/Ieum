package com.ieum.collaboration;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;

/**
 * OpType의 wire(소문자·하이픈 5종) 매핑 계약에 대한 순수 단위 테스트.
 *
 * 설계서(.dev/fix-crdt-optype-wire/design.md) 인터페이스 계약:
 *   INSERT("insert"), DELETE("delete"),
 *   BLOCK_INSERT("block-insert"), BLOCK_DELETE("block-delete"), BLOCK_SET_TYPE("block-set-type")
 *   toWire() / fromWire(String) / @JsonValue / @JsonCreator
 *
 * Docker/Spring 불필요 — 순수 enum 계약만 검증한다.
 */
class OpTypeTest {

    // ── AC-1: enum → wire 문자열 변환 완전성 ─────────────────────────

    @Test
    @DisplayName("INSERT.toWire()는 \"insert\"를 반환한다")
    void toWire_insert() {
        assertEquals("insert", OpType.INSERT.toWire());
    }

    @Test
    @DisplayName("DELETE.toWire()는 \"delete\"를 반환한다")
    void toWire_delete() {
        assertEquals("delete", OpType.DELETE.toWire());
    }

    @Test
    @DisplayName("BLOCK_INSERT.toWire()는 \"block-insert\"를 반환한다")
    void toWire_blockInsert() {
        assertEquals("block-insert", OpType.BLOCK_INSERT.toWire());
    }

    @Test
    @DisplayName("BLOCK_DELETE.toWire()는 \"block-delete\"를 반환한다")
    void toWire_blockDelete() {
        assertEquals("block-delete", OpType.BLOCK_DELETE.toWire());
    }

    @Test
    @DisplayName("BLOCK_SET_TYPE.toWire()는 \"block-set-type\"을 반환한다")
    void toWire_blockSetType() {
        assertEquals("block-set-type", OpType.BLOCK_SET_TYPE.toWire());
    }

    // ── AC-2: wire 문자열 → enum 역변환 + 왕복 일치 ────────────────────

    @Test
    @DisplayName("fromWire(\"insert\")는 OpType.INSERT를 반환한다")
    void fromWire_insert() {
        assertEquals(OpType.INSERT, OpType.fromWire("insert"));
    }

    @Test
    @DisplayName("fromWire(\"delete\")는 OpType.DELETE를 반환한다")
    void fromWire_delete() {
        assertEquals(OpType.DELETE, OpType.fromWire("delete"));
    }

    @Test
    @DisplayName("fromWire(\"block-insert\")는 OpType.BLOCK_INSERT를 반환한다")
    void fromWire_blockInsert() {
        assertEquals(OpType.BLOCK_INSERT, OpType.fromWire("block-insert"));
    }

    @Test
    @DisplayName("fromWire(\"block-delete\")는 OpType.BLOCK_DELETE를 반환한다")
    void fromWire_blockDelete() {
        assertEquals(OpType.BLOCK_DELETE, OpType.fromWire("block-delete"));
    }

    @Test
    @DisplayName("fromWire(\"block-set-type\")는 OpType.BLOCK_SET_TYPE을 반환한다")
    void fromWire_blockSetType() {
        assertEquals(OpType.BLOCK_SET_TYPE, OpType.fromWire("block-set-type"));
    }

    @Test
    @DisplayName("모든 OpType은 toWire() 후 fromWire()로 왕복하면 원래 값과 같다 (5종)")
    void roundTrip_allFiveValues() {
        for (OpType type : OpType.values()) {
            assertEquals(type, OpType.fromWire(type.toWire()),
                    type + "는 toWire/fromWire 왕복 후 동일해야 한다");
        }
    }

    // ── AC-5: 알 수 없는 문자열 방어 (순수) ────────────────────────────

    @Test
    @DisplayName("fromWire(\"unknown-op\")는 IllegalArgumentException을 던진다")
    void fromWire_unknownValue_throwsIllegalArgumentException() {
        assertThrows(IllegalArgumentException.class, () -> OpType.fromWire("unknown-op"));
    }

    // ── AC-6(보조 앵커): values() 5종 + wire 집합 일치 ──────────────────

    @Test
    @DisplayName("OpType.values()는 정확히 5개이며 wire 집합이 기대 집합과 일치한다")
    void values_exactlyFiveWithExpectedWireSet() {
        OpType[] values = OpType.values();
        assertEquals(5, values.length, "OpType 상태는 정확히 5개여야 한다");

        Set<String> actualWireSet = Arrays.stream(values)
                .map(OpType::toWire)
                .collect(Collectors.toSet());
        Set<String> expectedWireSet = Set.of(
                "insert", "delete", "block-insert", "block-delete", "block-set-type");

        assertEquals(expectedWireSet, actualWireSet);
    }

    // ── AC-8: Jackson 직렬화/역직렬화 왕복 정렬 ─────────────────────────

    @Test
    @DisplayName("Jackson으로 직렬화하면 각 OpType이 대응 wire 소문자 JSON 문자열이 된다")
    void jackson_serialize_producesWireLowercaseString() throws Exception {
        ObjectMapper mapper = new ObjectMapper();

        assertEquals("\"insert\"", mapper.writeValueAsString(OpType.INSERT));
        assertEquals("\"delete\"", mapper.writeValueAsString(OpType.DELETE));
        assertEquals("\"block-insert\"", mapper.writeValueAsString(OpType.BLOCK_INSERT));
        assertEquals("\"block-delete\"", mapper.writeValueAsString(OpType.BLOCK_DELETE));
        assertEquals("\"block-set-type\"", mapper.writeValueAsString(OpType.BLOCK_SET_TYPE));
    }

    @Test
    @DisplayName("Jackson으로 wire 문자열을 역직렬화하면 대응 OpType이 된다")
    void jackson_deserialize_wireStringToOpType() throws Exception {
        ObjectMapper mapper = new ObjectMapper();

        assertEquals(OpType.INSERT, mapper.readValue("\"insert\"", OpType.class));
        assertEquals(OpType.DELETE, mapper.readValue("\"delete\"", OpType.class));
        assertEquals(OpType.BLOCK_INSERT, mapper.readValue("\"block-insert\"", OpType.class));
        assertEquals(OpType.BLOCK_DELETE, mapper.readValue("\"block-delete\"", OpType.class));
        assertEquals(OpType.BLOCK_SET_TYPE, mapper.readValue("\"block-set-type\"", OpType.class));
    }

    @Test
    @DisplayName("Jackson으로 알 수 없는 문자열을 역직렬화하면 예외가 발생한다")
    void jackson_deserialize_unknownString_throwsException() {
        ObjectMapper mapper = new ObjectMapper();

        assertThrows(Exception.class, () -> mapper.readValue("\"unknown-op\"", OpType.class));
    }

    // ── AC-8: Jackson 3(tools.jackson.databind) 직렬화/역직렬화 왕복 정렬 ──────
    // 프로덕션(CollaborationWebSocketHandler, JsonAuthenticationEntryPoint)은
    // Jackson 3(tools.jackson.databind)을 사용한다. @JsonValue/@JsonCreator는
    // 공용 com.fasterxml.jackson.annotation 패키지이므로 Jackson 3도 동일하게
    // honor하는지 실제 프로덕션 ObjectMapper로 실증한다.

    @Test
    @DisplayName("[Jackson 3] 직렬화하면 각 OpType이 대응 wire 소문자 JSON 문자열이 된다")
    void jackson3_serialize_producesWireLowercaseString() {
        tools.jackson.databind.ObjectMapper mapper = tools.jackson.databind.json.JsonMapper.builder().build();

        assertEquals("\"insert\"", mapper.writeValueAsString(OpType.INSERT));
        assertEquals("\"delete\"", mapper.writeValueAsString(OpType.DELETE));
        assertEquals("\"block-insert\"", mapper.writeValueAsString(OpType.BLOCK_INSERT));
        assertEquals("\"block-delete\"", mapper.writeValueAsString(OpType.BLOCK_DELETE));
        assertEquals("\"block-set-type\"", mapper.writeValueAsString(OpType.BLOCK_SET_TYPE));
    }

    @Test
    @DisplayName("[Jackson 3] wire 문자열을 역직렬화하면 대응 OpType이 된다")
    void jackson3_deserialize_wireStringToOpType() {
        tools.jackson.databind.ObjectMapper mapper = tools.jackson.databind.json.JsonMapper.builder().build();

        assertEquals(OpType.INSERT, mapper.readValue("\"insert\"", OpType.class));
        assertEquals(OpType.DELETE, mapper.readValue("\"delete\"", OpType.class));
        assertEquals(OpType.BLOCK_INSERT, mapper.readValue("\"block-insert\"", OpType.class));
        assertEquals(OpType.BLOCK_DELETE, mapper.readValue("\"block-delete\"", OpType.class));
        assertEquals(OpType.BLOCK_SET_TYPE, mapper.readValue("\"block-set-type\"", OpType.class));
    }

    @Test
    @DisplayName("[Jackson 3] 알 수 없는 문자열을 역직렬화하면 예외가 발생한다")
    void jackson3_deserialize_unknownString_throwsException() {
        tools.jackson.databind.ObjectMapper mapper = tools.jackson.databind.json.JsonMapper.builder().build();

        assertThrows(Exception.class, () -> mapper.readValue("\"unknown-op\"", OpType.class));
    }
}
