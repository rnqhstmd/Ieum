# 07 · 협업 엔진 — CRDT (RGA)

> **관련 문서**: [아키텍처](./04-architecture.md) · [데이터 모델](./05-data-model.md) · [API & 실시간](./06-api-and-realtime.md) · [인증 & 권한](./08-auth-and-permissions.md) · [TDD 전략](./09-tdd-strategy.md)

---

## 1. 왜 CRDT인가

### 1-1. 동시 편집 문제

여러 사용자가 같은 문서를 동시에 편집할 때 두 가지 고전적 접근이 있다.

| 방식 | 동작 원리 | 단점 |
|------|-----------|------|
| **중앙 잠금 (Locking)** | 한 사용자가 편집 중이면 다른 사용자는 대기 | UX 최악. 네트워크 단절 시 데드락 위험 |
| **OT (Operational Transformation)** | 동시 op를 서버에서 변환·직렬화 | 변환 함수가 op 조합별로 폭발적으로 복잡해짐. 중앙 서버 필수. 구현 버그 多 |
| **CRDT** | 수학적으로 수렴이 보장된 자료구조 | 초기 설계 복잡도 있으나, 수렴 보장이 타입 수준에서 증명됨 |

**Ieum의 선택 근거**: 실시간 서버가 단순 relay 역할만 해도 모든 replica가 같은 상태로 수렴한다. 중앙 변환 로직이 없으므로 서버를 수평 확장하거나 오프라인 편집 후 재연결하는 시나리오가 자연스럽게 지원된다.

### 1-2. CRDT 알고리즘 비교

| 알고리즘 | 아이디어 | 장점 | 단점 | Ieum 적합성 |
|----------|----------|------|------|--------------|
| **RGA** (Replicated Growable Array) | 각 요소가 고유 id를 가짐. 삽입 위치는 선행 요소의 id(originId)로 명시. 삭제는 tombstone | id 기반이라 인덱스 이동에 강함. 커서 앵커링 자연스러움 | tombstone 누적 → 주기적 GC 필요 | **채택** |
| **Logoot** | 요소마다 실수 범위의 위치 식별자 부여 | 구현 단순 | 삽입이 많을수록 식별자 비트 증가(identifier explosion) | 부적합 |
| **LSEQ** | Logoot 개선, 가변 식별자 길이 | Logoot보다 공간 효율 | 여전히 식별자 성장 문제 존재. interleaving 이슈 | 부적합 |
| **Fugue** | RGA 변형, interleaving 방지 보장 추가 | 동시 삽입 interleaving 없음 | 2023년 발표 논문, 생태계 얇음 | post-MVP 검토 |
| **Yjs (YATA)** | 실전 검증된 라이브러리 | 성숙도 최고 | **외부 라이브러리 사용 금지** 정책에 위배 | 사용 불가 |

**RGA를 채택한 구체적 이유**:
1. 요소 id가 불변이라 커서/selection을 문자 id에 앵커링하면 다른 사용자의 편집에도 커서가 올바른 위치를 유지한다.
2. 수렴성·멱등성·교환법칙이 알고리즘 수준에서 보장되어 TDD로 검증하기 적합하다.
3. MVP부터 2-level 블록 RGA(블록 타입 paragraph/heading1~3/bullet 지원)로 시작하며, 이후 인라인 서식(bold/italic)·추가 블록 타입으로 확장이 가능하다.

---

## 2. RGA 데이터 구조

### 2-1. 핵심 타입 정의

