# PR Context — P11 버킷 마감 (키보드 탐색 + 초기 로드 측정)

## Background
이음의 MVP 로드맵(P1~P11)에서 page 도메인의 마지막 미완료 2건이 남아 있었다. 블록 에디터(`Editor.tsx`)는 Enter(분할)·Backspace(병합) 구조편집만 지원하고 **화살표 키로 블록 경계를 넘어 인접 블록으로 포커스를 이동하는 접근성 기능이 없어** 마우스 없이 편집이 불가능했다. 또 페이지 진입 시 본문이 **2초 내 표시되는지 측정하는 e2e(FR-C4)**가 없었다. 이 PR로 두 항목을 닫아 MVP 로드맵을 완결한다.

## Requirements (요약)
- **[Must]** 화살표 키 + caret 경계(offset 0 또는 text.length)에서 인접 블록으로 포커스 이동(Up/Left→이전 끝, Down/Right→다음 처음). 중간 caret·첫/마지막 경계·IME 조합 중에는 미이동, 이동 시에만 preventDefault. (FR-1~8)
- **[Must]** 키보드 탐색은 로컬 DOM 포커스만 — CRDT op·네트워크 전송 없음(BR-1). 기존 `getCaretOffset` 재사용(BR-2).
- **[Must]** 초기 로드 <2000ms 측정 e2e(`load-time.e2e.ts`) 추가, 수동 구동 전용(BR-4). (FR-C4)
- **[Should]** 빈 블록은 키 방향 우선(BR-5).

## 범위 결정
- 변경 대상 **apps/web만**(백엔드·ws-relay·@ieum/crdt 무변경).
- 방향 판정을 순수 함수 `resolveArrowDirection`(named export)로 분리 → jsdom 레이아웃 부재를 우회해 경계 로직을 DOM 없이 결정적 검증(testability 9/10).
- FR-C4 e2e는 전체 스택 기동이 필요해 **자동 verify 게이트 비대상**(restore/convergence e2e 선례와 동일).
- **base = `feat/p11-crdt-restore-structural-e2e`(PR #27) 위 스택** — e2e 인프라·Editor 구조편집 핸들러 재사용. PR #27 머지 후 이 PR 머지 권장.

## Audit Summary
- 총 6건 (CRITICAL: 0 · HIGH: 0 · MEDIUM: 3 · LOW: 1) + quality Important 2(해소) · Minor 3.
- selectionchange 간접 onCursorMove(BR-1 해석) → **수용**: 커서가 실제 이동한 것을 반영하는 P6 정상 동작, 의도 주석 추가.
- idKey selector 보간 인젝션 → **비위험 종결**: siteId=crypto.randomUUID(hex+하이픈)·counter=정수, 메타문자 불가 + 기존 P6 선례(L273).
- getCaretOffset nodeType 가드 추가 → el.contains 유지로 P6 cross-block 안전성 보존(정보).
- e2e 인증 미준비 시 timeout 오독 → README 노트 추가(LOW).
- quality Important 2(화살표 키 DRY·셀렉터 중복) → blockSelector 헬퍼 추출로 해소.
- 상세: `.dev/feat-p11-keyboard-nav-load/trust-ledger.md`.

## 검증
- verify 게이트 PASS(신선): `pnpm test`(turbo 5 tasks: @ieum/crdt + ws-relay + web vitest 207 pass, arrowNav 21 신규) + `pnpm build`(turbo 3 tasks, web next build) + typecheck 0.
- Spec PASS([Must] 11/11) · Quality PASS(Critical/Important 0 잔여) · 인수 ACCEPT.
