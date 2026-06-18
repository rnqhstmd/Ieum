import type {
  RgaState,
  RgaNode,
  RgaId,
  RgaOp,
  InsertOp,
  DeleteOp,
  SerializedRga,
} from './types.js';
import { idKey, idEquals, compareIds } from './id.js';

// ─── createRga ────────────────────────────────────────────────────

/**
 * 새 RGA 상태를 생성한다.
 * sentinel 노드를 링크드 리스트의 헤드로 초기화한다.
 */
export function createRga(siteId: string): RgaState {
  // sentinel: id=(0, '') 는 절대 충돌하지 않는 특수 노드
  const sentinel: RgaNode = {
    id: { counter: 0, siteId: '' },
    originId: null,
    value: '',
    deleted: true, // sentinel은 항상 삭제 상태 — toText()에서 제외
    next: null,
  };

  return {
    siteId,
    localClock: 0,
    nodeMap: new Map(),
    sentinel,
    pendingBuffer: [],
    pendingDeletes: new Set(),
  };
}

// ─── applyOp ─────────────────────────────────────────────────────

/**
 * 원격 op를 RGA에 적용한다. 인과 버퍼링·멱등성을 보장한다. (07 §3-3, §6-1, §6-2)
 *
 * - delete: 대상 노드를 tombstone 처리(멱등). 대상 미도착 시 pendingDeletes에
 *   보관했다가 해당 노드 삽입 시점에 즉시 tombstone (delete 인과 버퍼링 — design.md D3).
 * - insert: 이미 적용된 id면 무시(멱등). originId 미도착이면 pendingBuffer에 보관.
 *   삽입 후 drainBuffer로 풀린 op를 재적용.
 */
export function applyOp(rga: RgaState, op: RgaOp): void {
  if (op.type === 'delete') {
    const key = idKey(op.targetId);
    const node = rga.nodeMap.get(key);
    if (node) node.deleted = true; // 이미 true여도 결과 동일 (멱등)
    else rga.pendingDeletes.add(key); // target 미도착 → 보류 (도착 시 tombstone)
    return;
  }

  // insert
  if (rga.nodeMap.has(idKey(op.id))) return; // 멱등: 이미 적용됨

  // 인과 준비성: originId가 존재해야 삽입 가능
  if (op.originId !== null && !rga.nodeMap.has(idKey(op.originId))) {
    rga.pendingBuffer.push(op);
    return;
  }

  insertNode(rga, nodeFromInsert(op));

  // 방금 삽입이 버퍼의 op를 인과적으로 풀어줄 수 있음
  drainBuffer(rga);
}

/** InsertOp로부터 새 활성 노드(tombstone 아님)를 만든다. */
function nodeFromInsert(op: InsertOp): RgaNode {
  return {
    id: op.id,
    originId: op.originId,
    value: op.value,
    deleted: false,
    next: null,
  };
}

// ─── localInsert ─────────────────────────────────────────────────

/**
 * 가시 텍스트 기준 index 위치에 value를 삽입하고 InsertOp를 반환한다. (07 §3-1)
 * head 위치(index 0)의 originId는 null이다 (sentinel.id 누수 금지 — design.md D1).
 */
export function localInsert(
  rga: RgaState,
  index: number,
  value: string,
): InsertOp {
  const predecessor = index === 0 ? null : getVisibleNodeAt(rga, index - 1);
  const op: InsertOp = {
    type: 'insert',
    id: { counter: ++rga.localClock, siteId: rga.siteId },
    originId: predecessor ? predecessor.id : null,
    value,
  };
  applyOp(rga, op);
  return op;
}

// ─── localDelete ─────────────────────────────────────────────────

/**
 * 가시 텍스트 기준 index 위치의 문자를 삭제하고 DeleteOp를 반환한다. (07 §3-2)
 */
export function localDelete(rga: RgaState, index: number): DeleteOp {
  const target = getVisibleNodeAt(rga, index);
  if (!target) throw new RangeError(`localDelete: index ${index} out of range`);

  const op: DeleteOp = { type: 'delete', targetId: target.id };
  applyOp(rga, op);
  return op;
}

// ─── toText ──────────────────────────────────────────────────────

/**
 * RGA의 가시 문자를 이어 붙여 문자열로 반환한다.
 * deleted=true 노드(tombstone)는 제외한다. (07 §3-5)
 */
export function toText(rga: RgaState): string {
  const chars: string[] = [];
  let cursor = rga.sentinel.next;
  while (cursor) {
    if (!cursor.deleted) chars.push(cursor.value);
    cursor = cursor.next;
  }
  return chars.join('');
}

// ─── serializeRga ────────────────────────────────────────────────

/**
 * RGA 상태를 JSON 직렬화 가능한 스냅샷으로 변환한다.
 * tombstone 포함 전체 노드를 링크드 리스트 순서대로 포함한다. (07 §1, §6-3 — MVP: GC 없음)
 */
