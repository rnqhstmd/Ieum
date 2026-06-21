# 설계: P4 CRDT 코어 — 인라인 문자 RGA

> 정본: `requirements/07-collaboration-crdt.md`. 본 설계는 정본 의사코드를 구현 가능한 형태로 구체화하고, 정본 의사코드의 미묘한 오류를 교정한다.

## 설계 규모
**중형** — 단일 파일(`rga.ts`) 구현이지만 수렴 정확성(R01/R02 치명 리스크)이 걸려 알고리즘 결정이 다수. design-critic 검토 대상.

## 변경 범위 (파일)
| 파일 | 구분 | 내용 |
|------|------|------|
| `packages/crdt/src/rga.ts` | 수정 | 7개 공개 함수 + 5개 내부 헬퍼 구현 (현재 전부 throw) |
| `packages/crdt/tests/rga.test.ts` | 수정 | 18개 `it.todo` → 활성 `it` 전환 + 단정 작성 (RED) |
| `packages/crdt/package.json` | 수정(조건부) | [Could] property-based 채택 시 `fast-check` devDependency 추가 |
| `packages/crdt/tests/rga.property.test.ts` | 신규(조건부) | [Could] property-based 수렴/멱등 |

`types.ts`/`id.ts`/`op.ts`/`index.ts`는 **수정하지 않는다** (타입·compareIds 완료, 공개 API 시그니처 고정).

## 자료구조 (types.ts 고정)
- `RgaState`: `{ siteId, localClock, nodeMap: Map<string,RgaNode>, sentinel: RgaNode, pendingBuffer: InsertOp[] }`
- 이중 표현: **링크드 리스트**(sentinel → next → … : 문서 순서) + **nodeMap**(`idKey` → 노드: O(1) 조회).
- `pendingBuffer`는 타입상 `InsertOp[]` — **insert만 버퍼링**(인과버퍼는 originId 미도착 insert 대상). delete 버퍼링은 범위 밖(아래 결정 D3).

## 핵심 알고리즘 결정

### D1. localInsert — head 위치 originId는 null (정본 §3-1 교정)
정본 `getVisibleNodeAt(rga, index-1)`는 index 0에서 "-1 → sentinel" 반환을 시사하나, 그러면 `originId = sentinel.id = {0,''}`가 되어 `isCausallyReady`가 `nodeMap.has('0@')===false`로 판정 → **로컬 삽입이 영구 버퍼링되는 버그**.
- 교정: `getVisibleNodeAt(rga, i)`는 0-based 가시 인덱스의 노드 또는 범위 밖이면 `null` 반환.
- `localInsert(rga, index, value)`:
  1. `predecessor = index === 0 ? null : getVisibleNodeAt(rga, index - 1)`
  2. `op = { type:'insert', id:{counter: ++rga.localClock, siteId: rga.siteId}, originId: predecessor?.id ?? null, value }`
  3. `applyOp(rga, op)` 후 `return op`
- 즉 **head 삽입은 originId=null** (sentinel.id 누수 금지). (AC-2)

### D2. insertNode — 형제 비교는 idEquals + null-safe (정본 §3-4 교정)
정본 `cursor.originId === newNode.originId`는 RgaId 객체 참조 비교라 항상 false가 될 수 있음. 교정:
- `insertAfter = findNodeById(rga, newNode.originId)` (originId=null → sentinel)
- `cursor = insertAfter.next`
- `while (cursor && sameOrigin(cursor.originId, newNode.originId) && compareIds(cursor.id, newNode.id) < 0) { insertAfter = cursor; cursor = cursor.next }`
  - `sameOrigin(a,b)` = `(a===null && b===null) || (a!==null && b!==null && idEquals(a,b))`
  - `compareIds(cursor.id, newNode.id) < 0` ⇒ cursor가 newNode보다 앞에 정렬되어야 함 → 지나친다 (07 §3-4: counter DESC → siteId DESC).
- `newNode.next = insertAfter.next; insertAfter.next = newNode; nodeMap.set(idKey(newNode.id), newNode)`
- tie-break 결과: 같은 originId 형제 중 `compareIds` 우선(높은 counter, 같으면 큰 siteId)이 앞. (AC-7, AC-8 "adcb")

