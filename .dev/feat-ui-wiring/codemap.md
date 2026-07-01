## 코드 맵: Details/States 컴포넌트 라이브 배선 (슬라이스 2, A3 6개)

### 클러스터 A (PageTreeNode 상호작용 + ConfirmDialog) — Batch A
- apps/web/components/sidebar/PageTreeNode.tsx → ContextMenu(우클릭) + IconPicker(아이콘 편집 대체)
- apps/web/components/sidebar/Sidebar.tsx → ConfirmDialog(아카이브, window.confirm 대체)
- apps/web/components/members/MembersModal.tsx → ConfirmDialog(멤버 내보내기, window.confirm 대체)
- (사용) components/states/ContextMenu, components/overlays/IconPicker, components/overlays/ConfirmDialog

### 클러스터 B (상태/계정) — Batch B
- apps/web/app/(app)/loading.tsx → 신규, <LoadingSkeleton/>
- apps/web/app/(app)/dashboard/page.tsx → 클라이언트화 + EmptyState + createPage 배선
- apps/web/components/sidebar/AccountArea.tsx → AccountMenu 팝오버 + getCurrentUser + 테마 토글
- apps/web/src/lib/auth.ts → 신규 logout() (POST /api/auth/logout)
- (사용) components/states/{EmptyState,LoadingSkeleton}, components/overlays/AccountMenu

### 참조
- apps/web/src/lib/{pages,workspaces,users,api}.ts → createPage/listWorkspaces/getCurrentUser/apiPost
- backend SecurityConfig.java → POST /api/auth/logout → 204
- 테스트: components/sidebar/__tests__/Sidebar.test.tsx (AC-F8 window.confirm spy → ConfirmDialog로 갱신 필요), PageTreeNode 아이콘/이름 테스트 등