```typescript
// ─── 요소 고유 식별자 ───────────────────────────────────────
interface RgaId {
  counter: number;   // 사이트 내 단조증가 논리 클락
  siteId:  string;   // 편집 세션/탭마다 생성되는 UUID (userId와 별개)
  // ※ siteId는 CRDT 수렴 정확성을 위한 세션 식별자.
  //   사용자 신원(userId)은 WebSocket 연결 시 JWT 인증으로 별도 확인하며,
  //   siteId와 userId를 동일시하지 않는다. 서버는 인증된 연결의 userId를
  //   op에 태깅/기록하며, 클라이언트 siteId를 신뢰해 신원을 판단하지 않는다.
}

// ─── RGA 요소 (노드) ────────────────────────────────────────
interface RgaNode<V = string> {
  id:       RgaId;        // 이 요소의 고유 id
  originId: RgaId | null; // 이 요소가 삽입된 "직전" 요소의 id (null = 문서 시작)
  value:    V;            // 실제 값 (문자, 또는 블록 타입)
  deleted:  boolean;      // tombstone — true면 논리적으로 삭제됨
}

// ─── 연산 ────────────────────────────────────────────────────
interface InsertOp<V = string> {
  type:     'insert';
  id:       RgaId;        // 새 요소의 id
  originId: RgaId | null; // 삽입 위치 (이 id 직후에 삽입)
  value:    V;
}

interface DeleteOp {
  type:     'delete';
  targetId: RgaId;        // 삭제할 요소의 id
}

type RgaOp<V = string> = InsertOp<V> | DeleteOp;
```

### 2-2. RGA 연결 구조 (ASCII 다이어그램)

문서 `"ab"` → 사이트 A가 `c`를 `a` 뒤에 삽입, 사이트 B가 `d`를 `a` 뒤에 동시 삽입하는 경우:

```
초기 상태:
  [sentinel] ──→ [id:(1,A) value:'a'] ──→ [id:(1,B) value:'b']
  originId=null    originId=null             originId=(1,A)

사이트 A: Insert 'c' after (1,A)   →  id=(2,A), originId=(1,A)
사이트 B: Insert 'd' after (1,A)   →  id=(2,B), originId=(1,A)

수렴 후 (tie-break: counter 내림차순, 같으면 siteId 비교):
  counter 모두 2 → siteId 비교: "B" > "A" → B의 노드가 앞에 위치

  [sentinel] → [id:(1,A) 'a'] → [id:(2,B) 'd'] → [id:(2,A) 'c'] → [id:(1,B) 'b']
                                  ↑ tie-break 승자                    ↑ 기존 'b'
  결과 텍스트: "adcb"  (양쪽 replica 동일)
```

### 2-3. Mermaid — 노드 관계

```mermaid
graph LR
    S([sentinel<br/>id=null]) -->|originId=null| A["id:(1,A)<br/>value='H'"]
    A -->|originId=(1,A)| B["id:(1,B)<br/>value='i'"]
    A -->|originId=(1,A)| C["id:(2,A)<br/>value='e'<br/>deleted=true"]

    style C fill:#fdd,stroke:#c00
    style S fill:#eee
```

> `deleted=true` 노드(tombstone)는 순서 유지를 위해 구조에 남아 있지만 `toText()`에서 제외된다.

---

## 3. 연산 의사코드

### 3-1. 로컬 삽입 — `localInsert(index, value)`

```typescript
function localInsert(rga: RgaState, index: number, value: string): InsertOp {
  // 1. 가시적(visible) 텍스트 기준 index번째 노드를 찾는다
  const predecessor = getVisibleNodeAt(rga, index - 1); // null이면 문서 시작

  // 2. 새 op 생성: counter는 로컬 클락 증가
  const op: InsertOp = {
    type:     'insert',
    id:       { counter: ++rga.localClock, siteId: rga.siteId },
    originId: predecessor?.id ?? null,
    value,
  };

  // 3. 로컬 적용 후 서버/peer에 전송
  applyOp(rga, op);
  return op;
}
```

### 3-2. 로컬 삭제 — `localDelete(index)`

```typescript
function localDelete(rga: RgaState, index: number): DeleteOp {
  const target = getVisibleNodeAt(rga, index);
  if (!target) throw new Error('index out of range');

  const op: DeleteOp = {
    type:     'delete',
    targetId: target.id,
  };

  applyOp(rga, op);
  return op;
}
```

