# Review — P4 CRDT 코어 (인라인 RGA)

## Step 2: spec-reviewer (AC 충족)

### AC 충족 매트릭스
| AC | 충족 | 근거 (테스트 / 구현) |
|----|------|----------------------|
| AC-1 createRga 초기상태 | ✅ | createRga 2 테스트 / `rga.ts createRga` |
| AC-2 localInsert head originId=null | ✅ | localInsert head 테스트 / D1 교정 적용 |
| AC-3 연속/중간 삽입 체인 | ✅ | 2 테스트 / `localInsert`+`getVisibleNodeAt` |
| AC-4 localDelete tombstone | ✅ | localDelete 테스트 / `localDelete` |
| AC-5 범위초과 throw | ✅ | toThrow 테스트 / `RangeError` |
| AC-6 두 사이트 교차 수렴 | ✅ | 수렴 테스트 / applyOp+drain |
| AC-7 counter tie-break "xHL" | ✅ | 순열 테스트 / insertNode+compareIds |
| AC-8 siteId tie-break "adcb" | ✅ | "adcb" 테스트 / insertNode 서브트리 |
| AC-9 3-op 6순열 + 일반화 | ✅ | permutation 'abc' + property 300회 |
| AC-10 insert 멱등 | ✅ | 2·3회 적용 테스트 / nodeMap.has 가드 |
| AC-11 delete 재적용 멱등 | ✅ | 테스트 / deleted 덮어쓰기 |
| AC-12 교환법칙 "ba" | ✅ | 테스트 |
| AC-13 insert+delete 독립 "x" | ✅ | 테스트 (delete 버퍼링으로 양 순서 수렴) |
| AC-14 동일 delete 다중 replica | ✅ | 테스트 |
| AC-15 pendingBuffer 보관 | ✅ | length 1 테스트 / 인과 준비성 분기 |
| AC-16 drainBuffer 자동적용 | ✅ | 테스트 / drainBuffer |
| AC-17 3단계 체인 역순 | ✅ | 테스트 / progress 루프 |
| AC-18 serialize 왕복 | ✅ | 테스트 / serialize+deserialize |
| AC-19 tombstone 포함 직렬화 | ✅ | 테스트 |
| AC-20 재접속 replay | ✅ | 테스트 (snapshot@10 + replay) |
| AC-21 회귀 + tsc 0 | ✅ | id 9 + rga 23 통과, tsc 0, build 0 |

[Must] FR-1~7 전부 충족, [Should] FR-8(AC-20)·FR-9(18 todo 활성화+property) 충족, [Could] FR-10 부분(아래).

### 설계 범위 이탈
- `types.ts`에 `RgaState.pendingDeletes: Set<string>` 1개 필드 추가 — 설계 초안의 "types.ts 미수정" 자기제약을 벗어남. **그러나** property 테스트가 노출한 수렴 결함(교환법칙 위반)을 교정하기 위한 TDD-driven 정합 변경으로, CRDT 정확성 범위 내. design.md D3에 반영 완료. → 정당한 이탈.
- [Could] FR-10: fast-check 미도입. 대신 시드 PRNG(mulberry32) 기반 결정론적 property 테스트(300 trial, 임의 도착순서 수렴)로 대체 — [Could] 의도(수렴 일반화 검증) 충족하면서 의존성 0 정책 유지. 의존성 추가 회피한 의도적 결정.

### 판정: ✅ SPEC PASS (21/21 AC 충족)

---

## Step 3 Task A: quality-reviewer (코드 품질)

### Critical (0건)
없음. 무한 루프 없음(drainBuffer progress 플래그·버퍼 단조 감소로 종료, endOfSubtree·insertNode walk는 비순환 리스트 길이로 유계), null 역참조 없음(sentinel 상존, nodeMap.get 가드).

### Important (0건)
없음.

### Minor (3건 — 메모)
- `rga.ts`: insertNode O(n)·getVisibleNodeAt O(n)·drainBuffer 최악 O(b²·n). MVP 문서 규모에서 수용(07 §1: 성능/GC는 post-MVP). 후속 인덱스/캐시 최적화 여지.
- 함수 시그니처가 `RgaState`(기본 string) 고정. 2-level 블록 RGA(V=BlockMeta)는 후속에서 제네릭화 필요(현 인라인 범위 적정).
- `serializeRga`/`deserializeRga`는 transient(pendingBuffer/pendingDeletes) 미직렬화 — 07 §6-3 모델(스냅샷=적용상태, op replay로 transient 재구성)대로의 의도된 동작. AC-20로 검증됨.

### 판정: ✅ QUALITY PASS (Critical 0, Important 0, Minor만)

---

## Step 3 Task B: security-auditor
→ `trust-ledger.md` 참조. CRITICAL 0 · HIGH 0 · MEDIUM 1 · LOW 1 · INFO 2. 차단 없음.

---

## 종합 판정
- Spec ✅ PASS (21/21) · Quality ✅ PASS · Security 차단 0
- 특이성과: property 테스트가 R01(수렴) 결함을 RED에서 포착 → delete 인과 버퍼링으로 GREEN 교정. 정본 의사코드 2건(sentinel originId, 형제 === 비교) 사전 교정.
- 결론: **클린 통과 → phase-complete 진행** (Critical/Important 없음).
