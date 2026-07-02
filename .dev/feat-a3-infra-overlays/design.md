# 설계서: A3 인프라 컴포넌트 3종 라이브 배선 (CommandPalette · ErrorToast · ConnectionBanner)

## 설계 규모
**대형** — 신규 전역 토스트 시스템(Context) + CommandPalette 검색/⌘K 배선 + Transport 연결상태를 CRDT 훅까지 노출하는 3개 독립 기능.

## 확정 스코프
CommandPalette=현재 워크스페이스 페이지 이동만 / ErrorToast=제목 저장 실패만 / ConnectionBanner=에디터 화면 한정 / 검색=클라이언트 로드 목록 필터, **백엔드 무변경**.

## 변경 범위

### 신규 파일
- `apps/web/components/states/ToastProvider.tsx` — 전역 단일 토스트 Context + `useToast` 훅 + portal 렌더 region(ErrorToast 소비)
- `apps/web/components/overlays/CommandPaletteContainer.tsx` — 팔레트 열림/검색어/필터/키보드 네비/portal 소유 컨테이너

### 수정 파일
- `apps/web/app/(app)/layout.tsx` — `<ToastProvider>`로 AppShell 래핑
- `apps/web/components/sidebar/Sidebar.tsx` — 검색박스 실트리거화 + 전역 ⌘K 리스너 + CommandPaletteContainer 렌더
- `apps/web/components/overlays/CommandPalette.tsx` — 검색 input `value/onChange`(controlled) + optional activeIndex
- `apps/web/components/editor/EditorContainer.tsx` — saveTitle 토스트 래핑 + ConnectionBanner 마운트
- `apps/web/src/lib/editor/useCrdtDocument.ts` — transport `onOpen/onClose` 구독 → `connectionStatus` 노출
- `apps/web/src/lib/pages.ts` — `flattenPageTree(pages)` 헬퍼 추가

## 상세 설계

### 1. ToastProvider.tsx (신규) — 전역 단일 토스트 [FR-8,11,12]
Context 기반 Provider. 단일 토스트 상태 `{message, onRetry?} | null`(교체 방식 → AC-13). `showError` 시 기존 5초 타이머 clear 후 재설정(AC-11). portal 렌더 region은 `document.body` fixed 우하단(AppShell transform 컨테이닝 회피). `toast===null` 초기값 → SSR 미렌더(하이드레이션 안전). Provider 밖 `useToast`는 no-op 기본값(하위 호환).
```
const AUTO_DISMISS_MS = 5000
interface ToastApi { showError(message: string, opts?: { onRetry?: () => void }): void; dismiss(): void }
function ToastProvider({ children }): JSX.Element
function useToast(): ToastApi
```
렌더: `toast && createPortal(<div className="fixed bottom-6 right-6 z-50"><ErrorToast message onRetry onDismiss={dismiss}/></div>, document.body)`. 타이머는 useRef, showError/dismiss/언마운트 시 clear.

### 2. app/(app)/layout.tsx (수정) — ToastProvider 마운트 [AC-8]
`<ToastProvider><AppShell>{children}</AppShell></ToastProvider>`. layout은 server 유지(client Provider를 wrapper로).

### 3. EditorContainer.tsx (수정) — 저장 실패 토스트 + 연결 배너 [AC-9,10,13~18/BR-2,3]
- `useToast()`로 showError/dismiss. `saveTitle`을 `saveWithToast(next)`로 래핑 → try/catch, 실패 시 `showError('변경사항을 저장하지 못했습니다.', {onRetry})` 후 rethrow(useAutosave idle 복귀 유지). `onRetry`는 직전 실패 `next`를 클로저 캡처해 `saveTitle(next)` 재호출(AC-10), 성공 시 dismiss, 재실패 시 showError 재호출(단일 교체 AC-13). useAutosave엔 saveWithToast 전달.
- `useCrdtDocument`에서 `connectionStatus` 취득. header 위에 `{(connectionStatus==='offline'||connectionStatus==='reconnected') && <ConnectionBanner status={connectionStatus}/>}` — 명시 equality(undefined/'online' 미렌더 AC-16, 하위호환). 배너는 EditorContainer 내부 only → 대시보드/멤버 미렌더(BR-3/AC-18). in-flow(transform 없음) → portal 불필요.
- **페이지 이동 시 토스트 정리(critic CONSIDER)**: EditorContainer는 `key={pageId}` remount이나 ToastProvider는 layout에 있어 수명이 상위 → 떠난 페이지의 토스트/onRetry가 남는다. `useEffect(() => dismiss, [pageId])`(또는 언마운트 cleanup)로 **페이지 전환/언마운트 시 dismiss** 호출 → "떠난 화면 오류를 현재 화면에서 재시도"하는 혼란 제거.

