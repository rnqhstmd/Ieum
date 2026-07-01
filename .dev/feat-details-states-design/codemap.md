## 코드 맵: Details(오버레이) + States(상태) — 재사용 컴포넌트 + 쇼케이스

### 신규 — 클러스터 A (오버레이, Batch A)
- apps/web/components/overlays/CommandPalette.tsx → ⌘K 커맨드 팔레트
- apps/web/components/overlays/IconPicker.tsx → 이모지 피커 그리드
- apps/web/components/overlays/ConfirmDialog.tsx → 파괴적 액션 확인(재사용형)
- apps/web/components/overlays/AccountMenu.tsx → 계정 메뉴 패널
- apps/web/components/overlays/MobileActionSheet.tsx → 모바일 페이지 액션 시트
- apps/web/app/showcase/overlays/page.tsx → 오버레이 쇼케이스 라우트

### 신규 — 클러스터 B (상태, Batch B)
- apps/web/components/states/EmptyState.tsx → 빈 워크스페이스/페이지
- apps/web/components/states/LoadingSkeleton.tsx → 2-pane 로딩 스켈레톤
- apps/web/components/states/Forbidden403.tsx → 권한 없음(403)
- apps/web/components/states/ConnectionBanner.tsx → 오프라인/재연결 배너
- apps/web/components/states/ErrorToast.tsx → 저장 실패 토스트
- apps/web/components/states/ContextMenu.tsx → 페이지 우클릭 메뉴(재사용형)
- apps/web/app/showcase/states/page.tsx → 상태 쇼케이스 라우트

### 스킵 (중복)
- 워크스페이스 스위처 드롭다운 → app-design #35 WorkspaceSwitcher
- 슬래시 블록 메뉴 → editor-ux BlockTypeMenu

### 설정/참조
- apps/web/tailwind.config.ts → fainter·fill-a·fill-b 토큰 추가 완료(오케스트레이터). 코더 미수정
- apps/web/app/(auth)/login/page.tsx, app/page.tsx → 토큰/pill 패턴 레퍼런스
