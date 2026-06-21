# PRD: P4 CRDT 코어 — 인라인 문자 RGA (`@ieum/crdt`)

## 배경

Ieum의 실시간 공동편집은 외부 CRDT 라이브러리 없이 자체 RGA(Replicated Growable Array)로 구현한다(정책: 외부 의존성 0). `packages/crdt`는 순수 TypeScript 라이브러리로, 실시간 서버가 단순 relay 역할만 해도 모든 replica가 동일 상태로 수렴하도록 보장하는 **데이터 기반**이다.

현재 상태:
- `id.ts`(compareIds/idEquals/idKey), `types.ts`(전체 타입)는 구현 완료, `id.test.ts` 9개 통과.
- `rga.ts`의 모든 공개 함수와 내부 헬퍼는 `throw('not implemented — Phase 2 (TDD)')` 스텁.
- `tests/rga.test.ts`에 18개 `it.todo` RED 러너웨이가 시나리오 주석과 함께 설계되어 있음.

이 Phase는 인라인 문자 RGA 코어를 TDD(RED→GREEN→REFACTOR)로 완성한다. 최고 리스크: **R01 tie-break 비결정성(치명)**, **R02 인과버퍼 누락(치명)**. 정본 설계는 `requirements/07-collaboration-crdt.md`.

## 요구사항

### [Must]
- **FR-1** `createRga(siteId)`: sentinel 헤드를 가진 빈 RGA 상태를 생성한다.
- **FR-2** `localInsert(rga, index, value)`: 가시 텍스트 기준 index 위치에 문자를 삽입하고, 로컬 적용 후 전송용 InsertOp를 반환한다. counter는 localClock 증가로 할당한다(07 §3-1).
- **FR-3** `localDelete(rga, index)`: 가시 텍스트 기준 index 문자를 tombstone 처리하고 DeleteOp를 반환한다. 범위 밖이면 에러(07 §3-2).
- **FR-4** `applyOp(rga, op)`: 원격 op를 적용한다. insert는 tie-break 정렬 삽입, delete는 tombstone. **멱등성**(중복 op 무시), **인과 버퍼링**(originId 미도착 시 pendingBuffer 보관 후 드레인)을 보장한다(07 §3-3, §6-1, §6-2).
- **FR-5** tie-break 결정론: 같은 originId 형제 노드는 `compareIds`(counter DESC → siteId localeCompare DESC) 순서로 정렬되어, op 수신 순서와 무관하게 모든 replica가 동일 순서로 수렴한다(07 §3-4).
- **FR-6** `toText(rga)`: sentinel.next부터 순회하며 tombstone이 아닌 노드 value를 이어 붙여 반환한다(07 §3-5).
- **FR-7** `serializeRga`/`deserializeRga`: tombstone 포함 전체 노드를 링크드 리스트 순서대로 직렬화하고, 역직렬화 시 nodeMap·링크드 리스트를 재구성하여 왕복 후 동일 상태를 복원한다(07 §1, §6-3, MVP: GC 없음).

### [Should]
- **FR-8** 재접속 replay: deserialize한 상태에 snapshot version 이후 op를 추가 applyOp 해도 원본과 수렴한다(07 §6-3).
- **FR-9** `tests/rga.test.ts`의 18개 `it.todo`를 활성 테스트로 전환하고 전부 통과시킨다. 기존 `id.test.ts` 9개 회귀 없음.

### [Could]
- **FR-10** property-based 수렴/멱등 테스트(fast-check, 1,000회): 임의 op 시퀀스를 두 replica에 임의 순서 배분 후 toText 동일. 채택 시 `packages/crdt`에 fast-check를 devDependency로만 추가(런타임 dependencies 0 정책 유지).

## 수용 기준 (Given-When-Then)

### createRga
**AC-1: 빈 RGA 초기 상태**
- Given: 아무 상태도 없음
- When: `const rga = createRga('site-A')`
- Then: `rga.siteId === 'site-A'` 이고 `rga.localClock === 0` 이고 `rga.nodeMap.size === 0` 이고 `rga.sentinel.next === null` 이고 `rga.sentinel.deleted === true`

