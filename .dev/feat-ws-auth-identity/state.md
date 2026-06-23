phase: implement
status: in_progress
vcs-type: git
branch: feat/ws-auth-identity
base: main
project-type: java-spring, node
project-root: ./
args: "WS-AUTH-01(신원위조 방지) 구현시작 — relay가 클라 주장 userId 미신뢰, 서명/세션 검증"
flags: (none)
mode: normal
intent-source: user-selection
started: 2026-06-23
last-known-head: cd1661e1f5f92808860d6b0d54c7e4b7e08d0760
config-setup-attempts: 0
auto-stashed: false
current-step: "implement 완료, 변경사항 수집 → review"
decisions: "HMAC-SHA256 토큰 / join token 필드 / GET /api/users/me 확장 / AUTH_SECRET 미설정 시 경고+trust-relay / TTL 5분 / 비대칭배포=배포순서 / skew leeway 없음 / fetchCurrentUserId 교체"
golden-vector: "SECRET=test-secret-key-32-bytes-long!! USERID=11111111-1111-1111-1111-111111111111 EXP=1700000300 TOKEN=eyJ1c2VySWQiOiIxMTExMTExMS0xMTExLTExMTEtMTExMS0xMTExMTExMTExMTEiLCJleHAiOjE3MDAwMDAzMDB9.sdCpy_TTmL271ycglxyEpQmvxuMVgKSthO61r7UWRBs"
phases:
  setup: completed
  requirements: completed
  design: completed
  implement: in_progress
rgr-cycles:
  C1 (backend 토큰발급 T1/T3/T4): "RED ok / GREEN ok(WsTokenService 3+UserMe 4, 골든벡터 일치, BUILD SUCCESSFUL) / REFACTOR skip(신규)"
  C2 (relay 검증+게이트 T2/T5/T6/T7): "RED ok(5 fail) / GREEN ok(wsToken 9+server 19, 골든벡터 일치, 92 pass, main.ts authSecret 배선) / REFACTOR skip"
  C3 (web 토큰흐름 T8/T9/T10/T11): "RED ok(9 fail) / GREEN ok(currentUser 5+useCrdtDocument 9+EditorContainer 3, web 152 pass, typecheck 0; relayClient.test ready 팩토리 시그니처 정합 갱신) / REFACTOR skip"
implement-result: "backend(WsTokenService 3+UserMe 4) + ws-relay 92(wsToken 9+server 19 신규) + web 152(신규 17) + 골든벡터 양측 일치. typecheck 0."
  design: pending
  implement: pending
  review: pending
  complete: pending
notes: "base=main (P11 PR #27 미머지). server.ts join 핸들러가 P11(op-batch)과 같은 영역 — 머지 시 정합 필요. context/ 문서는 main 버전(P11 갱신은 PR #27에 있음)."
execution-log:
  - phase: setup
    result: "브랜치 feat/ws-auth-identity 생성(off main). 현재 trust-relay: relay가 join의 joinMsg.userId를 클라 주장대로 신뢰(MembershipStore는 멤버십만 검증, userId 진위 미검증)."
