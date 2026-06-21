## 코드 맵: P4 CRDT 코어 — 인라인 RGA

### 핵심 파일
- packages/crdt/src/rga.ts:43-162 → 인라인 RGA 핵심. applyOp/localInsert/localDelete/toText/serializeRga/deserializeRga + 내부헬퍼(getVisibleNodeAt/isCausallyReady/drainBuffer/insertNode/findNodeById) — **전부 throw('not implemented — Phase 2 (TDD)')**. 이번 구현 대상.
- packages/crdt/src/types.ts → RgaId/RgaNode/InsertOp/DeleteOp/RgaOp/RgaState/SerializedRga(+2-level 블록 타입) 정의 (완료)
- packages/crdt/src/id.ts → compareIds(tie-break: counter DESC → siteId localeCompare DESC)/idEquals/idKey (완료)
- packages/crdt/tests/rga.test.ts → 18개 it.todo RED 러너웨이 (수렴4/멱등3/교환3/인과버퍼3/Snapshot3/createRga2). RED 단계에서 활성 테스트로 전환.

### 참조 파일
- packages/crdt/src/op.ts → op 타입가드(완료) + make* 생성기(스텁, localClock 미연동 — 이번 범위 밖)
- packages/crdt/tests/id.test.ts → id 비교 9 테스트 (통과)
- packages/crdt/src/index.ts → 공개 API 재export
- requirements/07-collaboration-crdt.md → CRDT 설계 정본. §3-1 localInsert, §3-2 localDelete, §3-3 applyRemote, §3-4 insertNode/compareIds, §3-5 toText, §6-1 drainBuffer/isCausallyReady, §6-3 재접속 replay
- requirements/03-mvp-and-roadmap.md → R01(tie-break 비결정), R02(인과버퍼 누락) 치명 리스크
- context/collaboration/status.md → US-CRDT-01/03 AC, TDD 4속성(수렴/멱등/교환/인과버퍼) — P4 매핑

### 설정
- packages/crdt/package.json → scripts: vitest run / tsc --noEmit. type=module(.js 확장자 import 강제). dependencies 0 (정책: 외부 의존성 금지). fast-check **미설치** — property-based 원하면 devDep 추가 필요.
- packages/crdt/tsconfig.json → extends ../../tsconfig.base.json, lib ES2022, include src+tests
- 정책(07 §8): 순수 TS, 의존성 0, 사이드이펙트 없음(네트워크/FS/DOM 금지)

### 범위 메모
- 이번 슬라이스 = **인라인 문자 RGA 코어** (single-level RgaOp). rga.test.ts 18 러너웨이와 1:1.
- 범위 밖(후속 P4b): 2-level 블록 RGA(block-insert/delete/set-type, splitBlock/mergeBlock), op.ts make* localClock 연동, presence anchor(P6).
