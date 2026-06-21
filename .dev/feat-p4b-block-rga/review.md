# Review: P4b — 2-level 블록 RGA

- 브랜치: feat/p4b-block-rga (base: main)
- 리뷰 방식: spec → quality + security (오케스트레이터 직접, 서브에이전트 idle-fail 폴백)

## Step 0: Mechanical Gate
- `@ieum/crdt` typecheck: ✅ 0 errors / test: ✅ 51 passed (기존 32 무회귀 + 신규 19)
- `@ieum/web` typecheck: ✅ 0 errors / test: ✅ 64 passed (회귀 0 — @ieum/crdt 제네릭화 영향 없음)
- `next build`: verify 게이트(phase-complete)에서 fresh 실행
- **GATE PASS**

## Step 2: Spec Review (AC 충족 매트릭스)

| AC | 충족 | 근거 |
|----|------|------|
| AC-1 createDocument 빈 paragraph 1개 | ✅ | block.ts createDocument + block.test AC-1 |
| AC-2 docToBlocks 순서·텍스트 도출 | ✅ | block.ts docToBlocks/getVisibleNodes + AC-2 |
| AC-3 block-insert + 빈 내부 RGA | ✅ | applyDocOp 'block-insert' + AC-3 |
| AC-4 block-delete tombstone·멱등 | ✅ | applyDocOp 'block-delete' (applyOp 멱등) + AC-4 |
| AC-5 block-set-type LWW (clock) | ✅ | applyLww + AC-5 (순서 무관 heading2) |
| AC-6 동일 clock siteId tie-break | ✅ | applyLww `siteId >` + AC-6 (heading3) |
| AC-7 인라인 blockId 스코프 | ✅ | applyDocOp inline 라우팅 + AC-7 (b2 불변) |
| AC-8 splitBlock 커서 이후 이동 | ✅ | splitBlock + AC-8 (Hel/lo, op 시퀀스) |
| AC-9 split 원격 수렴 | ✅ | AC-9 (shuffle 적용 후 동일) |
| AC-10 mergeBlockWithPrev | ✅ | mergeBlockWithPrev + AC-10 (foobar) |
| AC-11 첫 블록 병합 null | ✅ | getPrevVisibleBlock null + AC-11 |
| AC-12 동시 분할 수렴 tie-break | ✅ | 외부 RGA 제네릭 정렬 + AC-12 (1@seed,2@B,2@A) |
| AC-13 인라인 선도착 인과버퍼 | ✅ | pendingInline + drainPending + AC-13 |
| AC-14 임의순서·중복 수렴(멱등·교환) | ✅ | AC-14 property 120회 (pendingInline/SetType=0, docToBlocks 동일) |
| AC-15 wire 봉투 왕복 | ✅ | wire.ts toWire/fromWire + wire.test 4건 |

[Must] 13/13 충족, [Should] 2/2 충족(FR-11 wire, FR-12 inheritType). Q1=A 반영(inheritType heading→paragraph).

### 설계 범위 이탈
- 이탈 없음. 변경 파일(rga.ts/op.ts/block.ts/wire.ts/index.ts + 2 테스트) 모두 design.md "변경 범위" 일치.
- op.ts에 `makeInlineInsertOp`/`makeInlineDeleteOp` 추가 — 설계 §7/§9에서 인라인 op 생성이 필요하므로 정당(범위 내).

### 판정: ✅ SPEC PASS

## Step 3: Quality Review (코드 품질)

### Critical (0건)
없음.

### Important (0건)
없음.

### Minor (3건, 메모만)
- M1: `applyDocOp`의 'insert'/'delete' 인라인 케이스와 `drainPending`이 라우팅 로직을 약간 중복. 4줄 규모라 추출 시 가독성 이득 미미 → 유지 판단.
- M2: `getPrevVisibleBlock`이 `getVisibleNodes` 후 `findIndex`로 O(n). MVP 블록 수 규모에서 무시 가능. P5 대량 문서 시 인덱스 캐시 고려.
- M3: `createRga<V>` sentinel `'' as unknown as V` 캐스트 1곳 — 주석으로 안전성 명시됨(deleted sentinel, value 미사용). 허용.

### 판정: ✅ QUALITY PASS (Critical 0 + Important 0, Minor만)

## Step 4: 통합 findings
- Spec: ✅ 15/15
- Quality: Critical 0, Important 0, Minor 3
- Security: trust-ledger.md 참조 (CRITICAL 0, HIGH 0, INFO 3)

### 결과 처리
- Critical/Important 0건 → RGR 재진입 불필요.
- Minor/INFO만 → phase-complete로 진행(클린 통과). INFO 항목은 trust-ledger에 P5 인계 사항으로 기록.
