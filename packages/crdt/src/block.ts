// ─── 2-level 블록 RGA (P4b) ──────────────────────────────────────
// 외부 블록 RGA(RgaState<BlockMeta>) + 블록별 내부 인라인 RGA(RgaState<string>).
// 정렬·인과버퍼·멱등 머신은 rga.ts의 제네릭 createRga/applyOp를 공유한다.
// 블록 전용 의미론(LWW 타입, blockId 스코프, 블록 미도착 인라인 버퍼, split/merge)만 여기 둔다.

import type {
  RgaId,
  RgaState,
  RgaNode,
  BlockMeta,
  BlockType,
  BlockInsertOp,
  BlockDeleteOp,
  BlockSetTypeOp,
  InlineInsertOp,
  InlineDeleteOp,
  AnyOp,
} from './types.js';
import { createRga, applyOp, toText, getVisibleNodes } from './rga.js';
import { idKey } from './id.js';
import {
  makeBlockInsertOp,
  makeBlockDeleteOp,
  makeBlockSetTypeOp,
  makeInlineInsertOp,
  makeInlineDeleteOp,
} from './op.js';

// ─── 문서 상태 ────────────────────────────────────────────────────

export interface DocState {
  siteId: string;
  localClock: number; // 로컬 op id 발급용 단조 클락 (블록·인라인 공용)
  blockRga: RgaState<BlockMeta>; // 외부 블록 리스트 RGA
  inlineRgas: Map<string, RgaState<string>>; // idKey(blockId) → 블록별 내부 인라인 RGA
  pendingInline: (InlineInsertOp | InlineDeleteOp)[]; // 블록 미도착 인라인 op 버퍼
  pendingSetType: BlockSetTypeOp[]; // 블록 미도착 set-type 버퍼
}

/** 렌더링용 블록 도출 결과. (P3 EditorBlock과 형태 정합; id는 RgaId) */
export interface EditorBlockView {
  id: RgaId;
  type: BlockType;
  text: string;
}

// ─── createDocument ──────────────────────────────────────────────

/** 빈 paragraph 블록 1개로 시작하는 새 문서를 만든다. (AC-1) */
export function createDocument(siteId: string): DocState {
  const doc: DocState = {
    siteId,
    localClock: 0,
    blockRga: createRga<BlockMeta>(siteId),
    inlineRgas: new Map(),
    pendingInline: [],
    pendingSetType: [],
  };
  const firstId: RgaId = { counter: ++doc.localClock, siteId };
  applyDocOp(doc, makeBlockInsertOp(firstId, null, 'paragraph'));
  return doc;
}

// ─── applyDocOp ──────────────────────────────────────────────────

/** 임의 op(AnyOp)를 문서에 적용한다. 멱등·인과버퍼 보장. (AC-3,4,5,6,7,13,14) */
export function applyDocOp(doc: DocState, op: AnyOp): void {
  switch (op.type) {
    case 'block-insert': {
      const value: BlockMeta = { type: op.blockType, typeClock: 0, typeSiteId: '' };
      applyOp(doc.blockRga, { type: 'insert', id: op.id, originId: op.originId, value });
      const key = idKey(op.id);
      // 멱등: 기존 인라인 RGA를 덮어쓰지 않는다.
      if (!doc.inlineRgas.has(key)) doc.inlineRgas.set(key, createRga(doc.siteId));
      drainPending(doc); // 새 블록 도착 → 보류 인라인/set-type 재시도
      return;
    }
    case 'block-delete': {
      applyOp(doc.blockRga, { type: 'delete', targetId: op.targetId });
      return;
    }
    case 'block-set-type': {
      const node = doc.blockRga.nodeMap.get(idKey(op.blockId));
      if (!node) {
        doc.pendingSetType.push(op); // 인과 버퍼: 블록 미도착
        return;
      }
      applyLww(node.value, op);
      return;
    }
    case 'insert': {
      // InlineInsertOp
      const inline = doc.inlineRgas.get(idKey(op.blockId));
      if (!inline) {
        doc.pendingInline.push(op); // 블록 미도착 → 버퍼
        return;
      }
      applyOp(inline, op);
      return;
    }
    case 'delete': {
      // InlineDeleteOp
      const inline = doc.inlineRgas.get(idKey(op.blockId));
      if (!inline) {
        doc.pendingInline.push(op);
        return;
      }
      applyOp(inline, op);
      return;
    }
  }
}

/** block-set-type LWW: (clock DESC, siteId DESC) 최대가 승자. 멱등·교환. */
function applyLww(meta: BlockMeta, op: BlockSetTypeOp): void {
  const win =
    op.clock > meta.typeClock ||
    (op.clock === meta.typeClock && op.siteId > meta.typeSiteId);
  if (win) {
    meta.type = op.blockType;
    meta.typeClock = op.clock;
    meta.typeSiteId = op.siteId;
  }
}

/**
 * 블록 도착이 보류 op(인라인/set-type)를 풀 수 있으므로 진행이 멈출 때까지 재시도한다.
 * 인라인 op가 블록에 라우팅된 뒤, 블록 내부 문자 originId 인과버퍼는 인라인 RGA가 자체 처리(2단 버퍼).
 */
