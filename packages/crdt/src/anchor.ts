// ─── P6 라이브 커서 anchor 변환 (순수) ───────────────────────────
// caret 위치를 RGA 문자 id(anchorId)로 표현하고 되돌린다. anchorId = caret 직전 문자 id.
// resolveAnchorToIndex는 tombstone 포함 전체 순회가 필요하므로 RgaState.sentinel.next를
// 직접 따라간다(getVisibleNodes는 tombstone 제외라 fallback 계산 불가).

import { idEquals, idKey } from './id.js';
import type { DocState } from './block.js';
import type { RgaId } from './types.js';

/**
 * anchorId(caret 직전 문자 id)를 현재 가시 index로 변환한다.
 * - null → 0 (블록 맨 앞).
 * - 앵커 문자가 살아있으면 → 그 문자의 가시 index + 1 (caret이 그 문자 뒤).
 * - tombstone이면 → 이후 첫 살아있는 문자의 가시 index로 fallback, 없으면 블록 가시 길이(끝).
 * - 앵커 미발견 → 블록 가시 길이(방어적).
 */
export function resolveAnchorToIndex(
  doc: DocState,
  blockId: RgaId,
  anchorId: RgaId | null,
): number {
  if (anchorId === null) return 0;
  const inline = doc.inlineRgas.get(idKey(blockId));
  if (!inline) return 0;

  let visibleIndex = 0;
  let cursor = inline.sentinel.next;
  while (cursor) {
    if (idEquals(cursor.id, anchorId)) {
      if (!cursor.deleted) return visibleIndex + 1; // 살아있는 앵커 문자 뒤
      // tombstone: 이후 첫 살아있는 문자로 fallback (visibleIndex = 다음 살아있는 문자의 index).
      let scan = cursor.next;
      while (scan) {
        if (!scan.deleted) return visibleIndex;
        scan = scan.next;
      }
      return visibleIndex; // 뒤에 살아있는 문자 없음 → 블록 끝
    }
    if (!cursor.deleted) visibleIndex += 1;
    cursor = cursor.next;
  }
  return visibleIndex; // 앵커 미발견 → 블록 끝(가시 길이)
}

/**
 * 가시 index(caret 위치)를 직전 문자 id로 변환한다(송신측 캡처).
 * visibleIndex<=0 → null(맨 앞). localInsert/localInlineInsert의 originId 관례와 일치.
 * 커서 이동은 빈번하므로 getVisibleNodes 배열 할당 없이 링크드리스트를 직접 순회한다(PR #12 리뷰).
 */
export function indexToAnchorId(
  doc: DocState,
  blockId: RgaId,
  visibleIndex: number,
): RgaId | null {
  if (visibleIndex <= 0) return null;
  const inline = doc.inlineRgas.get(idKey(blockId));
  if (!inline) return null;
  let count = 0;
  let cursor = inline.sentinel.next;
  while (cursor) {
    if (!cursor.deleted) {
      count += 1;
      if (count === visibleIndex) return cursor.id;
    }
    cursor = cursor.next;
  }
  return null;
}
