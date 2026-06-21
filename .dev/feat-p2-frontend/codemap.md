# 코드 맵: P2 프론트엔드 (사이드바 + 랜딩/로그인)

## 핵심 파일 (신규)
- apps/web/components/sidebar/AppShell.tsx → 앱 셸(데스크탑 고정 / 모바일 드로어 토글), `'use client'` (cross-review W1)
- apps/web/components/sidebar/Sidebar.tsx → 컨테이너(상태/페칭/로딩·에러·401, 하위 생성·position), `'use client'`
- apps/web/components/sidebar/WorkspaceSwitcher.tsx → 워크스페이스 목록+전환
- apps/web/components/sidebar/PageTree.tsx → 트리 루트+빈 상태
- apps/web/components/sidebar/PageTreeNode.tsx → 재귀 노드(펼침/접힘/네비)
- apps/web/src/lib/workspaces.ts → listWorkspaces (GET /api/workspaces)
- apps/web/src/lib/pages.ts → getPageTree, createPage

## 참조 파일
- apps/web/src/lib/types.ts → Workspace/Page/CreatePageInput
- apps/web/src/lib/schemas.ts → Zod(workspace, page 재귀)
- apps/web/src/lib/api.ts → 기존 fetch 래퍼(credentials), ApiError (재사용)
- apps/web/components/sidebar/{NewPageButton,AccountArea}.tsx
- apps/web/app/(app)/layout.tsx → Sidebar 통합 + 다크 셸
- apps/web/app/page.tsx → 랜딩(IEUM)
- apps/web/app/(auth)/login/page.tsx → 로그인(IEUM, OAuth 유지)

## 설정
- apps/web/tailwind.config.ts → IEUM 토큰 colors + Pretendard
- apps/web/app/globals.css → 디자인 토큰 CSS 변수(dark/light)
- apps/web/vitest.config.ts + vitest.setup.ts → jsdom + RTL
- apps/web/tsconfig.json → lib DOM 추가

## 디자인 참조
- design/screens/IEUM App.dc.html (사이드바 SSOT) 외 6종
- design/spacex-DESIGN.md (토큰), design/screen-prompts.md (화면 스펙)
