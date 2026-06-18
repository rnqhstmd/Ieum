import type {
  RgaState,
  RgaOp,
  InsertOp,
  DeleteOp,
  SerializedRga,
} from './types.js';
import { idKey } from './id.js';

// ─── createRga ────────────────────────────────────────────────────

/**
 * 새 RGA 상태를 생성한다.
 * sentinel 노드를 링크드 리스트의 헤드로 초기화한다.
 */
export function createRga(siteId: string): RgaState {
  // sentinel: id=(0, '') 는 절대 충돌하지 않는 특수 노드
  const sentinel: RgaState['sentinel'] = {
    id: { counter: 0, siteId: '' },
    originId: null,
    value: '',
    deleted: true,   // sentinel은 항상 삭제 상태 — toText()에서 제외
    next: null,
  };

  return {
    siteId,
    localClock: 0,
    nodeMap: new Map(),
    sentinel,
    pendingBuffer: [],
  };
}

// ─── applyOp ─────────────────────────────────────────────────────

/**
 * 원격 op를 RGA에 적용한다. 인과 버퍼링·멱등성을 보장한다.
 * (07 §3-3, §6-1, §6-2)
 *
 * TODO(Phase 2 — TDD): insertNode / drainBuffer 완전 구현
 */
export function applyOp(rga: RgaState, op: RgaOp): void {
  throw new Error('not implemented — Phase 2 (TDD)');
}

// ─── localInsert ─────────────────────────────────────────────────

/**
 * 가시적 텍스트 기준 index 위치에 value를 삽입하고 InsertOp를 반환한다.
 * 반환된 op는 서버/peer에 전송해야 한다. (07 §3-1)
 *
 * TODO(Phase 2 — TDD): getVisibleNodeAt 구현 필요
 */
export function localInsert(
  rga: RgaState,
  index: number,
  value: string,
): InsertOp {
  throw new Error('not implemented — Phase 2 (TDD)');
}

// ─── localDelete ─────────────────────────────────────────────────

/**
 * 가시적 텍스트 기준 index 위치의 문자를 삭제하고 DeleteOp를 반환한다.
 * (07 §3-2)
 *
 * TODO(Phase 2 — TDD): getVisibleNodeAt 구현 필요
 */
export function localDelete(rga: RgaState, index: number): DeleteOp {
  throw new Error('not implemented — Phase 2 (TDD)');
}

// ─── toText ──────────────────────────────────────────────────────

/**
 * RGA의 가시적 문자를 이어 붙여 문자열로 반환한다.
 * deleted=true 노드(tombstone)는 제외한다. (07 §3-5)
 *
 * TODO(Phase 2 — TDD): sentinel.next 순회 구현 필요
 */
export function toText(rga: RgaState): string {
  throw new Error('not implemented — Phase 2 (TDD)');
}

// ─── serializeRga ────────────────────────────────────────────────

/**
 * RGA 상태를 JSON 직렬화 가능한 스냅샷으로 변환한다.
 * tombstone 포함 전체 노드를 링크드 리스트 순서대로 포함한다.
 * (07 §1, §6-3 — MVP: GC 없음)
 *
 * TODO(Phase 2 — TDD): 노드 순회 + 직렬화 구현 필요
 */
export function serializeRga(rga: RgaState): SerializedRga {
  throw new Error('not implemented — Phase 2 (TDD)');
}

// ─── deserializeRga ──────────────────────────────────────────────

/**
 * 스냅샷에서 RGA 상태를 복원한다.
 * nodeMap과 링크드 리스트를 재구성한다. (07 §6-3)
 *
 * TODO(Phase 2 — TDD): nodeMap 재구성 + 링크드 리스트 연결 구현 필요
 */
export function deserializeRga(data: SerializedRga): RgaState {
  throw new Error('not implemented — Phase 2 (TDD)');
}

// ─── 내부 헬퍼 (스텁) — Phase 2에서 구현 ────────────────────────

/**
 * 가시적 텍스트 기준 index번째 노드를 반환한다.
 * index = -1이면 sentinel을 반환한다.
 * TODO(Phase 2 — TDD)
 */
function getVisibleNodeAt(
  _rga: RgaState,
  _index: number,
): RgaState['sentinel'] | null {
  throw new Error('not implemented — Phase 2 (TDD)');
}

/**
 * 인과적으로 준비된 op인지 확인한다.
 * originId가 null이거나 nodeMap에 이미 존재하면 ready. (07 §6-1)
 * TODO(Phase 2 — TDD)
 */
function isCausallyReady(_rga: RgaState, _op: InsertOp): boolean {
  throw new Error('not implemented — Phase 2 (TDD)');
}

/**
 * pendingBuffer에서 이제 적용 가능한 op를 꺼내 순서대로 적용한다.
 * TODO(Phase 2 — TDD)
 */
function drainBuffer(_rga: RgaState): void {
  throw new Error('not implemented — Phase 2 (TDD)');
}

/**
 * 링크드 리스트에 newNode를 삽입한다.
 * 같은 originId를 가진 형제 노드들과 compareIds로 tie-break 정렬한다.
 * (07 §3-4)
 * TODO(Phase 2 — TDD)
 */
function insertNode(_rga: RgaState, _newNode: RgaState['sentinel']): void {
  throw new Error('not implemented — Phase 2 (TDD)');
}

/**
 * id로 노드를 찾는다. null이면 sentinel을 반환한다.
 * TODO(Phase 2 — TDD)
 */
function findNodeById(
  _rga: RgaState,
  _id: RgaState['sentinel']['id'] | null,
): RgaState['sentinel'] {
  throw new Error('not implemented — Phase 2 (TDD)');
}