### D3. applyOp — 멱등 + 인과버퍼 + 드레인 (정본 §3-3, §6-1)
```
applyOp(rga, op):
  if op.type === 'delete':
    node = nodeMap.get(idKey(op.targetId))
    if node: node.deleted = true        # 멱등: 이미 true여도 동일 (AC-11, AC-14)
    # node 없음 = target 미도착. MVP는 relay 인과전달 가정 → no-op (결정 근거 아래)
    return
  # insert
  if nodeMap.has(idKey(op.id)): return   # 멱등 (AC-10)
  if op.originId !== null && !nodeMap.has(idKey(op.originId)):
    rga.pendingBuffer.push(op); return    # 인과버퍼 (AC-15)
  insertNode(rga, {id:op.id, originId:op.originId, value:op.value, deleted:false})
  drainBuffer(rga)                         # 방금 삽입이 버퍼 op를 풀 수 있음 (AC-16, AC-17)
```
- **delete 인과 버퍼링(D3a, 구현 중 RED 테스트로 교정)**: 초안은 "target 미도착 delete = no-op(relay 인과전달 가정)"이었으나, property 테스트(임의 도착순서 수렴)가 이 가정의 결함을 노출 — delete가 드롭되면 나중 도착한 target insert가 영구히 보여 교환법칙 위반(`'cedfh'≠'cedfha'`). **교정**: `RgaState`에 `pendingDeletes: Set<string>`(idKey) 추가. target 미도착 delete는 보류 집합에 담고, `insertNode`가 노드 삽입 시 해당 키가 보류 집합에 있으면 즉시 `deleted=true`. 이로써 delete도 완전한 인과 버퍼링 → 임의 재배열에서도 수렴(commutativity 보장). relay 가정 제거. (types.ts에 필드 1개 추가 — 자기제약을 정확성 우선으로 완화)

### D4. drainBuffer — 진행 루프 (정본 §6-1)
```
drainBuffer(rga):
  progress = true
  while progress:
    progress = false
    rga.pendingBuffer = rga.pendingBuffer.filter(op =>
      isCausallyReady(rga, op)
        ? (insertReady(rga, op), progress = true, false)   # 적용 후 버퍼서 제거
        : true)
isCausallyReady(rga, op) = op.originId === null || nodeMap.has(idKey(op.originId))
insertReady(rga, op):   # 버퍼 경로 전용 — 재버퍼 방지
  if nodeMap.has(idKey(op.id)): return    # 멱등
  insertNode(rga, {...op, deleted:false})
```
- 체인 역순(C→B→A 도착)도 A 적용 → drain이 B 풀고 progress=true → 재루프가 C 풀어 수렴. (AC-17)

### D5. toText (정본 §3-5)
sentinel.next부터 순회, `!deleted`면 value 수집, join. (AC-6 등 모든 수렴 단정의 기준)

### D6. serialize / deserialize (정본 §1, §6-3)
- `serializeRga`: sentinel.next부터 순회하며 `{id, originId, value, deleted}` 배열(tombstone 포함) + `{siteId, localClock}` 반환. (AC-18, AC-19)
- `deserializeRga`: `createRga(data.siteId)` → localClock 복원 → `data.nodes`를 **배열 순서대로** 링크드 리스트에 직접 연결(이미 수렴 순서이므로 insertNode 재정렬 불필요) + nodeMap 채움. (AC-18)
- 재접속 replay: deserialize 후 추가 op는 applyOp로 적용 → 멱등성으로 중복 안전, 수렴. (AC-20)

### D7. findNodeById / getVisibleNodeAt
- `findNodeById(rga, id)`: `id===null` → sentinel. else `nodeMap.get(idKey(id)) ?? sentinel`.
- `getVisibleNodeAt(rga, i)`: sentinel.next부터 visible(`!deleted`) 노드를 0부터 카운트, i번째 반환. 범위 밖 → null. (localInsert/localDelete가 사용)
- `localDelete(rga, index)`: `t = getVisibleNodeAt(rga, index)`; `if (!t) throw RangeError`; `op={type:'delete', targetId:t.id}`; `applyOp`; return op. (AC-4, AC-5)

## 구현 순서 (RGR 태스크 분해)
정본 의존 순서대로 RED→GREEN→REFACTOR. 각 태스크는 해당 AC의 it.todo를 활성화하여 RED를 만든다.