export function serializeRga(rga: RgaState): SerializedRga {
  const nodes: SerializedRga['nodes'] = [];
  let cursor = rga.sentinel.next;
  while (cursor) {
    nodes.push({
      id: cursor.id,
      originId: cursor.originId,
      value: cursor.value,
      deleted: cursor.deleted,
    });
    cursor = cursor.next;
  }
  return { siteId: rga.siteId, localClock: rga.localClock, nodes };
}

// ─── deserializeRga ──────────────────────────────────────────────

/**
 * 스냅샷에서 RGA 상태를 복원한다. nodes 배열은 이미 수렴 순서이므로
 * 재정렬(insertNode) 없이 순차 연결한다. (07 §6-3 — design.md D6)
 */
export function deserializeRga(data: SerializedRga): RgaState {
  const rga = createRga(data.siteId);
  rga.localClock = data.localClock;

  let prev: RgaNode = rga.sentinel;
  for (const sn of data.nodes) {
    const node: RgaNode = {
      id: sn.id,
      originId: sn.originId,
      value: sn.value,
      deleted: sn.deleted,
      next: null,
    };
    prev.next = node;
    prev = node;
    rga.nodeMap.set(idKey(node.id), node);
  }
  return rga;
}

// ─── 내부 헬퍼 ────────────────────────────────────────────────────

/** 두 originId가 같은 부모를 가리키는지 (null 안전). */
function sameOrigin(a: RgaId | null, b: RgaId | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return idEquals(a, b);
}

/**
 * 가시 텍스트 기준 index번째 노드를 반환한다. 범위 밖이면 null.
 */
function getVisibleNodeAt(rga: RgaState, index: number): RgaNode | null {
  if (index < 0) return null;
  let cursor = rga.sentinel.next;
  let i = 0;
  while (cursor) {
    if (!cursor.deleted) {
      if (i === index) return cursor;
      i++;
    }
    cursor = cursor.next;
  }
  return null;
}

/** id로 노드를 찾는다. null이면 sentinel을 반환한다. */
function findNodeById(rga: RgaState, id: RgaId | null): RgaNode {
  if (id === null) return rga.sentinel;
  return rga.nodeMap.get(idKey(id)) ?? rga.sentinel;
}

/**
 * DFS 평면 리스트에서 node의 서브트리(node + 모든 후손)의 마지막 노드를 반환한다.
 * 같은 originId 형제 사이에 끼어 있는 후손을 건너뛰기 위해 사용한다 (정확한 RGA 삽입).
 */
function endOfSubtree(node: RgaNode): RgaNode {
  const subtreeIds = new Set<string>([idKey(node.id)]);
  let last = node;
  let cursor = node.next;
  while (cursor && cursor.originId !== null && subtreeIds.has(idKey(cursor.originId))) {
    subtreeIds.add(idKey(cursor.id));
    last = cursor;
    cursor = cursor.next;
  }
  return last;
}

/**
 * 링크드 리스트에 newNode를 삽입한다. (07 §3-4 — design.md D2)
 * 같은 originId 형제들과 compareIds로 tie-break 정렬하되,
 * newNode보다 앞서는 형제의 서브트리 전체를 건너뛴다 (중첩 정확성).
 */
function insertNode(rga: RgaState, newNode: RgaNode): void {
  let insertAfter = findNodeById(rga, newNode.originId);
  let cursor = insertAfter.next;

  while (cursor && sameOrigin(cursor.originId, newNode.originId)) {
    if (compareIds(cursor.id, newNode.id) < 0) {
      // cursor가 newNode보다 앞에 정렬 → cursor의 서브트리 전체를 건너뜀
      insertAfter = endOfSubtree(cursor);
      cursor = insertAfter.next;
    } else {
      // cursor가 newNode보다 뒤에 정렬 → cursor 앞에 삽입
      break;
    }
  }

  newNode.next = insertAfter.next;
  insertAfter.next = newNode;
  const key = idKey(newNode.id);
  rga.nodeMap.set(key, newNode);

  // 이 노드의 delete가 먼저 도착해 보류돼 있었다면 즉시 tombstone (delete 인과 버퍼링)
  if (rga.pendingDeletes.has(key)) {
    newNode.deleted = true;
    rga.pendingDeletes.delete(key);
  }
}

/** 인과적으로 준비된 op인지 확인한다. (07 §6-1) */
function isCausallyReady(rga: RgaState, op: InsertOp): boolean {
  return op.originId === null || rga.nodeMap.has(idKey(op.originId));
}

/**
 * pendingBuffer에서 이제 적용 가능한 op를 꺼내 순서대로 적용한다. (07 §6-1)
 * 적용으로 새 노드가 생기면 또 다른 op가 풀릴 수 있으므로 진행이 멈출 때까지 반복한다.
 */
function drainBuffer(rga: RgaState): void {
  let progress = true;
  while (progress) {
    progress = false;
    rga.pendingBuffer = rga.pendingBuffer.filter((op) => {
      if (isCausallyReady(rga, op)) {
        if (!rga.nodeMap.has(idKey(op.id))) {
          insertNode(rga, nodeFromInsert(op));
        }
        progress = true;
        return false; // 버퍼에서 제거
      }
      return true;
    });
  }
}
