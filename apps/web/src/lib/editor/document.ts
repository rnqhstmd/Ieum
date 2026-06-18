// ─── P3 블록 에디터 — 순수 블록 도큐먼트 모델 ────────────────────────
// architecture.md "블록 기반 contenteditable 에디터": 모델이 진실 원천.
// 모든 연산은 부수효과 없이 새 배열을 반환한다(불변). 추후 P4b 2-level 블록
// RGA 구현으로 교체 가능하도록 순수 함수 시그니처로 고정한다.
// BlockType은 @ieum/crdt와 공유(type-only import — 런타임 의존 없음).

import type { BlockType } from '@ieum/crdt';

export interface EditorBlock {
  id: string;
  type: BlockType;
  text: string;
}

export type EditorDoc = EditorBlock[];

// 블록 id 생성: crypto.randomUUID 우선, 없으면 단조 카운터 폴백.
let idCounter = 0;
function newBlockId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  idCounter += 1;
  return `block-${idCounter}`;
}

/** 새 페이지의 초기 문서: 빈 paragraph 블록 1개. */
export function createEmptyDocument(): EditorDoc {
  return [{ id: newBlockId(), type: 'paragraph', text: '' }];
}

/** id가 일치하는 블록만 transform으로 치환(불변 — 새 배열 반환). */
function mapBlock(
  doc: EditorDoc,
  id: string,
  transform: (block: EditorBlock) => EditorBlock,
): EditorDoc {
  return doc.map((b) => (b.id === id ? transform(b) : b));
}

/** 대상 블록의 text만 갱신(불변 — 새 배열 반환). */
export function updateText(doc: EditorDoc, id: string, text: string): EditorDoc {
  return mapBlock(doc, id, (b) => ({ ...b, text }));
}

/**
 * Enter: 캐럿 위치에서 블록을 둘로 나눈다.
 * 새(뒤) 블록 타입 = bullet이면 bullet 유지, 그 외는 paragraph.
 */
export function splitBlock(
  doc: EditorDoc,
  id: string,
  caret: number,
): { doc: EditorDoc; newBlockId: string } {
  const idx = doc.findIndex((b) => b.id === id);
  const cur = idx === -1 ? undefined : doc[idx];
  if (!cur) return { doc, newBlockId: '' };

  const before = cur.text.slice(0, caret);
  const after = cur.text.slice(caret);
  const id2 = newBlockId();
  // bullet은 연속 유지. heading 등은 끝에서 분할(뒤가 비면) 본문(paragraph)으로
  // 전환하되, 중간 분할(뒤에 내용 있음)이면 현재 타입을 유지한다.
  const newType: BlockType =
    cur.type === 'bullet' ? 'bullet' : after === '' ? 'paragraph' : cur.type;

  const next: EditorDoc = [
    ...doc.slice(0, idx),
    { ...cur, text: before },
    { id: id2, type: newType, text: after },
    ...doc.slice(idx + 1),
  ];
  return { doc: next, newBlockId: id2 };
}

/**
 * Backspace(블록 시작): 대상 블록을 직전 블록에 병합한다.
 * 첫 블록이면 병합 대상이 없으므로 null.
 */
export function mergeWithPrevious(
  doc: EditorDoc,
  id: string,
): { doc: EditorDoc; caretBlockId: string; caretOffset: number } | null {
  const idx = doc.findIndex((b) => b.id === id);
  if (idx <= 0) return null; // 미발견 또는 첫 블록

  const prev = doc[idx - 1];
  const cur = doc[idx];
  if (!prev || !cur) return null; // 방어(노출 불가 경로)
  const caretOffset = prev.text.length; // 병합 지점 = 이전 블록의 끝

  const next: EditorDoc = [
    ...doc.slice(0, idx - 1),
    { ...prev, text: prev.text + cur.text },
    ...doc.slice(idx + 1),
  ];
  return { doc: next, caretBlockId: prev.id, caretOffset };
}

/** 블록 타입 변경(text 유지). */
export function setType(doc: EditorDoc, id: string, type: BlockType): EditorDoc {
  return mapBlock(doc, id, (b) => ({ ...b, type }));
}

// 마크다운 단축 접두사 → 타입. 긴 접두사를 먼저 검사한다.
const MARKDOWN_SHORTCUTS: ReadonlyArray<readonly [string, BlockType]> = [
  ['### ', 'heading3'],
  ['## ', 'heading2'],
  ['# ', 'heading1'],
  ['- ', 'bullet'],
];

/**
 * 블록 시작의 마크다운 접두사를 타입으로 변환하고 접두사를 제거한다.
 * 매칭되는 접두사가 없으면 null.
 */
export function applyMarkdownShortcut(doc: EditorDoc, id: string): EditorDoc | null {
  const target = doc.find((b) => b.id === id);
  if (!target) return null;

  for (const [prefix, type] of MARKDOWN_SHORTCUTS) {
    if (target.text.startsWith(prefix)) {
      return mapBlock(doc, id, (b) => ({ ...b, type, text: b.text.slice(prefix.length) }));
    }
  }
  return null;
}
