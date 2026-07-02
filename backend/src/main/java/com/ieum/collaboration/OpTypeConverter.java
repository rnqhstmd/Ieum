package com.ieum.collaboration;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/**
 * crdt_ops.op_type ↔ {@link OpType} 매핑 컨버터.
 *
 * wire(소문자) 문자열로 저장/조회하며, 변환 로직은 {@link OpType#toWire()}와
 * {@link OpType#fromWire(String)}에 위임한다. autoApply=false이므로
 * {@code CrdtOp.opType} 필드에 {@code @Convert}로 명시 적용해야 한다.
 */
@Converter
public class OpTypeConverter implements AttributeConverter<OpType, String> {

    @Override
    public String convertToDatabaseColumn(OpType attribute) {
        return attribute == null ? null : attribute.toWire();
    }

    @Override
    public OpType convertToEntityAttribute(String dbData) {
        return dbData == null ? null : OpType.fromWire(dbData);
    }
}
