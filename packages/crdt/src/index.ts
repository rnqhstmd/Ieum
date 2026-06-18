// ─── @ieum/crdt 공개 API ─────────────────────────────────────────
// 07 §8-2 public API 재export.
// 외부 런타임 의존성 0 — 순수 TypeScript.

// 함수 (인라인 RGA 코어 + 제네릭 getVisibleNodes)
export {
  createRga,
  applyOp,
  localInsert,
  localDelete,
  toText,
  getVisibleNodes,
  serializeRga,
  deserializeRga,
} from './rga.js';

// 2-level 블록 RGA (P4b)
export {
  createDocument,
  createEmptyDocument,
  applyDocOp,
  docToBlocks,
  splitBlock,
  mergeBlockWithPrev,
  setBlockType,
  inheritType,
  localInlineInsert,
  localInlineDelete,
} from './block.js';

// wire 봉투 codec
export { toWire, fromWire } from './wire.js';

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
  makeInlineInsertOp,
  makeInlineDeleteOp,
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

// 2-level 블록 RGA 타입 (P4b)
export type { DocState, EditorBlockView } from './block.js';
export type { WireEnvelope } from './wire.js';
