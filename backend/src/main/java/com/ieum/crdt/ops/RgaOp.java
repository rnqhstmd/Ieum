package com.ieum.crdt.ops;

/**
 * RGA 연산의 sealed 인터페이스.
 * TS types.ts의 {@code RgaOp<V> = InsertOp | DeleteOp} 유니온과 미러링.
 *
 * <p>Java 21 sealed interface + permits로 소진 패턴 매칭을 활성화한다.
 * 구현체: {@link InsertOp}, {@link DeleteOp}
 *
 * <p>사용 예 (Java 21 switch expression):
 * <pre>{@code
 *   switch (op) {
 *       case InsertOp ins -> ...
 *       case DeleteOp del -> ...
 *   }
 * }</pre>
 */
public sealed interface RgaOp permits InsertOp, DeleteOp {
}
