package com.ieum.collaboration;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * CRDT 연산 타입.
 *
 * wire(소문자·하이픈) 문자열과 enum 상수를 매핑한다.
 */
public enum OpType {
    INSERT("insert"),
    DELETE("delete"),
    BLOCK_INSERT("block-insert"),
    BLOCK_DELETE("block-delete"),
    BLOCK_SET_TYPE("block-set-type");

    private final String wireValue;

    OpType(String wireValue) {
        this.wireValue = wireValue;
    }

    /**
     * enum → wire 소문자 문자열. {@link JsonValue}로 JSON 직렬화도 wire 형식을 사용한다.
     */
    @JsonValue
    public String toWire() {
        return wireValue;
    }

    /**
     * wire 문자열 → OpType. 매핑표 밖이면 {@link IllegalArgumentException}을 던진다.
     * {@link JsonCreator}로 JSON 역직렬화도 wire 형식을 사용한다.
     */
    @JsonCreator
    public static OpType fromWire(String wire) {
        for (OpType t : values()) {
            if (t.wireValue.equals(wire)) {
                return t;
            }
        }
        throw new IllegalArgumentException("알 수 없는 CRDT op_type wire 값: '" + wire + "'");
    }
}
