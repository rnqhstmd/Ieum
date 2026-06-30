# 슬라이스 2 — Details/States 컴포넌트 라이브 배선 (A3 인프라 불필요 6개)

> #38에서 만든 재사용 컴포넌트(components/overlays·states)를 실제 라이브 트리거에 연결한다. **base = feat/membership-wiring(#39 위 스택)** — ConfirmDialog가 #39이 수정한 Sidebar/MembersModal의 window.confirm을 대체하므로.
> 인프라 필요(CommandPalette·ErrorToast·ConnectionBanner)는 이번 범위 제외(후속).
> 컴포넌트는 prop 주도라 시그니처를 그대로 쓰고, 소비자 측에서 상태(열림/대상)를 관리한다. 디자인·접근성 유지.

---

## 클러스터 A — PageTreeNode 상호작용 + ConfirmDialog → `components/sidebar/PageTreeNode.tsx`, `Sidebar.tsx`, `components/members/MembersModal.tsx`

### A-1. ContextMenu (페이지 우클릭) — PageTreeNode.tsx
- 트리 행에 `onContextMenu`(e.preventDefault) → 커서 위치에 `ContextMenu`(components/states/ContextMenu) 오픈.
- 항목(기존 핸들러 재사용): `이름 변경`(→ startEdit('title')) / `아이콘 변경`(→ startEdit('icon') 또는 IconPicker 오픈) / `하위 페이지 추가`(→ onCreateChild(page.id)) / divider / `아카이브`(destructive → onArchive(page.id)). 각 항목에 아이콘(연필/스마일/＋/휴지통) ReactNode.
- ContextMenu 위치: `style={{ position:'fixed', top, left }}`(커서). 외부클릭/Escape 닫기(ContextMenu의 onClose). 한 번에 하나만 열리도록 로컬 상태.
- 기존 hover 액션(✎/🗑/＋)은 유지(우클릭은 추가 어포던스).

### A-2. IconPicker (아이콘 편집) — PageTreeNode.tsx
- 현재 아이콘 클릭 시 인라인 `<input>`(editing==='icon')으로 이모지 입력 → 이를 **IconPicker 팝오버**(components/overlays/IconPicker)로 대체.
- IconPicker `onSelect(emoji)` → onSetIcon(page.id, emoji) + 닫기. `onRemove` → onSetIcon(page.id, '') (또는 기본값) + 닫기. `onRandom` → 기본 이모지 셋에서 랜덤 선택 후 onSelect 동일 처리.
- 아이콘 버튼 기준 위치(absolute) 팝오버. 외부클릭 닫기. (인라인 input 제거하고 picker로 교체; onSetIcon 계약 유지.)

### A-3. ConfirmDialog (파괴적 확인) — Sidebar.tsx + MembersModal.tsx
- **Sidebar.handleArchive**: 현재 `window.confirm('이 페이지와 하위 페이지를 모두 아카이브할까요?')` → ConfirmDialog로 대체. 상태 `confirmArchiveId: string|null`. 트리에서 아카이브 요청 시 setConfirmArchiveId(id), ConfirmDialog(destructive, title "페이지를 아카이브할까요?", message 하위 포함 안내, confirmLabel "아카이브") 렌더. onConfirm → archivePage 실행 + 닫기. onCancel → 닫기.
- **MembersModal.handleRemove**: 현재 `window.confirm('이 멤버를 내보낼까요?')` → ConfirmDialog로 대체. 상태 `removeTarget: Membership|null`. onConfirm → removeMember + reload(기존 분리 패턴 유지) + 닫기.
- ConfirmDialog는 components/overlays/ConfirmDialog. 백드롭/Escape 내장. destructive=true.

---

## 클러스터 B — 상태/계정 → `components/states/*` 마운트 + `components/sidebar/AccountArea.tsx` + `lib` + `app/(app)/{dashboard/page,loading}.tsx`

### B-1. LoadingSkeleton (로딩) — app/(app)/loading.tsx (신규)
- Next.js `loading.tsx` 컨벤션으로 `app/(app)/loading.tsx` 생성 → `<LoadingSkeleton />`(components/states) 렌더. (app) 라우트 전환 시 자동 표시. (서버 컴포넌트 가능 — LoadingSkeleton은 'use client' 아니면 그대로 import.)

### B-2. EmptyState (빈 워크스페이스) — app/(app)/dashboard/page.tsx
- dashboard를 클라이언트 컴포넌트로 전환. `listWorkspaces()`로 기본 워크스페이스(PERSONAL 우선) 조회 → `<EmptyState onCreate={...} />` 렌더.
- onCreate → `createPage(defaultWsId, { parentPageId:null, title:'제목 없음', position:0 })` → `router.push('/page/${created.id}')`. loading/error(401→/login) 처리.
- (대시보드는 페이지 목록이 별도로 없으므로 빈 상태 CTA를 메인으로 — 디자인의 "첫 페이지를 만들어 보세요"와 부합.)

### B-3. AccountMenu (계정 메뉴) — AccountArea.tsx + lib/auth.ts(신규)
- `lib/auth.ts` 신규: `export async function logout(): Promise<void>` → `apiPost('/api/auth/logout')`(204). (백엔드 SecurityConfig 확인됨: POST /api/auth/logout → 204 세션 클리어.)
- `AccountArea.tsx`: 계정 행을 버튼으로 만들어 클릭 시 `AccountMenu`(components/overlays) 팝오버 토글(계정 행 위로). 마운트 시 `getCurrentUser()`로 name/email 표시(현재 props 기본값 대신 실데이터; 실패 시 기존 기본값 유지).
- AccountMenu 액션:
  - `onLogout` → `logout()` 성공 시 `router.push('/login')`.
  - `onToggleTheme` → 클라이언트 테마 토글: `document.documentElement.dataset.theme` 'dark'↔'light' + `localStorage('ieum-theme')` 저장. `theme` prop으로 현재값 표시. (라이트 토큰은 globals.css에 정의돼 있음.)
  - `onSettings`·`onHelp` → 대상 페이지 없음 → **스텁(no-op + TODO)**. (인프라 외 영역.)
- 외부클릭/Escape 닫기.

---

## 데이터 원칙·검증
- 실제 데이터/실제 동작. 가짜 데이터 없음. 기존 로직(트리 CRUD·멤버 배선·autosave) 보존.
- 변경으로 기존 테스트가 깨지면 갱신(특히 PageTreeNode/Sidebar 인라인 아이콘 input → picker, window.confirm → ConfirmDialog 변경 시 관련 테스트 갱신).
- `npx tsc --noEmit` clean. `npx vitest run` 전체 통과. `next build` 보상검증(직접 실행은 오케스트레이터).
