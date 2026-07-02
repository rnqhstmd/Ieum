phase: complete
status: in_progress
vcs-type: git
branch: feat/settings-help-pages
base: main
project-type: [node, java-spring]
project-root: ./
args: "AccountMenu 설정·도움말 페이지 구현 및 배선 — /settings·/help 신규 + AccountMenu 네비게이션 연결"
mode: normal
intent-source: user-selection
flags: ""
started: 2026-07-02
config-setup-attempts: 0
phases:
  setup: completed
  requirements: completed
  design: completed
  implement: completed
testability: 9/10 PASS
  review: completed
  complete: in_progress
execution-log:
  - phase: setup
    result: "브랜치 feat/settings-help-pages(off main). AccountArea handleSettings/handleHelp no-op 스텁 배선 대상, AccountMenu onSettings/onHelp props. 신규 /settings·/help 페이지 (app) 그룹."