| T | 태스크 | 함수 | AC | 비고 |
|---|--------|------|-----|------|
| T1 | createRga + toText | createRga, toText, (getVisibleNodeAt) | AC-1 | 기반. createRga는 구현됨 → toText로 GREEN |
| T2 | applyOp insert 기본 + findNodeById/insertNode | applyOp(insert), findNodeById, insertNode | AC-6(부분) | 단일 origin 삽입 |
| T3 | localInsert/localDelete | localInsert, localDelete, getVisibleNodeAt | AC-2,3,4,5 | D1 교정 적용 |
| T4 | tie-break 수렴 | insertNode 형제 정렬 | AC-7,8,9 | D2 교정. "adcb" |
| T5 | 멱등성 | applyOp 멱등 분기 | AC-10,11,14 | |
| T6 | 교환법칙 | (T2~T5 조합 검증) | AC-12,13 | 신규 코드 거의 없음, 테스트 위주 |
| T7 | 인과버퍼 + drain | applyOp 버퍼 분기, drainBuffer, isCausallyReady | AC-15,16,17 | R02 방어 |
| T8 | Snapshot | serializeRga, deserializeRga | AC-18,19,20 | |
| T9 | 회귀 + (조건부)property | 전체 vitest + tsc | AC-21, FR-10 | id.test 회귀 확인 |

## 준수 규격 / 정책
- 07 §8: 순수 TS, 런타임 dependencies 0, 사이드이펙트(네트워크/FS/DOM) 0. → fast-check는 devDependency로만.
- type=module: 모든 상대 import는 `.js` 확장자 (`./id.js`, `./types.js`).

## Out-of-scope
2-level 블록 RGA, op.ts make* 연동, presence 앵커, ws relay, GC (PRD와 동일).

---

## Testability 평가 (test-architect)

### 컴포넌트별 테스트 전략

#### rga.ts 공개 함수 (createRga/localInsert/localDelete/applyOp/toText/serialize/deserialize)
- 단위 테스트: 전부 순수 함수. `createRga`로 상태 생성 → 함수 호출 → `toText`/상태 필드(`nodeMap.size`, `pendingBuffer.length`)로 단정.
- 통합 테스트: 두 replica(`createRga('A')`, `createRga('B')`)에 op를 교차/순열 적용 후 `toText` 동일성 비교 — 수렴/교환/멱등.
- 모의 대상: **없음**. I/O·시간·랜덤 의존 0.
- 격리 전략: 불필요. 각 테스트가 독립 RgaState 인스턴스 생성(공유 전역 없음). 입력 op는 리터럴로 구성.
- AC 매핑: AC-1~21 전부.

#### tie-break / insertNode (수렴 정확성)
- 단위: 같은 originId에 counter/siteId 조합 op를 **모든 순열**로 적용 → 동일 toText (결정론 검증). "adcb"·"Hi?!" 정본 시나리오 재현.
- 강화: [Could] fast-check로 임의 op 시퀀스 1,000회 — 두 replica 임의 순서 배분 후 수렴.
- AC 매핑: AC-7,8,9.

#### drainBuffer / 인과버퍼
- 단위: originId 미도착 op → `pendingBuffer.length===1` 확인 → originId op 적용 → `length===0` + toText 반영. 3단계 체인 역순.
- AC 매핑: AC-15,16,17.

### Testability Score: 10/10
순수 함수형 라이브러리. 외부 의존성·전역 상태·static·시간·랜덤 0. 모든 동작이 입력 op → `toText`/상태 필드로 결정론적 검증 가능. property-based 테스트에 이상적. RGR 격리 완벽.

### 판정
≥ 7 → ✅ **TESTABILITY PASS** (10/10)

---

## design-critic 요약
- [CHALLENGE→해소] 정본 §3-1 sentinel originId 누수 / §3-4 형제 `===` 객체비교 → D1/D2에서 교정 명시.
- [RESOLVED] delete missing-target — 초안의 no-op 가정을 property 테스트가 반증 → delete 인과 버퍼링(pendingDeletes)으로 교정. 잔여 ASSUMPTION 없음.
- [SIMPLIFY] deserialize는 배열이 이미 수렴 순서이므로 insertNode 재정렬 없이 순차 연결 — 복잡도·재정렬 버그 회피(D6).
- 근본 문제 없음. testability 10/10.
