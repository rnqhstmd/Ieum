import type {
  RgaId,
  RgaOp,
  InsertOp,
  DeleteOp,
  BlockInsertOp,
  BlockDeleteOp,
  BlockSetTypeOp,
  BlockType,
  InlineInsertOp,
  InlineDeleteOp,
} from './types.js';

// ─── 타입 가드 ────────────────────────────────────────────────────

/** op가 InsertOp인지 확인한다. */
export function isInsertOp<V>(op: RgaOp<V>): op is InsertOp<V> {
  return op.type === 'insert';
}

/** op가 DeleteOp인지 확인한다. */
export function isDeleteOp<V>(op: RgaOp<V>): op is DeleteOp {
  return op.type === 'delete';
}

/** op가 BlockInsertOp인지 확인한다. */
export function isBlockInsertOp(op: unknown): op is BlockInsertOp {
  return (op as BlockInsertOp)?.type === 'block-insert';
}

/** op가 BlockDeleteOp인지 확인한다. */
export function isBlockDeleteOp(op: unknown): op is BlockDeleteOp {
  return (op as BlockDeleteOp)?.type === 'block-delete';
}

/** op가 BlockSetTypeOp인지 확인한다. */
export function isBlockSetTypeOp(op: unknown): op is BlockSetTypeOp {
  return (op as BlockSetTypeOp)?.type === 'block-set-type';
}

// ─── Op 생성 헬퍼 (스텁) ─────────────────────────────────────────

/**
 * InsertOp를 생성한다.
 * TODO(Phase 2): RgaState에서 localClock을 증가시켜 id를 자동 할당하도록 통합
 */
export function makeInsertOp<V>(
  id: RgaId,
  originId: RgaId | null,
  value: V,
): InsertOp<V> {
  // TODO: Phase 2 (TDD) — localClock 자동 증가 연동
  return { type: 'insert', id, originId, value };
}

/**
 * DeleteOp를 생성한다.
 * TODO(Phase 2): RgaState에서 대상 노드 존재 여부를 검증하도록 통합
 */
export function makeDeleteOp(targetId: RgaId): DeleteOp {
  // TODO: Phase 2 (TDD) — 존재 검증 연동
  return { type: 'delete', targetId };
}

/**
 * BlockInsertOp를 생성한다.
 * TODO(Phase 2): 블록 RGA 통합
 */
export function makeBlockInsertOp(
  id: RgaId,
  originId: RgaId | null,
  blockType: BlockType,
): BlockInsertOp {
  // TODO: Phase 2 (TDD) — 블록 RGA 통합
  return { type: 'block-insert', id, originId, blockType };
}

/**
 * BlockDeleteOp를 생성한다.
 * TODO(Phase 2): 블록 RGA 통합
 */
export function makeBlockDeleteOp(targetId: RgaId): BlockDeleteOp {
  // TODO: Phase 2 (TDD) — 블록 RGA 통합
  return { type: 'block-delete', targetId };
}

/**
 * BlockSetTypeOp를 생성한다. LWW 판정은 applyDocOp(block.ts)에서 수행한다.
 */
export function makeBlockSetTypeOp(
  blockId: RgaId,
  blockType: BlockType,
  clock: number,
  siteId: string,
): BlockSetTypeOp {
  return { type: 'block-set-type', blockId, blockType, clock, siteId };
}

/**
 * InlineInsertOp를 생성한다 — blockId 스코프가 추가된 인라인 삽입.
 */
export function makeInlineInsertOp(
  id: RgaId,
  originId: RgaId | null,
  value: string,
  blockId: RgaId,
): InlineInsertOp {
  return { type: 'insert', id, originId, value, blockId };
}

/**
 * InlineDeleteOp를 생성한다 — blockId 스코프가 추가된 인라인 삭제.
 */
export function makeInlineDeleteOp(targetId: RgaId, blockId: RgaId): InlineDeleteOp {
  return { type: 'delete', targetId, blockId };
}