### 3-3. 원격 op 적용 — `applyRemote(op)`

```typescript
function applyRemote(rga: RgaState, op: RgaOp): void {
  if (op.type === 'delete') {
    const node = rga.nodeMap.get(idKey(op.targetId));
    if (!node) {
      // 멱등: 이미 없으면 무시 (혹은 인과 버퍼)
      bufferIfNotReady(rga, op); return;
    }
    node.deleted = true;
    return;
  }

  // insert
  if (rga.nodeMap.has(idKey(op.id))) return; // 멱등: 이미 적용됨

  // 인과 준비성 검사: originId가 존재해야 삽입 가능
  if (op.originId !== null && !rga.nodeMap.has(idKey(op.originId))) {
    rga.pendingBuffer.push(op); return;
  }

  insertNode(rga, {
    id:       op.id,
    originId: op.originId,
    value:    op.value,
    deleted:  false,
  });

  // 버퍼에서 이제 적용 가능한 op를 꺼내 재시도
  drainBuffer(rga);
}
```

### 3-4. 동시 삽입 tie-break 정렬 규칙

같은 `originId`에 여러 노드가 삽입될 때 결정론적 순서를 보장한다.

```typescript
function compareIds(a: RgaId, b: RgaId): number {
  // 1. counter 내림차순 (높은 counter가 앞에 위치)
  if (a.counter !== b.counter) return b.counter - a.counter;
  // 2. counter 같으면 siteId 사전 역순
  return b.siteId.localeCompare(a.siteId);
}

function insertNode(rga: RgaState, newNode: RgaNode): void {
  // originId 직후 위치를 찾고, 같은 originId를 가진 기존 노드들과
  // compareIds로 정렬하여 삽입 위치를 결정한다.
  let insertAfter = findNodeById(rga, newNode.originId); // sentinel or node

  // 같은 originId를 공유하는 형제 노드들을 지나치면서 정렬 위치 탐색
  let cursor = insertAfter?.next;
  while (cursor && cursor.originId === newNode.originId && compareIds(cursor.id, newNode.id) < 0) {
    insertAfter = cursor;
    cursor = cursor.next;
  }

  // 링크드 리스트에 newNode 삽입
  linkNode(rga, insertAfter, newNode);
  rga.nodeMap.set(idKey(newNode.id), newNode);
}
```

### 3-5. 텍스트 materialization — `toText()`

```typescript
function toText(rga: RgaState): string {
  const chars: string[] = [];
  let cursor = rga.sentinel.next;
  while (cursor) {
    if (!cursor.deleted) chars.push(cursor.value);
    cursor = cursor.next;
  }
  return chars.join('');
}
```

---

## 4. 수렴 예시 시나리오

두 사이트가 같은 위치에 동시 삽입하는 경우를 단계별로 추적한다.

**초기 문서**: `"Hi"` — 노드 순서: `[H(1,A)] → [i(1,B)]`

| 단계 | 사이트 A | 사이트 B |
|------|---------|---------|
| **1. 편집 발생** | `'!'` 삽입 after `(1,B)` → op: `{insert, id:(2,A), originId:(1,B), value:'!'}` | `'?'` 삽입 after `(1,B)` → op: `{insert, id:(2,B), originId:(1,B), value:'?'}` |
| **2. 로컬 적용** | 자신의 op 즉시 적용 → `"Hi!"` | 자신의 op 즉시 적용 → `"Hi?"` |
| **3. op 교환** | B의 op `(2,B,'?')` 수신 | A의 op `(2,A,'!')` 수신 |
| **4. 원격 적용** | `applyRemote({id:(2,B), originId:(1,B), '?'})` 실행 → `insertNode` 호출 → **tie-break**: counter 2 = 2, siteId B > A → `(2,B)` 앞, `(2,A)` 뒤 | 동일 tie-break 적용 → `(2,B)` 앞, `(2,A)` 뒤 |
| **5. 최종 상태** | `[H] → [i] → [?] → [!]` → `"Hi?!"` | `[H] → [i] → [?] → [!]` → `"Hi?!"` ✅ |

