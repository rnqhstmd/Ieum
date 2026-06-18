package com.ieum.crdt.ops;

import com.ieum.crdt.RgaId;

/**
 * RGA 삽입 연산.
 * TS types.ts의 {@code InsertOp<V>}와 미러링.
 *
 * <ul>
 *   <li>{@code id}      — 새로 삽입되는 요소의 고유 id</li>
 *   <li>{@code originId}— 삽입 위치 직전 요소의 id (null = sentinel 직후)</li>
 *   <li>{@code value}   — 삽입할 값 (글자 단위 RGA에서는 단일 문자)</li>
 * </ul>
 *
 * wire 봉투 payload INSERT: {id, originId, value} (요구사항 06/07 §wire 참조)
 */
public record InsertOp(
        RgaId id,
        RgaId originId,   // nullable — null이면 sentinel 직후 삽입
        Object value
) implements RgaOp {
}
