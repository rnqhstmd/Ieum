## 코드 맵: AccountMenu 설정·도움말 페이지 구현 및 배선

### 핵심 파일
- apps/web/components/sidebar/AccountArea.tsx:82-85 → `handleSettings`/`handleHelp`가 no-op 스텁(배선 대상). 이미 `useRouter` 보유(로그아웃 시 router.push('/login')). theme 토글도 여기(document.documentElement.dataset.theme + localStorage 'ieum-theme').
- apps/web/components/overlays/AccountMenu.tsx → `onSettings`/`onHelp` props로 설정/도움말 menuitem 렌더(role=menuitem). 프레젠테이션 컴포넌트.
- apps/web/app/(app)/settings/page.tsx → **신규** 설정 페이지(경로 후보).
- apps/web/app/(app)/help/page.tsx → **신규** 도움말 페이지(경로 후보).

### 참조 파일
- apps/web/app/(app)/layout.tsx → AppShell 래핑(신규 페이지도 사이드바 셸 안에 렌더).
- apps/web/app/(app)/dashboard/page.tsx → client page 패턴 참조('use client', getCurrentUser 등).
- apps/web/src/lib/users.ts → `getCurrentUser`(name/email — 설정 계정 정보).
- apps/web/src/lib/auth/logout.ts → `logout`(설정에서 로그아웃 제공 시).
- apps/web/components/editor/EditorContainer.tsx / Sidebar.tsx → ⌘K 단축키 등(도움말에 단축키 안내 시 참조).

### 설정
- .claude/config.json → node projectType. **CI 게이트 = pnpm typecheck + test + build** ([[ieum-verify-must-include-typecheck]]).

### 결정 필요 (PRD에서)
- 설정 페이지 콘텐츠(계정 정보·테마·로그아웃·워크스페이스 등 범위).
- 도움말 페이지 콘텐츠(단축키·소개·링크 등).
- 라우트 위치((app) 그룹 = 사이드바 셸 안).