**수렴 확인**: 양쪽 모두 `"Hi?!"`. tie-break가 결정론적이므로 op 수신 순서와 무관하게 동일한 결과.

---

## 5. Presence / Awareness 설계

### 5-1. 메시지 구조

Presence는 영속되지 않으며 WebSocket 브로드캐스트로만 전파된다.

```typescript
// 클라이언트 → 서버 → 다른 클라이언트들
interface PresenceMessage {
  type:    'presence';
  pageId:  string;
  userId:  string;
  // 커서 위치: RGA 문자 id로 앵커링
  cursor: {
    anchorId: RgaId | null;  // 커서가 위치한 문자 id (null = 문서 끝)
    // selection이 있는 경우
    focusId?: RgaId | null;
  } | null;                  // null = 이 페이지에서 나감
  name:   string;
  color:  string;            // 서버에서 할당한 hex 색상
  avatarUrl?: string;
}
```

### 5-2. 커서를 문자 id로 앵커링하는 이유

인덱스 기반 커서(`offset: 3`)를 쓰면 다른 사용자가 앞쪽에 텍스트를 삽입했을 때 커서가 엉뚱한 문자를 가리킨다. RGA 문자 id로 앵커링하면 그 id를 가진 노드를 링크드 리스트에서 직접 찾으므로 다른 편집에 영향을 받지 않는다.

```typescript
// 커서 렌더링: anchorId → 현재 visible index 계산
function resolveAnchorToIndex(rga: RgaState, anchorId: RgaId | null): number {
  if (anchorId === null) return toText(rga).length;
  let index = 0;
  let cursor = rga.sentinel.next;
  while (cursor) {
    if (!cursor.deleted) {
      if (idEquals(cursor.id, anchorId)) return index;
      index++;
    }
    cursor = cursor.next;
  }
  return index; // fallback: 삭제된 앵커 → 마지막 위치
}
```

**삭제된 앵커 처리**: `anchorId`가 tombstone인 경우 해당 위치의 다음 visible 노드로 커서를 이동한다.

### 5-3. 편집 중 커서 위치 재계산

로컬 편집이 발생할 때마다 `contenteditable` 이벤트를 캡처해 현재 DOM 오프셋을 RGA id로 변환하고 새 PresenceMessage를 전송한다.

```typescript
// contenteditable 이벤트 핸들러
function onSelectionChange(rga: RgaState, domOffset: number): void {
  const anchorId = getVisibleNodeAt(rga, domOffset)?.id ?? null;
  broadcastPresence({ anchorId });
}
```

### 5-4. 페이지 레벨 presence ("이 페이지 보는 중")

```typescript
// 페이지 진입 시
sendPresence({ pageId, cursor: null, ... });  // cursor=null은 "보는 중"

// 편집 시작 시
sendPresence({ pageId, cursor: { anchorId }, ... });

// 페이지 이탈 / 연결 끊김 시
// 서버에서 ws 연결 종료를 감지해 해당 userId의 presence를 제거하고 브로드캐스트
```

### 5-5. 색상 및 아바타 할당

```typescript
const PRESENCE_COLORS = [
  '#E57373', '#64B5F6', '#81C784', '#FFD54F',
  '#BA68C8', '#4DB6AC', '#FF8A65', '#90A4AE',
];

// 서버: 페이지에 접속한 순서대로 색상 인덱스 할당
// 연결이 끊어지면 색상 슬롯 반환 → 재입장 시 재할당
function assignColor(pageConnections: Map<string, number>, userId: string): string {
  const usedSlots = new Set(pageConnections.values());
  const slot = PRESENCE_COLORS.findIndex((_, i) => !usedSlots.has(i));
  pageConnections.set(userId, slot);
  return PRESENCE_COLORS[slot % PRESENCE_COLORS.length];
}
```

