// ─── @ieum/crdt 공개 API ─────────────────────────────────────────
// 07 §8-2 public API 재export.
// 외부 런타임 의존성 0 — 순수 TypeScript.

// 함수
export { createRga, applyOp, localInsert, localDelete, toText, serializeRga, deserializeRga } from './rga.js';

// id 유틸
export { compareIds, idEquals, idKey } from './id.js';

// op 타입 가드 & 헬퍼
export {
  isInsertOp,
  isDeleteOp,
  isBlockInsertOp,
  isBlockDeleteOp,
  isBlockSetTypeOp,
  makeInsertOp,
  makeDeleteOp,
  makeBlockInsertOp,
  makeBlockDeleteOp,
  makeBlockSetTypeOp,
} from './op.js';

// 타입
export type {
  RgaId,
  RgaNode,
  RgaState,
  InsertOp,
  DeleteOp,
  RgaOp,
  SerializedRga,
  SerializedRgaNode,
  BlockType,
  BlockMeta,
  BlockInsertOp,
  BlockDeleteOp,
  BlockSetTypeOp,
  BlockOp,
  InlineInsertOp,
  InlineDeleteOp,
  AnyOp,
} from './types.js';
