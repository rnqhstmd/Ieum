phase: setup
status: in_progress
vcs-type: git
branch: feat/landing-design
base: main
dev-dir: .dev/feat-landing-design
project-type: [node, java-spring]
project-root: ./
args: "IEUM Landing.dc.html 디자인에 맞게 랜딩 페이지 검증/구현"
mode: implement
intent-source: user-selection
flags: ""
design-source: "claude.ai/design — IEUM Landing.dc.html (DesignSync MCP)"
phase: implement
phases:
  setup: completed
  implement: in_progress
  complete: pending
steps:
  implement:
    - 변형 선택: completed (A · 컨스텔레이션)
    - coder 구현: completed (page.tsx 재작성 + Constellation.tsx 신규, 빌드 3/3)
    - 자기점검: completed (qa-manager Critical 0, Playwright 1280px 디자인 일치)
    - 접근성 보완: in_progress (nav button·footer 링크·aria·memo)
execution-log:
  - phase: setup
    result: "main 깨끗화(이전 작업 feat/editor-ux-and-dev-login 분리 커밋 68f95a5), 랜딩 브랜치 생성, 디자인 토큰/Pretendard 기적용 확인"
