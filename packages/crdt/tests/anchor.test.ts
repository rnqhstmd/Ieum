import { describe, it, expect } from 'vitest';
import {
  createEmptyDocument,
  applyDocOp,
  makeBlockInsertOp,
  localInlineInsert,
  localInlineDelete,
  getVisibleNodes,
  idKey,
  idEquals,
} from '../src/index.js';
import type { DocState, RgaId } from '../src/index.js';
import { resolveAnchorToIndex, indexToAnchorId } from '../src/anchor.js';

// P6 라이브 커서 / AC-1,2,3,4,6: anchorId(caret 직전 문자 id) ↔ 가시 index 변환 (순수).
const BLOCK: RgaId = { counter: 0, siteId: 'genesis' };

function docWith(text: string, siteId = 'site_a'): DocState {
  const doc = createEmptyDocument(siteId);
  applyDocOp(doc, makeBlockInsertOp(BLOCK, null, 'paragraph'));
  for (let i = 0; i < text.length; i++) localInlineInsert(doc, BLOCK, i, text[i]!);
  return doc;
}
/** 블록의 가시 문자 RgaId 목록(순서). */
function charIds(doc: DocState): RgaId[] {
  return getVisibleNodes(doc.inlineRgas.get(idKey(BLOCK))!).map((n) => n.id);
}

describe('anchor — indexToAnchorId / resolveAnchorToIndex', () => {
  it('AC-1: indexToAnchorId는 caret 직전 문자 id를 반환하고 resolve와 왕복한다', () => {
    const doc = docWith('hello'); // h e l l o
    const ids = charIds(doc);
    // caret index 3(= "hel" 뒤) 직전 문자 = index 2 문자(첫 'l').
    const anchor = indexToAnchorId(doc, BLOCK, 3);
    expect(anchor).not.toBeNull();
    expect(idEquals(anchor!, ids[2]!)).toBe(true);
    // 왕복: 살아있는 앵커 → caret index 복원.
    expect(resolveAnchorToIndex(doc, BLOCK, anchor)).toBe(3);
    // 맨 앞 → null, resolve(null)=0.
    expect(indexToAnchorId(doc, BLOCK, 0)).toBeNull();
    expect(resolveAnchorToIndex(doc, BLOCK, null)).toBe(0);
  });

  it('AC-2(M1): 앵커 문자 앞에 N개 삽입하면 resolve가 +N 되고 동일 노드를 가리킨다', () => {
    const doc = docWith('hello');
    const ids = charIds(doc);
    const anchorL = ids[2]!; // 첫 'l'
    expect(resolveAnchorToIndex(doc, BLOCK, anchorL)).toBe(3); // 'l' 뒤
    // 앵커 '앞쪽'(index 0)에 2문자 삽입 → 앵커 노드는 그대로, 가시 위치만 +2.
    localInlineInsert(doc, BLOCK, 0, 'X');
    localInlineInsert(doc, BLOCK, 1, 'Y');
    expect(resolveAnchorToIndex(doc, BLOCK, anchorL)).toBe(5); // 3 + 2
    // 동일 노드(첫 'l')를 여전히 가리킨다.
    const visibleAtResolve = getVisibleNodes(doc.inlineRgas.get(idKey(BLOCK))!)[5 - 1]!;
    expect(idEquals(visibleAtResolve.id, anchorL)).toBe(true);
    expect(visibleAtResolve.value).toBe('l');
  });

  it('AC-3: 앵커 문자가 tombstone되면 다음 살아있는 문자의 index로 fallback한다', () => {
    const doc = docWith('abc');
    const ids = charIds(doc);
    const anchorB = ids[1]!; // 'b'
    expect(resolveAnchorToIndex(doc, BLOCK, anchorB)).toBe(2); // 'b' 뒤
    localInlineDelete(doc, BLOCK, 1); // 'b' 삭제(tombstone) → 가시 "ac"
    // 'b' 다음 살아있는 문자 'c'의 가시 index(=1)로 fallback.
    expect(resolveAnchorToIndex(doc, BLOCK, anchorB)).toBe(1);
  });

  it('AC-4: 마지막 문자가 tombstone되면 블록 가시 길이(끝)를 반환한다', () => {
    const doc = docWith('ab');
    const ids = charIds(doc);
    const anchorB = ids[1]!; // 마지막 'b'
    localInlineDelete(doc, BLOCK, 1); // 'b' 삭제 → 가시 "a"
    // 다음 살아있는 문자 없음 → 블록 가시 길이(1) = 끝.
    expect(resolveAnchorToIndex(doc, BLOCK, anchorB)).toBe(1);
  });

  it('AC-6: 빈 블록/anchorId null은 0을 반환한다', () => {
    const empty = docWith('');
    expect(resolveAnchorToIndex(empty, BLOCK, null)).toBe(0);
    expect(indexToAnchorId(empty, BLOCK, 0)).toBeNull();
  });
});