### localInsert / localDelete
**AC-2: 로컬 삽입이 텍스트에 반영되고 op를 반환한다**
- Given: `rga = createRga('A')`
- When: `const op = localInsert(rga, 0, 'a')`
- Then: `toText(rga) === 'a'` 이고 `op.type === 'insert'` 이고 `op.value === 'a'` 이고 `op.originId === null` 이고 `op.id.counter === 1` 이고 `op.id.siteId === 'A'`

**AC-3: 연속 로컬 삽입은 originId 체인과 counter 증가를 유지한다**
- Given: `rga = createRga('A')`
- When: `localInsert(rga,0,'a')` 후 `const op2 = localInsert(rga,1,'b')`
- Then: `toText(rga) === 'ab'` 이고 `op2.id.counter === 2` 이고 `op2.originId` 가 첫 노드 id `(1,A)` 와 idEquals

**AC-4: 로컬 삭제는 문자를 tombstone 처리하고 DeleteOp를 반환한다**
- Given: `rga`에 'a','b' 삽입되어 `toText === 'ab'`
- When: `const op = localDelete(rga, 0)`
- Then: `op.type === 'delete'` 이고 `op.targetId` 가 'a' 노드 id와 idEquals 이고 `toText(rga) === 'b'`

**AC-5: 범위를 벗어난 로컬 삭제는 에러를 던진다**
- Given: `rga`에 'a'만 삽입되어 `toText === 'a'`
- When: `localDelete(rga, 5)` 를 호출
- Then: 에러가 throw 된다 (index out of range)

### 수렴성 (Convergence)
**AC-6: 두 사이트가 다른 위치에 삽입 후 교차 적용하면 수렴한다**
- Given: 사이트 A의 `opA = {insert, id:(1,A), originId:null, 'a'}`, 사이트 B의 `opB = {insert, id:(1,B), originId:(1,A), 'b'}`
- When: replica1 = applyOp(opA)→applyOp(opB), replica2 = applyOp(opB)→applyOp(opA) (opB는 originId 미도착이면 버퍼링됨)
- Then: `toText(replica1) === toText(replica2)` 이고 결과 === `'ab'`

**AC-7: 같은 originId·counter 다른 두 insert는 높은 counter가 앞으로 수렴한다**
- Given: 같은 originId=(1,X)에 `id:(3,A)`와 `id:(2,B)` 두 insert op
- When: 두 순열 모두로 빈(또는 (1,X) 존재) replica에 applyOp
- Then: 두 순열 결과 toText 동일하며, counter 3 노드가 counter 2 노드보다 앞에 위치(compareIds 내림차순)

**AC-8: 같은 originId·counter 동일·siteId 다른 두 op는 siteId 역순으로 수렴한다 ("adcb")**
- Given: 07 §2-2 시나리오 — 문서 "ab"(노드 [a(1,A)]→[b(1,B)])에서 (1,A) 뒤에 A의 `{id:(2,A),'c'}`와 B의 `{id:(2,B),'d'}` 동시 삽입
- When: 두 replica에 서로 다른 순서로 두 op를 applyOp
- Then: 양쪽 모두 `toText() === 'adcb'` (counter 동일 → siteId "B">"A" → (2,B) 'd'가 앞)

**AC-9: 세 독립 op의 6가지 순열 모두에서 toText가 동일하다**
- Given: 서로 독립적인(또는 의존성이 순열로 충족 가능한) 세 insert op opA·opB·opC
- When: `permutations([opA,opB,opC])` 의 6개 순서 각각을 새 replica에 모두 applyOp
- Then: 6개 결과의 toText가 모두 동일

### 멱등성 (Idempotency)
**AC-10: 같은 insert op를 2·3회 적용해도 상태가 불변이다**
- Given: insert op 하나를 적용해 `toText === 'a'`, `nodeMap.size === 1`
- When: 같은 op를 추가로 1회(총 2회), 다시 1회(총 3회) applyOp
- Then: `nodeMap.size === 1` 불변이고 `toText() === 'a'` 불변

**AC-11: 이미 tombstone인 노드에 delete를 재적용해도 에러 없이 불변이다**
- Given: 'a' 노드를 delete 하여 `node.deleted === true`, `toText === ''`
- When: 같은 DeleteOp를 다시 applyOp
- Then: 에러 없음, `node.deleted === true` 유지, `toText() === ''` 불변

