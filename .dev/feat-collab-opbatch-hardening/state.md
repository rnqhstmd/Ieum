phase: complete
status: in_progress
current-step: "인수 ACCEPT → commit/PR"
acceptance: "ACCEPT — [Must] 13/13(AC-1~13) + [Should] FR-9·BR-4. 핵심가치 3종 검증."
verify: "PASS(신선) — pnpm test 5 tasks(web 207+ws-relay 112+crdt) + pnpm build 3 tasks. 0 fail."
review-result: "spec PASS(13/13) · quality PASS(Critical/Important 동작결함 0) · security CRITICAL 0·HIGH 2·MEDIUM 5(결함 아님, 하드닝 갭). 핵심수정+문서화: RGR(retry isRetrying 스팸가드+authError 배너억제) + refactor(console.warn 복원·retryRestore 주석·AC-6 리스너 선등록·STALE_GRACE_MS 상수·dead var). 나머지 MEDIUM(transport OPEN 이중join·pageId 빈문자·순서역전) 수용·문서화. relay 112+web 207, tsc 0."
  T2 (web수신 AC-7,8): "RED ok(2 fail: AC-7a 파싱·AC-8a 라우팅) / GREEN ok(protocol 30+relayClient 20, web 198, typecheck 0; OpBatchErrorMsg 파싱+onOpBatchError 라우팅) / REFACTOR skip(4줄 스타일일치)"
rgr-cycles:
  T1 (relay AC-1~6): "RED ok(2 fail: AC-1 op-batch-error 타임아웃·AC-5 epoch stale) / GREEN ok(server.test 29, ws-relay 112, protocol OpBatchErrorMsg+server epoch/sendIfCurrent/분기) / REFACTOR skip(대상 없음)"
vcs-type: git
branch: feat/collab-opbatch-hardening
base: feat/ws-auth-identity
project-type: java-spring, node
project-root: ./
args: "협업 하드닝 슬라이스1 — op-batch 견고화: loadByPage 실패 UX(op-batch-error) + W2 op-batch join-epoch 견고화"
flags: (none)
mode: normal
intent-source: user-selection
started: 2026-06-24
last-known-head: 479c11e3d05da3f86ce9cd84e863074a25dd0618
config-setup-attempts: 0
auto-stashed: false
notes: "base=feat/ws-auth-identity(#28, 미머지) 위 스택. server.ts·useCrdtDocument·realtime이 #28과 겹쳐 스택 선택. 머지 순서: #28 머지 후 이 PR. (#27은 main, #30 키보드탐색은 별도 미머지.) 슬라이스 범위: op-batch 견고화만 — Snapshot+delta·splitBlock 원자성·e2e CI·FR-B6 커서는 후속."
phases:
  setup: completed
  requirements: completed
  design: completed
  implement: completed
  review: completed
  complete: in_progress
rgr-T3: "RED ok(5 fail: AC-9/10/11/12/13) / GREEN ok(web 204, typecheck 0; useCrdtDocument restoreError+retryRestore(fetchAuth 경유)+onOpBatchError, EditorContainer restore-error 배너) / REFACTOR skip(authError 미러링)"
implement-result: "ws-relay 112(server.test 29 신규 6) + web 204(신규 op-batch-error 파싱·라우팅·restoreError·retryRestore·배너) + typecheck 0. 6 소스 + 4 테스트 변경."
  review: pending
  complete: pending
execution-log:
  - phase: setup
    result: "브랜치 feat/collab-opbatch-hardening 생성(off feat/ws-auth-identity 479c11e). op-batch 경로: server.ts:149-157 loadByPage 실패→빈배치 무음 + epoch 미부착. relayClient onOpBatch / useCrdtDocument onOpBatch 확인."