### 4. useCrdtDocument.ts (수정) — connectionStatus 노출 [AC-14~16] ★critic MUST-ADDRESS 반영
transport 생성 effect 내 `transport.onOpen(...)`·`transport.onClose(...)` 추가 구독 → `connectionStatus: 'online'|'offline'|'reconnected'` state 파생. `wasOfflineRef`(bool), `reconnectTimerRef`(timer|null) 사용.

**상태 전이표 (flapping 안전 — offline 우선):**
| 이벤트 | reconnectTimer 처리 | connectionStatus | wasOfflineRef |
|--------|--------------------|------------------|---------------|
| 초기 | — | `'online'` | false |
| onClose | **있으면 clear**(→null) | `'offline'` | true |
| onOpen (wasOffline=true) | **있으면 clear**, 새 타이머 3000ms 설정 | `'reconnected'` | false |
| onOpen (wasOffline=false) | **있으면 clear** | `'online'` | — |
| reconnectTimer fire | (자기 자신 null화) | `'online'` | — |
| effect cleanup(pageId 변경/unmount) | clear + unsub | — | — |

**핵심 수정**: 3000ms 타이머를 `reconnectTimerRef`에 보관하고 **모든 onClose·onOpen 전이 진입 시 먼저 clear**한다. 이로써 `offline→reconnect(타이머 시작)→3초 내 재차단(onClose)` flapping 시 살아있던 타이머가 clear되어 'offline'이 유지된다(AC-14 보장). 타이머 fire 시엔 직전에 clear가 없었음이 보장되므로 안전하게 'online' 설정. cleanup에서도 clear. additive(기존 소비자 무영향). transportFactory 주입 경로 유지(FakeTransport `emitOpen/emitClose` 테스트).

**수용된 MVP 한계(critic CONSIDER)**: "최초 연결 실패(open 전 close)" 시 offline→최초 성공 연결이 'reconnected'로 표기됨. 실제로 오프라인이었으므로 offline 표시는 정당하며, MVP에서 허용(AC-16은 "끊긴 적 없는 정상 진입"만 규정).

### 5. CommandPaletteContainer.tsx (신규) — 팔레트 소유 [AC-1,3,4,6,7,17]
controlled 컨테이너. props `{open, onClose, pages, onNavigate}`. open=false면 null. query state 소유, `flattenPageTree(pages)`를 title 부분일치(대소문자 무시) 필터 → 단일 group '페이지'(빈 검색어=전체 FR-6/AC-6). onSelect→`onNavigate(id)`+onClose(AC-4). query/onQueryChange를 CommandPalette에 전달(controlled AC-3). 마운트 시 autofocus. FR-7: activeIndex state로 ↑/↓·Enter(query 변경 시 0 리셋). portal `createPortal(<div className="fixed inset-0 z-50"><CommandPalette/></div>, document.body)`. pages=현재 워크스페이스 트리 → BR-1/AC-17 자동 한정.

### 6. CommandPalette.tsx (수정) — 검색 input 배선 [AC-3]
props에 `query?`, `onQueryChange?`, `activeIndex?` 추가(전부 optional → 쇼케이스 하위호환). input에 value/onChange 배선. **autofocus는 CommandPalette가 소유**(input이 여기 있음 — critic 지적): `useRef`+마운트 시 `inputRef.current?.focus()`(또는 `autoFocus` 속성). 컨테이너가 자식 input을 포커싱하려 ref 포워딩하지 않는다. FR-7 시 하이라이트를 정적 `itemIndex===0` 대신 `activeIndex`로. 참고: 백드롭 `onClick={onClose}`로 **바깥클릭 닫힘 이미 구현**(AC-5 성립).

