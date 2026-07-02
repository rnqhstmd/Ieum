package com.ieum.collaboration;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * OpTypeConverter (JPA AttributeConverter<OpType, String>)에 대한 순수 단위 테스트.
 *
 * Spring/Docker 불필요 — POJO 직접 인스턴스화로 검증한다.
 * 5종 완전성 검증은 OpTypeTest에 위임하고, 여기서는 컨버터 위임 동작의
 * 최소 스모크(대표 케이스 + null 처리 + AC-5 예외 전파)만 검증한다.
 */
class OpTypeConverterTest {

    private final OpTypeConverter converter = new OpTypeConverter();

    // ── convertToDatabaseColumn (write 경로) ──────────────────────────

    @Test
    @DisplayName("convertToDatabaseColumn: INSERT는 \"insert\" 문자열로 변환된다")
    void convertToDatabaseColumn_insert_returnsWireString() {
        assertEquals("insert", converter.convertToDatabaseColumn(OpType.INSERT));
    }

    @Test
    @DisplayName("convertToDatabaseColumn: BLOCK_SET_TYPE는 \"block-set-type\" 문자열로 변환된다")
    void convertToDatabaseColumn_blockSetType_returnsWireString() {
        assertEquals("block-set-type", converter.convertToDatabaseColumn(OpType.BLOCK_SET_TYPE));
    }

    @Test
    @DisplayName("convertToDatabaseColumn: null 입력은 null을 반환한다")
    void convertToDatabaseColumn_null_returnsNull() {
        assertNull(converter.convertToDatabaseColumn(null));
    }

    // ── convertToEntityAttribute (read 경로) ──────────────────────────

    @Test
    @DisplayName("convertToEntityAttribute: \"delete\" 문자열은 DELETE로 변환된다")
    void convertToEntityAttribute_delete_returnsEnum() {
        assertEquals(OpType.DELETE, converter.convertToEntityAttribute("delete"));
    }

    @Test
    @DisplayName("convertToEntityAttribute: \"block-insert\" 문자열은 BLOCK_INSERT로 변환된다")
    void convertToEntityAttribute_blockInsert_returnsEnum() {
        assertEquals(OpType.BLOCK_INSERT, converter.convertToEntityAttribute("block-insert"));
    }

    @Test
    @DisplayName("convertToEntityAttribute: null 입력은 null을 반환한다")
    void convertToEntityAttribute_null_returnsNull() {
        assertNull(converter.convertToEntityAttribute(null));
    }

    // ── AC-5: read 경로에서 미지 값은 IllegalArgumentException을 전파한다 ──

    @Test
    @DisplayName("AC-5: convertToEntityAttribute에 알 수 없는 문자열을 주면 IllegalArgumentException이 전파된다")
    void convertToEntityAttribute_unknownValue_throwsIllegalArgumentException() {
        assertThrows(IllegalArgumentException.class,
                () -> converter.convertToEntityAttribute("unknown-op"));
    }
}
