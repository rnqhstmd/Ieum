package com.ieum.crdt.ops;

import com.ieum.crdt.RgaId;

/**
 * RGA 삭제 연산 (tombstone).
 * TS types.ts의 {@code DeleteOp}와 미러링.
 *
 * <ul>
 *   <li>{@code targetId} — 삭제할 요소의 id (노드를 제거하지 않고 deleted=true로 표시)</li>
 * </ul>
 *
 * wire 봉투 payload DELETE: {targetId} (요구사항 06/07 §wire 참조)
 */
public record DeleteOp(
        RgaId targetId
) implements RgaOp {
}