---

## 6. 인과 버퍼링 · 멱등성 · 재접속 replay

### 6-1. 인과 버퍼링 (Causal Buffering)

op `X`의 `originId`가 아직 로컬에 없으면 `X`를 적용할 수 없다. `pendingBuffer`에 보관하고, 새 op가 적용될 때마다 버퍼를 재검사한다.

```typescript
function drainBuffer(rga: RgaState): void {
  let progress = true;
  while (progress) {
    progress = false;
    rga.pendingBuffer = rga.pendingBuffer.filter(op => {
      if (isCausallyReady(rga, op)) {
        applyOp(rga, op);
        progress = true;
        return false; // 버퍼에서 제거
      }
      return true;
    });
  }
}

function isCausallyReady(rga: RgaState, op: InsertOp): boolean {
  return op.originId === null || rga.nodeMap.has(idKey(op.originId));
}
```

### 6-2. 멱등성 (Idempotency)

같은 op를 여러 번 받아도 상태가 바뀌지 않는다.

- **Insert**: `nodeMap.has(idKey(op.id))` → 이미 있으면 즉시 return
- **Delete**: `node.deleted = true` → 이미 true면 결과 동일 (Boolean 덮어쓰기)

네트워크 재전송, 재접속 후 replay 모두 멱등성으로 안전하게 처리된다.

### 6-3. 재접속 Replay

```
클라이언트 연결 끊김 → 재접속
       │
       ▼
서버: 해당 pageId의 최신 Snapshot 조회
       │
       ├─ Snapshot 있음: { state, version } 전송
       │   클라이언트: state로 RGA 재구성 + version 이후 CrdtOp 재생
       │
       └─ Snapshot 없음: 전체 CrdtOp 로그 전송
           클라이언트: 처음부터 replay
```

```typescript
// 서버 → 클라이언트 재접속 페이로드
interface ReconnectPayload {
  type:      'reconnect';
  pageId:    string;
  snapshot?: { state: SerializedRga; version: number };
  ops:       CrdtOp[];  // snapshot version 이후 ops, 또는 전체 ops
}
```

**Snapshot 주기**: 1,000 op마다 또는 24시간마다 서버 사이드 작업으로 생성한다. 생성 후 이전 op는 아카이브(삭제 불가, 감사 목적)한다.

---

## 7. TDD 검증 속성 및 테스트 아이디어

> 전체 TDD 전략은 [09-tdd-strategy.md](./09-tdd-strategy.md)를 참고한다.

### 7-1. 검증해야 할 4가지 수학적 속성

| 속성 | 정의 | 위반 시 증상 |
|------|------|-------------|
| **수렴성 (Convergence)** | 같은 op 집합을 다른 순서로 적용해도 최종 상태가 동일 | 사용자마다 다른 텍스트를 보게 됨 |
| **멱등성 (Idempotency)** | 같은 op를 여러 번 적용해도 한 번 적용한 것과 동일 | 재전송 시 텍스트 중복 또는 추가 삭제 |
| **교환법칙 (Commutativity)** | op 적용 순서를 바꿔도 최종 상태 동일 | 네트워크 순서에 따라 결과가 달라짐 |
| **인과 버퍼링 (Causal Buffering)** | originId가 없는 op는 originId 도착 후 적용됨 | originId 없이 insert 시 링크드 리스트 오염 |

### 7-2. 테스트 아이디어

