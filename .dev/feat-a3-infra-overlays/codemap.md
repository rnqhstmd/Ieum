## 코드 맵: A3 인프라 컴포넌트 3개 라이브 배선 (CommandPalette·ErrorToast·ConnectionBanner)

### 핵심 파일 (배선 대상 컴포넌트 — 이미 존재, prop 주도)
- apps/web/components/overlays/CommandPalette.tsx → ⌘K 팔레트. props `onClose`, `groups: CommandGroup[]`. **검색 input 미배선(정적 placeholder), Escape만 있음**. 백드롭 `absolute inset-0`.
- apps/web/components/states/ErrorToast.tsx → 단일 토스트. props `message`, `onRetry`, `onDismiss`. role=alert.
- apps/web/components/states/ConnectionBanner.tsx → props `status: 'offline'|'reconnected'`. offline=풀폭 배너, reconnected=인라인 pill.

### 인프라 소스/마운트 지점
- apps/web/app/(app)/layout.tsx → AppShell 래핑. **전역 오버레이(토스트 region·팔레트·연결배너) 마운트 후보**.
- apps/web/components/sidebar/AppShell.tsx → 앱 셸(사이드바+본문). transform 컨테이닝 주의([[ieum-design-implementation]] createPortal 교훈).
- apps/web/src/lib/realtime/transport.ts → `Transport` 인터페이스가 **`onOpen(cb)`·`onClose(cb)` 노출**. `createRetryingTransport`가 재연결 처리 → **ConnectionBanner 연결상태 소스**.
- apps/web/src/lib/editor/useCrdtDocument.ts:245 → 현재 `connectedClients`(presence 수)만 반환, **transport 연결상태 미노출** → 노출 추가 필요.
- apps/web/src/lib/realtime/relayClient.ts → `createRelayClient`/`RelayClient`. transport 소비.
- apps/web/src/lib/pages.ts → `getPageTree(wsId)` / apps/web/src/lib/workspaces.ts → 검색 데이터 소스(CommandPalette 명령: 페이지 이동).

### 참조 (에러 소스 — ErrorToast 트리거 후보)
- apps/web/src/lib/editor/useAutosave.ts → 저장 실패 시 status 'dirty' 유지 → 토스트 트리거 후보.
- apps/web/src/lib/editor/usePageTitle.ts → saveTitle 실패(apiPatch reject) → 토스트 트리거 후보.

### 없음(신규 구축)
- 토스트 시스템: ToastProvider(context) + useToast 훅 + 렌더 region **전무** → 신규.

### 설정
- .claude/config.json → node projectType(build/test). **CI 게이트는 pnpm typecheck+test+build** ([[ieum-verify-must-include-typecheck]] — 로컬 verify에 typecheck 필수).