### 교환법칙 (Commutativity)
**AC-12: 독립적인 두 op는 적용 순서를 바꿔도 동일하게 수렴한다**
- Given: 독립적인 op opA, opB
- When: rga1 = applyOp(opA)→applyOp(opB), rga2 = applyOp(opB)→applyOp(opA)
- Then: `toText(rga1) === toText(rga2)`

**AC-13: 독립적인 delete와 insert는 순서 무관하게 수렴한다**
- Given: 'x' 노드를 삽입하는 insert op와, 그와 무관한 기존 노드를 삭제하는 delete op
- When: 두 순서 모두로 동일 초기 상태 복제본에 적용
- Then: 두 결과 toText 동일

**AC-14: 같은 노드를 삭제하는 두 delete op는 교환법칙을 만족한다**
- Given: 같은 targetId를 가리키는 동일 DeleteOp 두 개(두 replica에서 수신)
- When: 각 replica가 delete를 1회·2회 등 다른 횟수로 수신
- Then: 모든 replica의 `node.deleted === true`, toText 동일

### 인과 버퍼링 (Causal Buffering)
**AC-15: originId가 아직 없는 insert op는 pendingBuffer에 보관된다**
- Given: `rga = createRga('A')` (nodeMap에 (99,X) 없음)
- When: `applyOp(rga, {insert, id:(1,A), originId:(99,X), 'z'})`
- Then: `rga.pendingBuffer.length === 1` 이고 `toText(rga) === ''` (적용 안 됨)

**AC-16: originId op가 도착하면 버퍼의 op가 자동 적용된다 (drainBuffer)**
- Given: 의존 op `opB{id:(2,B), originId:(1,A), 'b'}` 가 먼저 도착해 버퍼링된 상태(pendingBuffer.length === 1)
- When: `opA{id:(1,A), originId:null, 'a'}` 를 applyOp
- Then: `rga.pendingBuffer.length === 0` 이고 `toText(rga) === 'ab'` (opB도 반영됨)

**AC-17: 3단계 의존성 체인을 역순으로 도착시켜도 수렴한다**
- Given: opC(originId=opB.id) → opB(originId=opA.id) → opA(originId=null) 의존 체인. 도착 순서: opC, opB, opA
- When: opC, opB 적용(둘 다 버퍼링) 후 opA를 applyOp
- Then: 드레인 결과 `pendingBuffer.length === 0` 이고 `toText(rga) === 'abc'`

### Snapshot 직렬화/역직렬화
**AC-18: serialize→deserialize 왕복 후 toText가 원본과 동일하다**
- Given: 다수(예: ~50) insert/delete op를 적용한 rga
- When: `deserializeRga(serializeRga(rga))`
- Then: 복원된 rga의 `toText()` 가 원본 `toText()` 와 동일

**AC-19: 직렬화 결과에 tombstone 노드가 포함된다 (MVP: GC 없음)**
- Given: insert 후 delete를 적용해 tombstone 노드가 1개 이상 존재
- When: `serializeRga(rga)`
- Then: 반환된 `nodes` 배열에 `deleted === true` 인 노드가 존재

**AC-20: 역직렬화 후 재접속 replay로 수렴한다**
- Given: snapshot에서 deserialize한 rga와, snapshot version 이후 추가 op 목록
- When: 추가 op들을 deserialize한 rga에 applyOp
- Then: 처음부터 모든 op를 적용한 원본 rga와 `toText()` 동일

### 회귀
**AC-21: 기존 id 테스트가 회귀하지 않는다**
- Given: 본 구현 적용 후 `packages/crdt`
- When: `pnpm --filter @ieum/crdt test` (또는 vitest run) 실행
- Then: `id.test.ts` 9개 통과 유지, `rga.test.ts` 18개 전부 통과(todo 0), `tsc --noEmit` 0 에러

## Out-of-scope (이번 Phase 제외 — 후속)
- 2-level 블록 RGA: block-insert/block-delete/block-set-type(LWW), splitBlock/mergeBlock (후속 P4b)
- `op.ts`의 make* 생성기 localClock 자동 연동
- presence 커서 앵커링(resolveAnchorToIndex) — P6
- WebSocket relay, CrdtOp 영속화, 서버 사이드 Snapshot 생성 — P5
- tombstone GC — post-MVP

## 확인이 필요한 사항
추가 확인 사항 없음. PRD가 확정되었습니다.