### 7. Sidebar.tsx (수정) — 검색박스 실트리거 + 전역 ⌘K [AC-1,2,5]
`selectedWsId`·`pages`·`navigate`·`router` 이미 소유, ConfirmDialog createPortal 선례 보유. 추가:
- `paletteOpen` state.
- 전역 keydown useEffect: `(metaKey||ctrlKey)&&key.toLowerCase()==='k'`→preventDefault+setPaletteOpen(true)(AC-1). cleanup 해제.
- 검색박스 `aria-hidden` div→`<button onClick={()=>setPaletteOpen(true)}>`(AC-2, 스타일 유지).
- `<CommandPaletteContainer open={paletteOpen} onClose pages={pages} onNavigate={navigate}/>` 렌더. Escape/바깥클릭은 CommandPalette 기존 동작(AC-5).
navigate는 이미 드로어 닫기+router.push('/page/{id}') → 재사용.

### 8. pages.ts (수정) — flattenPageTree [FR-3 지원]
`export function flattenPageTree(pages: Page[]): Page[]` — children 재귀 평탄화.

## 구현 순서 (병렬성)
1. ToastProvider.tsx (독립) · 2. pages.ts flattenPageTree (독립) · 3. useCrdtDocument connectionStatus (독립) · 4. CommandPalette input 배선 (독립) — **1·2·3·4 병렬**
5. layout.tsx ToastProvider (←1) · 6. EditorContainer 토스트+배너 (←1·3) · 7. CommandPaletteContainer (←2·4) · 8. Sidebar ⌘K+트리거 (←7)

## Testability (vitest + RTL)
- ToastProvider.test: showError→role=alert(AC-8), X클릭 소멸(AC-12), fakeTimers advance 5000 자동소멸(AC-11), 연속 2회→1개 최신(AC-13), 재시도→onRetry.
- CommandPaletteContainer.test: type→일치항목만(AC-3), fixture 현재ws만(AC-17), 빈검색어→전체(AC-6), 클릭→navMock+closeMock(AC-4), ↑/↓/Enter(AC-7).
- Sidebar.test 확장: keyDown(window,{key:'k',metaKey})→dialog(AC-1), 검색박스 클릭→등장(AC-2), Escape→닫힘(AC-5), 항목클릭→pushMock(AC-4).
- EditorContainer.test 확장: saveTitle reject+ToastProvider 래핑→토스트(AC-9), 재시도→saveTitle 재호출 동일인자(AC-10), 2회 실패→1개(AC-13). connectionStatus mock 주입→offline/reconnected만 배너(AC-16/18). **★critic: 기존 테스트는 useAutosave를 `{status:'idle', notifyChange: vi.fn()}` no-op으로 목킹해 save/toast 경로가 실행 안 됨.** AC-9/10/13 검증은 (a) 실제 useAutosave 목킹 해제 + fakeTimers로 500ms 디바운스 태우거나 (b) `saveWithToast`를 별도 export/직접 호출하는 셋업이 필요 — 기존 목 재사용 불가. 구현자는 이 전환을 반영할 것.
- useCrdtDocument renderHook+FakeTransport: emitClose→offline(AC-14), emitOpen(offline후)→reconnected, advance 3000→online(AC-15), 초기→online(AC-16).

## 하위 호환
- useCrdtDocument 반환에 connectionStatus additive → EditorContainer만 소비. EditorContainer.test baseResult mock에 `connectionStatus:'online'` 추가 권장.
- CommandPalette 신규 prop optional → showcase 무변경.
- ToastProvider 밖 useToast no-op → 기존 테스트 하위호환.
- Sidebar 검색박스 aria-hidden→button: 기존 assertion 없음(확인 완료).

## 설계 결정 확정 (phase-design Q&A)
- Q1 팔레트 데이터 소스: **Sidebar 소유**(selectedWsId 기반 pages 재사용, Context 0개). AC-17은 "현재 워크스페이스=사이드바 선택" 해석으로 충족(명시적 결정).
- Q2 토스트 트리거 위치: **EditorContainer에서 saveTitle 래핑**(usePageTitle 단일책임 유지).
- Q3 FR-7 방향키: **포함**(activeIndex 상태 + ↑/↓/Enter, query 변경 시 0 리셋).
- reconnected 자동소멸: 3000ms(기본).