```
── 단위 테스트 (Vitest) ──────────────────────────────────────────

[수렴성]
- 두 사이트 A, B에서 같은 문자를 다른 위치에 삽입 후 op를 교차 적용
  → A 먼저 B op 적용 / B 먼저 A op 적용 → toText() 결과 동일 확인

[수렴성 — tie-break]
- 같은 originId에 두 insert op (counter 다름 / siteId 다름)
  → 모든 순열(2! = 2)에서 수렴 확인

[멱등성]
- insert op를 같은 rga에 2번, 3번 적용 → nodeMap 크기 불변, toText() 불변
- delete op를 이미 deleted=true 노드에 재적용 → 에러 없음, 상태 불변

[교환법칙]
- op_A, op_B가 독립적일 때 [A→B] vs [B→A] 결과 동일
- 3개 독립 op의 6가지 순열 모두 수렴 확인

[인과 버퍼링]
- originId가 없는 op를 먼저 도착시킨 후 originId op 도착
  → 버퍼에 쌓였다가 originId 도착 직후 자동 적용 확인
- 체인(A depends B, B depends C) 역순 도착 → 3단계 드레인 후 수렴

── Property-Based 테스트 (fast-check) ───────────────────────────

[수렴성 — 일반화]
- 임의 op 시퀀스를 생성해 두 replica에 임의 순서로 배분
- 모든 op가 양쪽에 도달한 후 toText() 동일 확인
- 1,000회 이상 반복

[멱등성 — 일반화]
- 임의 op를 1~5회 반복 적용, 1회 적용과 결과 동일 확인

── 통합 테스트 ──────────────────────────────────────────────────

[재접속 replay]
- 50개 op 적용 후 Snapshot 생성 → 새 RGA에 Snapshot + 이후 op replay
  → 원본과 toText() 동일

[presence 커서 유지]
- 사이트 B의 커서 anchorId 지정 → 사이트 A가 앞쪽에 삽입
  → B의 anchorId가 동일한 노드를 가리키는지 확인
  → resolveAnchorToIndex()가 +1 증가된 올바른 index 반환

[tombstone 커서]
- 커서가 앵커링된 문자를 삭제 → resolveAnchorToIndex() fallback 동작 확인
```

---

## 8. 모듈 경계 — `packages/crdt`

### 8-1. 설계 원칙

- **순수 TypeScript**: Node.js / 브라우저 / Vitest 환경 모두에서 동일하게 동작한다.
- **의존성 0**: `package.json`의 `dependencies` 키가 비어 있어야 한다. 외부 라이브러리 없음.
- **사이드이펙트 없음**: 네트워크·파일시스템·DOM 접근 금지. 순수 함수 + 불변 스냅샷 패턴.

### 8-2. 공개 API 시그니처

```typescript
// packages/crdt/src/index.ts

export { createRga }        from './rga';
export { applyOp }          from './apply';
export { localInsert }      from './local';
export { localDelete }      from './local';
export { toText }           from './materialize';
export { serializeRga }     from './snapshot';
export { deserializeRga }   from './snapshot';

export type {
  RgaId,
  RgaNode,
  RgaState,
  InsertOp,
  DeleteOp,
  RgaOp,
  SerializedRga,
} from './types';

// ── 함수 시그니처 요약 ───────────────────────────────────────
// createRga(siteId: string): RgaState
// applyOp(rga: RgaState, op: RgaOp): void           — 원격 op 적용 (인과버퍼 포함)
// localInsert(rga: RgaState, index: number, value: string): InsertOp
// localDelete(rga: RgaState, index: number): DeleteOp
// toText(rga: RgaState): string
// serializeRga(rga: RgaState): SerializedRga         — Snapshot 직렬화
// deserializeRga(data: SerializedRga): RgaState      — Snapshot 역직렬화
```

### 8-3. MVP → 확장 경로

```
[MVP] 2-level 블록 RGA
  └── 외부: 블록 리스트 RGA (블록 단위 요소)
  └── 내부: 블록별 인라인 텍스트 RGA
  └── 블록 타입: paragraph / heading1 / heading2 / heading3 / bullet list
  └── RgaNode<BlockNode> (외부) + RgaNode<string> (내부 인라인)

[v2] 인라인 서식 · 추가 블록 타입 확장
  └── 인라인 서식: bold / italic 등
  └── 추가 블록 타입: 이미지 / 코드 블록 등
  └── packages/crdt 인터페이스 변경 최소화 (generic V 파라미터 활용)
```
