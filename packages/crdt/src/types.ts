// ─── 요소 고유 식별자 ────────────────────────────────────────────
// siteId는 CRDT 수렴 정확성을 위한 세션 식별자 (userId와 별개).
// 서버는 인증된 연결의 userId를 op에 태깅하며, siteId로 신원을 판단하지 않는다.
export interface RgaId {
  counter: number; // 사이트 내 단조증가 논리 클락
  siteId: string;  // 편집 세션/탭마다 생성되는 UUID
}

// ─── RGA 요소 (노드) ─────────────────────────────────────────────
export interface RgaNode<V = string> {
  id: RgaId;           // 이 요소의 고유 id
  originId: RgaId | null; // 이 요소가 삽입된 "직전" 요소의 id (null = 문서 시작)
  value: V;            // 실제 값 (문자, 또는 블록 메타)
  deleted: boolean;    // tombstone — true면 논리적으로 삭제됨
  next: RgaNode<V> | null; // 링크드 리스트 다음 노드
}

// ─── 연산 ─────────────────────────────────────────────────────────
export interface InsertOp<V = string> {
  type: 'insert';
  id: RgaId;           // 새 요소의 id
  originId: RgaId | null; // 삽입 위치 (이 id 직후에 삽입)
  value: V;
}

export interface DeleteOp {
  type: 'delete';
  targetId: RgaId;     // 삭제할 요소의 id
}

export type RgaOp<V = string> = InsertOp<V> | DeleteOp;

// ─── RGA 상태 (런타임) ────────────────────────────────────────────
export interface RgaState<V = string> {
  siteId: string;
  localClock: number;
  // 노드 id → 노드 빠른 조회용 맵 (idKey(id) → RgaNode)
  nodeMap: Map<string, RgaNode<V>>;
  // 링크드 리스트의 sentinel 헤드 (value 없음, 항상 맨 앞)
  sentinel: RgaNode<V>;
  // 인과적으로 아직 적용할 수 없는 insert op를 보관하는 버퍼
  pendingBuffer: InsertOp<V>[];
  // target insert보다 먼저 도착한 delete의 targetId(idKey 문자열) 집합.
  // 해당 노드가 삽입되는 시점에 즉시 tombstone 처리된다 (delete 인과 버퍼링).
  pendingDeletes: Set<string>;
}

// ─── 직렬화 스냅샷 (Snapshot) ────────────────────────────────────
// tombstone 포함 전체 노드를 직렬화한다 (MVP: GC 없음).
export interface SerializedRgaNode<V = string> {
  id: RgaId;
  originId: RgaId | null;
  value: V;
  deleted: boolean;
}

export interface SerializedRga<V = string> {
  siteId: string;
  localClock: number;
  // 링크드 리스트 순서대로 노드 배열 (sentinel 제외)
  nodes: SerializedRgaNode<V>[];
}

// ─── 2-level 블록 RGA — 블록 메타 ────────────────────────────────
// 외부 RGA의 요소 타입. 각 블록이 RgaNode<BlockMeta>로 표현된다.
export type BlockType =
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bullet'
  | 'code';

export interface BlockMeta {
  type: BlockType;
  // 블록 타입 LWW 판정을 위한 논리 클락 (BlockSetTypeOp와 동기화)
  typeClock: number;
  typeSiteId: string;
}

// ─── 블록 레벨 Op ─────────────────────────────────────────────────
// 블록 삽입
export interface BlockInsertOp {
  type: 'block-insert';
  id: RgaId;           // 새 블록의 id
  originId: RgaId | null; // 이 블록 직전 블록의 id (null = 문서 맨 앞)
  blockType: BlockType;
}

// 블록 삭제 (tombstone)
export interface BlockDeleteOp {
  type: 'block-delete';
  targetId: RgaId;     // 삭제할 블록의 id
}

// 블록 타입 변경 — LWW (Last Write Wins, clock 기준)
// 같은 블록에 대한 동시 변경은 (clock DESC, siteId DESC) 승자가 채택된다.
export interface BlockSetTypeOp {
  type: 'block-set-type';
  blockId: RgaId;
  blockType: BlockType;
  clock: number;       // 논리 클락
  siteId: string;
}

export type BlockOp = BlockInsertOp | BlockDeleteOp | BlockSetTypeOp;

// 인라인 op — blockId 스코프가 추가된 InsertOp / DeleteOp
export interface InlineInsertOp extends InsertOp<string> {
  blockId: RgaId; // 어느 블록의 내부 RGA에 삽입할지
}

export interface InlineDeleteOp extends DeleteOp {
  blockId: RgaId;
}

export type AnyOp = BlockOp | InlineInsertOp | InlineDeleteOp;
