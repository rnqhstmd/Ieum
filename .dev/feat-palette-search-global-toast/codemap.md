## 코드 맵: CommandPalette 확장(명령 실행·사람 찾기) + ErrorToast 전역화

### 핵심 파일
- apps/web/components/overlays/CommandPaletteContainer.tsx:20 → ⌘K 팔레트 소유 컨테이너. 현재 `groups=[{label:'페이지', items}]` 단일 그룹만 구성. **명령/사람 그룹 추가 대상**.
- apps/web/components/overlays/CommandPalette.tsx:33 → prop 주도 재사용 뷰. `groups[]` 다중 그룹·activeIndex 전역 인덱스 이미 지원(뷰 변경 최소).
- apps/web/components/sidebar/Sidebar.tsx:36 → ⌘K 전역 단축키 소유 + CommandPaletteContainer 렌더. wsId/members/commands 전달 지점.
- apps/web/components/states/ToastProvider.tsx:30 → 전역 단일 토스트 Provider + useToast(). **이미 전역 마운트**. no-op 기본값(Provider 밖 안전).
- apps/web/components/states/ErrorToast.tsx:9 → 토스트 프레젠테이션(message/onRetry/onDismiss).
- apps/web/components/members/MembersModal.tsx:63 → `handleActionError`가 `alert('작업을 처리하지 못했습니다…')` 사용. **useToast 전환 대상(전역화)**.

### 참조 파일
- apps/web/app/(app)/layout.tsx:6 → ToastProvider가 AppShell을 감싸는 마운트 위치(전역 성립 근거).
- apps/web/src/lib/members.ts:6 → `listMembers(wsId)` — 사람 찾기 데이터원.
- apps/web/src/lib/pages.ts → `flattenPageTree` — 팔레트 페이지 후보 평탄화.
- apps/web/components/editor/EditorContainer.tsx → 현재 useToast 유일 소비자(전역화 참조 패턴).
- apps/web/src/lib/auth/redirectOnAuthError.ts → 401 처리 헬퍼(에러 처리 통합 시 참조).
- apps/web/src/lib/types.ts → Membership/CurrentUser 타입.

### 설정
- tsconfig.base.json → noUncheckedIndexedAccess: true (인덱스 접근 결과 `| undefined`, `!`/옵셔널 체이닝 필요).
- apps/web (Next.js 15 App Router, (app) route group, pnpm workspace, vitest + @testing-library/react).
