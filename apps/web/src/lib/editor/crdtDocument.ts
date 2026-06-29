// ─── P5 CRDT 바인딩: 텍스트 diff → 인라인 op 생성 (순수) ──────────
// 블록 단위 old text vs new text를 비교해 인라인 INSERT/DELETE op를 만든다.
// walking skeleton: 단일 연속 편집 가정(공통 prefix/suffix). @ieum/crdt의
// localInlineInsert/localInlineDelete를 재사용 — 로컬 applyDocOp까지 캡슐화된다.

import {
  localInlineInsert,
  localInlineDelete,
  createEmptyDocument,
  applyDocOp,
  makeBlockInsertOp,
} from '@ieum/crdt';
import type { AnyOp, BlockType, DocState, RgaId } from '@ieum/crdt';

// 공유 genesis 블록 — 모든 탭이 동일한 결정적 id로 초기 블록을 만든다.
// sync(서버 초기 상태 전달)가 범위 밖이므로, walking skeleton에서는 고정 id의
// genesis paragraph 블록을 양쪽 탭이 동일하게 생성하여 인라인 op가 수렴하게 한다.
// (구조 편집은 비활성이므로 블록은 이 genesis 하나로 충분.)
export const GENESIS_BLOCK_ID: RgaId = { counter: 0, siteId: 'genesis' };

/**
 * 협업용 문서를 만든다. 모든 탭에서 동일한 genesis 블록 1개로 시작하므로
 * 같은 pageId의 두 탭이 인라인 타이핑을 수렴시킬 수 있다.
 */
export function createCollaborativeDocument(siteId: string): DocState {
  // @ieum/crdt의 createDocument는 siteId 기반 블록 id를 만들어 탭마다 달라지므로 쓰지 않는다.
  // 빈 문서 + 고정 GENESIS_BLOCK_ID 블록을 직접 삽입해 모든 탭이 같은 블록 위에서 수렴하게 한다.
  const doc = createEmptyDocument(siteId);
  applyDocOp(doc, makeBlockInsertOp(GENESIS_BLOCK_ID, null, 'paragraph'));
  return doc;
}

/**
 * blockId 블록의 oldText→newText 차이를 인라인 op로 생성하고 doc에 로컬 적용한다.
 * 반환 op는 전송용(toWire 대상). DELETE를 INSERT보다 먼저 수행한다.
 */
export function diffBlockText(
  doc: DocState,
  blockId: RgaId,
  oldText: string,
  newText: string,
): AnyOp[] {
  const minLen = Math.min(oldText.length, newText.length);

  // 공통 prefix 길이.
  let p = 0;
  while (p < minLen && oldText[p] === newText[p]) p++;

  // 공통 suffix 길이 — p와 겹치지 않도록 (minLen - p)로 clamp.
  let s = 0;
  const maxSuffix = minLen - p;
  while (
    s < maxSuffix &&
    oldText[oldText.length - 1 - s] === newText[newText.length - 1 - s]
  ) {
    s++;
  }

  const ops: AnyOp[] = [];

  // 삭제 구간 old[p .. oldText.length - s): 가시 index p에서 순차 삭제(뒤가 당겨짐).
  const deleteCount = oldText.length - s - p;
  for (let i = 0; i < deleteCount; i++) {
    ops.push(localInlineDelete(doc, blockId, p));
  }

  // 삽입 구간 new[p .. newText.length - s): index p부터 한 문자씩.
  const added = newText.slice(p, newText.length - s);
  for (let k = 0; k < added.length; k++) {
    ops.push(localInlineInsert(doc, blockId, p + k, added.charAt(k)));
  }

  return ops;
}

/**
 * 텍스트가 블록 타입 단축키 prefix로 시작하는지 감지한다.
 * 일치 시 { type, consumed } 반환, 불일치 시 null.
 */
export function detectBlockTypeShortcut(
  text: string,
): { type: BlockType; consumed: number } | null {
  if (text.startsWith('### ')) return { type: 'heading3', consumed: 4 };
  if (text.startsWith('## ')) return { type: 'heading2', consumed: 3 };
  if (text.startsWith('# ')) return { type: 'heading1', consumed: 2 };
  if (text.startsWith('- ')) return { type: 'bullet', consumed: 2 };
  if (text.startsWith('```')) return { type: 'code', consumed: 3 };
  return null;
}
