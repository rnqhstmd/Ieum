phase: complete
status: in_progress
mode: normal
intent-source: user-selection
vcs-type: git
branch: fix/crdt-optype-wire
base: main
project-type: java-spring
project-root: ./
args: "CRDT op_type V3 불일치 — Java OpType/CrdtOp/WsMessages를 wire 형식(소문자 5종)으로 정렬"
flags: (none)
started: 2026-07-02
last-known-head: 98011502ab2ac78661d1e99a918e3c72e43d47c0
auto-stashed: false
config-setup-attempts: 0
current-step: "review 통과(SPEC/QUALITY PASS, SEC MEDIUM3). 조치: AC-8 tools.jackson(Jackson3) 검증 테스트 추가. #1 Hibernate 래핑·#3 3자 가드는 인계 메모."
domain-context: context/collaboration
phases:
  setup: completed
  requirements: completed
  design: completed
  implement: completed
  review: completed
  complete: in_progress
execution-log:
  - phase: setup
    result: "조사: 불일치 latent(ws-relay만 소문자 write, Java save는 TODO). Java enum 2종 대문자 vs DB V3 5종 소문자. fix/crdt-optype-wire 브랜치 생성. Docker/Testcontainers 가용."