function drainPending(doc: DocState): void {
  let progress = true;
  while (progress) {
    progress = false;
    doc.pendingInline = doc.pendingInline.filter((op) => {
      const inline = doc.inlineRgas.get(idKey(op.blockId));
      if (!inline) return true;
      applyOp(inline, op);
      progress = true;
      return false;
    });
    doc.pendingSetType = doc.pendingSetType.filter((op) => {
      const node = doc.blockRga.nodeMap.get(idKey(op.blockId));
      if (!node) return true;
      applyLww(node.value, op);
      progress = true;
      return false;
    });
  }
}

// ─── docToBlocks (도출) ──────────────────────────────────────────

/** 외부 RGA 가시 순서대로 블록을 도출한다. tombstone 제외, 각 블록 텍스트 포함. (AC-1,2) */
export function docToBlocks(doc: DocState): EditorBlockView[] {
  return getVisibleNodes(doc.blockRga).map((b) => {
    const inline = doc.inlineRgas.get(idKey(b.id));
    return { id: b.id, type: b.value.type, text: inline ? toText(inline) : '' };
  });
}

// ─── 로컬 편집 헬퍼 ──────────────────────────────────────────────

/** Enter 분할 시 새 블록 타입 규칙. (Q1=A, §4M-3) */
export function inheritType(t: BlockType): BlockType {
  return t === 'heading1' || t === 'heading2' || t === 'heading3' ? 'paragraph' : t;
}

/**
 * 블록 분할(Enter). 커서 이후 가시 문자를 새 블록으로 옮긴다. (AC-8,9, §4M-3)
 * 반환: [BlockInsertOp, ...InlineDeleteOp(원본 tail), ...InlineInsertOp(새 블록)]. 로컬 즉시 적용.
 */
export function splitBlock(doc: DocState, blockId: RgaId, cursorIndex: number): AnyOp[] {
  const blockNode = doc.blockRga.nodeMap.get(idKey(blockId));
  const inline = doc.inlineRgas.get(idKey(blockId));
  if (!blockNode || !inline) return [];

  const newBlockId: RgaId = { counter: ++doc.localClock, siteId: doc.siteId };
  const blockInsert: BlockInsertOp = makeBlockInsertOp(
    newBlockId,
    blockId,
    inheritType(blockNode.value.type),
  );

  const tail = getVisibleNodes(inline).slice(cursorIndex);
  const deleteOps: InlineDeleteOp[] = tail.map((n) => makeInlineDeleteOp(n.id, blockId));

  const insertOps: InlineInsertOp[] = [];
  let prevId: RgaId | null = null;
  for (const n of tail) {
    const id: RgaId = { counter: ++doc.localClock, siteId: doc.siteId };
    insertOps.push(makeInlineInsertOp(id, prevId, n.value, newBlockId));
    prevId = id;
  }

  const ops: AnyOp[] = [blockInsert, ...deleteOps, ...insertOps];
  for (const op of ops) applyDocOp(doc, op);
  return ops;
}

/**
 * 블록 병합(Backspace at index 0). 현재 블록 내용을 이전 가시 블록 끝에 붙이고 현재 블록 삭제. (AC-10,11, §4M-4)
 * 첫 블록이면 null. 반환: [...InlineInsertOp(이전 블록), BlockDeleteOp]. 로컬 즉시 적용.
 */
export function mergeBlockWithPrev(doc: DocState, blockId: RgaId): AnyOp[] | null {
  const prev = getPrevVisibleBlock(doc, blockId);
  if (!prev) return null;

  const src = doc.inlineRgas.get(idKey(blockId));
  const dest = doc.inlineRgas.get(idKey(prev.id));
  if (!src || !dest) return null;

  const srcNodes = getVisibleNodes(src);
  const destNodes = getVisibleNodes(dest);
  let prevId: RgaId | null =
    destNodes.length > 0 ? destNodes[destNodes.length - 1]!.id : null;

  const insertOps: InlineInsertOp[] = [];
  for (const n of srcNodes) {
    const id: RgaId = { counter: ++doc.localClock, siteId: doc.siteId };
    insertOps.push(makeInlineInsertOp(id, prevId, n.value, prev.id));
    prevId = id;
  }

  const blockDelete: BlockDeleteOp = makeBlockDeleteOp(blockId);
  const ops: AnyOp[] = [...insertOps, blockDelete];
  for (const op of ops) applyDocOp(doc, op);
  return ops;
}

/** 블록 타입 변경(로컬). localClock을 증가시켜 BlockSetTypeOp를 생성·적용. (FR-13) */
export function setBlockType(doc: DocState, blockId: RgaId, type: BlockType): BlockSetTypeOp {
  const op = makeBlockSetTypeOp(blockId, type, ++doc.localClock, doc.siteId);
  applyDocOp(doc, op);
  return op;
}

/** blockId 직전의 가시 블록을 반환한다. 첫 블록이면 null. */
function getPrevVisibleBlock(doc: DocState, blockId: RgaId): RgaNode<BlockMeta> | null {
  const blocks = getVisibleNodes(doc.blockRga);
  const idx = blocks.findIndex((b) => idKey(b.id) === idKey(blockId));
  if (idx <= 0) return null;
  return blocks[idx - 1] ?? null;
}
