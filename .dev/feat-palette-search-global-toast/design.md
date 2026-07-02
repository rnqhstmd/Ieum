# 설계서: CommandPalette 명령·사람 검색 확장 + ErrorToast 전역화

## 개요
⌘K 팔레트에 "명령 실행"·"사람 찾기" 그룹을 더하고(기능 A), 전역 토스트(ToastProvider/useToast)를 MembersModal·Sidebar mutation 실패에 확대 적용한다(기능 B). 재사용 뷰(CommandPalette.tsx)와 토스트 인프라는 이미 다중 그룹·전역 activeIndex·emptyMessage·Provider-밖-no-op를 지원하므로, **뷰/인프라 무변경**으로 컨테이너·사이드바 배선 + 얇은 순수 헬퍼/훅 추가로 충족한다.

## 설계 규모
**대형** — 신규 파일 2(순수 헬퍼 1 + 훅 1) + 테스트 3, 컴포넌트 3개(Container/Sidebar/MembersModal) 수정, AC 34건(A 23 + B 11).

## 확정된 설계 결정 (사용자 승인 + 검토 반영)
1. **[Q1] 액션 공용화 = Sidebar 인라인.** logout/테마/설정/도움말 액션을 Sidebar에 인라인 배선. AccountArea 무수정(소량 중복 감수, 회귀 위험 최저).
2. **[Q2] 재시도 버튼 = 4개 mutation 전부 포함.** BR-B2/AC-B11을 Could→**Must로 승격**. 생성/이름변경/아이콘/아카이브 실패 토스트에 모두 "다시 시도" 제공(동일 인자로 mutation 재호출).
3. **[Q3] 사람 항목 = 이메일 meta 표시.** userEmail을 `item.meta`(우측 보조텍스트)로. 뷰 무변경(CommandPalette.tsx:133 이미 meta 렌더).
4. **[MUST-ADDRESS 해소] `usePaletteMembers` stale/경합 가드.** open false→true 전이 및 wsId 변경 시 members를 **즉시 `[]`로 리셋**하고, in-flight 응답은 **세대(generation)+wsId 가드**로 최신 요청만 반영(Sidebar `activeWsIdRef`·MembersModal `active` 패턴 등가물). → AC-A18 stale 플래시 방지 + ws-A 느린 응답이 ws-B에 채워지는 경합 차단.
5. **[loadTree 경계 결정] `handleMutationError`는 mutation 호출 실패만 커버.** mutation 성공 후 `loadTree` 재조회 실패는 기존 `loadTree` 내부 catch(→setStatus('error') 인라인 오류)를 그대로 유지(범위 안정, AC 무영향). 비고에 한계 명시.

## 변경 범위

### 신규 생성
- `apps/web/src/lib/palette/groups.ts` — 순수 헬퍼. 렌더/부수효과 없음.
- `apps/web/src/lib/palette/usePaletteMembers.ts` — 훅. 팔레트 open+SHARED일 때 멤버 조회 + stale/401 가드.
- `apps/web/src/lib/palette/__tests__/groups.test.ts`
- `apps/web/src/lib/palette/__tests__/usePaletteMembers.test.tsx`

### 수정
- `apps/web/components/overlays/CommandPaletteContainer.tsx` — 3그룹 구성/전역 방향키/emptyMessage 확장. 신규 optional props로 사람·명령 활성화(미전달 시 현행 페이지-only 유지 → 기존 테스트 무회귀).
- `apps/web/components/sidebar/Sidebar.tsx` — 명령 액션 콜백·멤버 조회 배선, mutation 실패를 트리 오류화 대신 전역 토스트(+재시도)로 전환(`handleMutationError`).
- `apps/web/components/members/MembersModal.tsx` — `handleActionError`의 `alert()` → `useToast().showError`, 401은 `redirectOnAuthError`로 통일.
- 테스트 확장: `CommandPaletteContainer.test.tsx`, `Sidebar.test.tsx`, 신규 `MembersModal.test.tsx`.

### 변경 없음 (중요)
- `CommandPalette.tsx`(다중 그룹·전역 activeIndex·emptyMessage·meta 이미 지원), `ToastProvider.tsx`, `redirectOnAuthError.ts`, `useTheme.ts`, `logout.ts`, `members.ts`, `types.ts`.

## 상세 설계

### 1. `apps/web/src/lib/palette/groups.ts` (신규, 순수)
FR-A1/A10/A11/A22 로직을 render 없이 단위 검증하도록 순수 함수로 격리.

```ts
export interface PaletteItem { id: string; icon?: string; title: string; meta?: string; search: string; onSelect: () => void; }
export interface CommandActions { onCreatePage?: () => void; onOpenSettings?: () => void; onOpenHelp?: () => void; onToggleTheme?: () => void; onOpenMembers?: () => void; onLogout?: () => void; }
export interface CommandCandidate { id: string; icon?: string; title: string; run: () => void; }

// 컨텍스트별 명령 후보(문구·순서 고정, BR-A1). 액션 콜백이 주어졌을 때만 후보 포함.
export function buildCommandCandidates(workspace: Workspace | null, actions: CommandActions): CommandCandidate[];

// rawGroups를 query(소문자 부분일치, item.search 기준)로 필터 → 빈 그룹 제거 → flat(렌더 순서 페이지→사람→명령) 동시 산출.
export function assembleGroups(
  rawGroups: { label: string; items: PaletteItem[] }[],
  query: string,
): { groups: { label: string; items: PaletteItem[] }[]; flat: PaletteItem[] };
```

`buildCommandCandidates` 규칙(FR-A1/A6/A22, BR-A1):
- `새 페이지 만들기` → `workspace && actions.onCreatePage`.
- `설정 열기`/`도움말 열기`/`테마 전환`/`로그아웃` → 각 액션 제공 시 상시.
- `멤버 관리 열기` → `workspace?.type === 'SHARED' && actions.onOpenMembers`.
- 순서 고정: 새페이지·설정·도움말·테마·멤버·로그아웃.
- 아이콘(선택): 새페이지 ➕ / 설정 ⚙️ / 도움말 ❓ / 테마 🌓 / 멤버 👥 / 로그아웃 ↩ (AC 검증 대상 아님).

### 2. `apps/web/src/lib/palette/usePaletteMembers.ts` (신규, 훅)
FR-A12/AC-A18/19/20의 비동기·401·경합 분기를 격리해 renderHook으로 단위 검증.

```ts
export function usePaletteMembers(input: { open: boolean; workspace: Workspace | null }): Membership[];
```

동작(MUST-ADDRESS 가드 포함):
- `open && workspace?.type==='SHARED' && workspace.id`가 아니면 members를 `[]`로 두고 조회하지 않는다.
- 조건 충족 시: **먼저 members를 `[]`로 리셋**(stale 플래시 방지) 후 `listMembers(workspace.id)` 호출.
- **세대/ws 가드**: effect 진입 시 `reqId`(또는 캡처한 wsId + active 플래그) 기록. 응답 도착 시 현재 open/ws가 요청 시점과 동일할 때만 `setMembers(list)` 반영. 다르면 무시(ws-A 느린 응답이 ws-B에 채워지지 않음).
- 실패: `redirectOnAuthError(e, router)`가 true(401)면 종료(리다이렉트). false(비401)면 members `[]` 유지(사람 그룹만 숨김).
- 의존성: `[open, workspace?.id, workspace?.type]`. cleanup에서 active=false.
- 반환: `Membership[]` (로딩/비401/무매칭/닫힘/ws변경 모두 `[]`로 수렴 → 파생 "빈 그룹 숨김"이 일괄 흡수).
- **AC-A18 검증 계약**: 로딩 상태를 별도 플래그로 노출하지 않으므로, 테스트는 반드시 **지연 프라미스 전이**(pending 시점 `[]`→그룹 숨김 assert, resolve 후 `[member]`→그룹 노출 assert)로 로딩 경로를 실제로 태운다.

### 3. `apps/web/components/overlays/CommandPaletteContainer.tsx` (수정)
Props 확장(전부 optional → 하위호환):
```ts
interface Props {
  open: boolean; onClose: () => void; pages: Page[]; onNavigate: (pageId: string) => void; loading?: boolean;
  // NEW
  workspace?: Workspace | null;      // 명령/사람 조건부 노출(id·type)
  members?: Membership[];            // SHARED에서 Sidebar가 주입
  onCreatePage?: () => void;         // FR-A2
  onOpenSettings?: () => void;       // FR-A3
  onOpenHelp?: () => void;           // FR-A4
  onToggleTheme?: () => void;        // FR-A5
  onOpenMembers?: () => void;        // FR-A6 & 사람 선택(FR-A9) 공용
  onLogout?: () => void;             // FR-A7
}
```
로직:
1. `rawGroups`(useMemo):
   - 페이지 → `flattenPageTree(pages).map(p => ({ id, icon: p.icon??'📄', title: p.title||'제목 없음', search: (p.title||'').toLowerCase(), onSelect: () => { onNavigate(p.id); onClose(); } }))`.
   - 사람 → `workspace?.type==='SHARED'`일 때만 `(members??[]).map(m => ({ id: m.userId, icon:'👤', title: m.userName, meta: m.userEmail, search: (m.userName+' '+m.userEmail).toLowerCase(), onSelect: () => { onOpenMembers?.(); onClose(); } }))`.
   - 명령 → `buildCommandCandidates(workspace??null, {onCreatePage,…}).map(c => ({ id:c.id, icon:c.icon, title:c.title, search: c.title.toLowerCase(), onSelect: () => { c.run(); onClose(); } }))`.
2. **[loading 게이팅]** `loading`이면 `rawGroups`를 빈 배열로 취급 → assembleGroups 결과 `groups=[]/flat=[]` → emptyMessage "불러오는 중…"만 렌더(AC-A21). (명령 후보가 상시 존재해 totalItems≠0이 되는 것을 방지 — test-architect/critic 지적 반영.)
3. `const { groups, flat } = useMemo(() => assembleGroups(rawGroups, query), [rawGroups, query])`.
4. `handleKeyDown`: 순회/실행을 **flat 기준**으로 — `Math.min(i+1, flat.length-1)`/`Math.max(i-1,0)` 클램프, Enter는 `flat[activeIndex]?.onSelect()`(noUncheckedIndexedAccess 옵셔널 가드 유지).
5. `emptyMessage`: `loading ? '불러오는 중…' : flat.length===0 ? (query ? '검색 결과가 없습니다' : '페이지가 없습니다') : undefined`. (라이브 배선 시 명령 상시노출로 "페이지가 없습니다"는 사실상 미도달 — 죽은 분기지만 하위호환 위해 유지.)
6. 뷰: `<CommandPalette groups={groups} activeIndex={activeIndex} … />`.
7. 재열림 초기화(query='', activeIndex=0)·query 변경 시 activeIndex=0 기존 effect 유지(AC-A23/A16 기준점).
- **라우팅은 주입 콜백**으로만(useRouter 미도입) → 기존 컨테이너 테스트가 next/navigation 모킹 없이 통과. onClose 래핑을 컨테이너가 일괄 수행 → 모든 항목 선택 즉시 닫힘(AC-A3/A7/A17). 비동기 액션(로그아웃/생성)이어도 onClose는 동기 즉시(AC-A7).

### 4. `apps/web/components/sidebar/Sidebar.tsx` (수정)
1. `currentWs` 계산을 훅 호출 이전(상단)으로 이동.
2. 신규 소비: `const { toggleTheme } = useTheme();`, `const { showError } = useToast();`, `const paletteMembers = usePaletteMembers({ open: paletteOpen, workspace: currentWs });`, `logout` import.
3. 액션 콜백(useCallback 안정 참조, **AccountArea와 동일 정책 인라인**):
   - `onCreatePage = () => void handleCreate(null)` (FR-A2/FR-B4 — 기존 생성 흐름 재사용).
   - `goSettings = () => router.push('/settings')`, `goHelp = () => router.push('/help')`.
   - `goMembers = () => { if (selectedWsId) router.push(`/workspace/${selectedWsId}/members`); }`.
   - `doLogout = async () => { try { await logout(); router.push('/login'); } catch {/* 세션 유지 */} }`.
4. **mutation 오류 핸들러 + 재시도(FR-B2/BR-B1/BR-B2, [Q2] 4개 전부)**:
   ```ts
   const handleMutationError = (e: unknown, message: string, onRetry: () => void) => {
     if (redirectOnAuthError(e, router)) return; // 401→/login, 토스트 없음
     showError(message, { onRetry });            // 비401→토스트+재시도, 트리 유지
   };
   ```
   - `handleCreate(parentId)` catch → `handleMutationError(e, '페이지를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.', () => handleCreate(parentId))`.
   - `handleRename(id,title)` catch → `'이름을 변경하지 못했습니다. …'`, retry=`() => handleRename(id, title)`.
   - `handleSetIcon(id,icon)` catch → `'아이콘을 변경하지 못했습니다. …'`, retry=`() => handleSetIcon(id, icon)`.
   - 아카이브: `handleConfirmArchive`가 `confirmArchiveId`를 지운 뒤 실행하므로 **캡처한 id**로 재시도. 실무: archive 실행부를 `archiveById(id)`로 분리하고 catch → `'페이지를 아카이브하지 못했습니다. …'`, retry=`() => archiveById(id)`.
   - `loadTree`/초기 `listWorkspaces` catch → 기존 `handleError`(setStatus('error')) **그대로 유지**(FR-B3/AC-B9).
5. 컨테이너에 새 props 전달: `workspace={currentWs} members={paletteMembers} onCreatePage={onCreatePage} onOpenSettings={goSettings} onOpenHelp={goHelp} onToggleTheme={toggleTheme} onOpenMembers={goMembers} onLogout={doLogout}`.
- mutation 실패 시 `loadTree` 미호출 → `status='ready'` 유지 → 트리 그대로(AC-B4~B7). 성공 후 `loadTree`는 자체 try/catch로 처리(결정 5).

### 5. `apps/web/components/members/MembersModal.tsx` (수정)
- `import { useToast }` + `const { showError } = useToast();`.
- `handleActionError` → `if (redirectOnAuthError(e, router)) return; showError('작업을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');` (alert 제거, 문구 유지, 401 통일). 4개 액션(초대/역할/내보내기/취소) 공용(AC-B1/B3).

## 인터페이스 요약(신규)
- `buildCommandCandidates(workspace: Workspace | null, actions: CommandActions): CommandCandidate[]`
- `assembleGroups(rawGroups, query: string): { groups; flat }`
- `usePaletteMembers({ open: boolean; workspace: Workspace | null }): Membership[]`
- `CommandPaletteContainer` 신규 optional props 8종
- `Sidebar` 내부 `handleMutationError(e, message, onRetry)` + 액션 콜백 5종 + `archiveById(id)`

## 구현 순서 (RGR 태스크 + AC 매핑)
1. **[Must] groups.ts** (의존 없음) — buildCommandCandidates(AC-A1/A2/A6/A22, BR-A1) · assembleGroups(AC-A10/A11/A14/A15/A16 flat 순서). RED: groups.test.ts.
2. **[Must] usePaletteMembers** (의존 없음) — 조회/401/비401/닫힘·ws변경 리셋·세대가드(AC-A18/A19/A20). RED: usePaletteMembers.test.tsx(renderHook + listMembers·next/navigation 목 + 지연 프라미스 전이).
3. **[Must] CommandPaletteContainer 확장** (의존 1) — 3그룹·전역 방향키·emptyMessage·loading 게이팅·명령/사람 onSelect(AC-A1~A7/A10~A17/A21~A23; A8/A9는 onLogout+onClose 발화까지). RED: 컨테이너 테스트 신규 케이스(workspace/members/액션 vi.fn 주입). 기존 페이지-only 케이스 무회귀(QE-A1).
4. **[Must] MembersModal 토스트화** (의존 없음, 파일 독립) — alert→showError(AC-B1/B2/B3). RED: 신규 MembersModal.test.tsx(ToastProvider wrap + window.alert 스파이).
5. **[Must] Sidebar mutation 토스트화 + 재시도** (의존 없음) — handleMutationError + 4개 catch 교체(재시도 포함) + archiveById 분리, 초기/트리 로드 인라인 유지(AC-B4~B9, AC-B11). RED: Sidebar.test.tsx(ToastProvider wrap).
6. **[Must] Sidebar 팔레트 배선** (의존 2·3·5) — currentWs 상향, useTheme/useToast/usePaletteMembers 소비, 액션 콜백 5종, 컨테이너 props 전달(AC-A3~A9 라우팅·테마·로그아웃 실동작, AC-A12 사람 이동, AC-B10 팔레트 경유 생성 실패). RED: Sidebar 통합 케이스.

1·2·4 상호 독립(병렬 가능), 5도 4와 파일 독립. 6은 2·3·5 후.

## 테스트 전략
- **순수(1)**: groups.test.ts — render 없이 후보/필터/평탄화 순서. 모의 0.
- **훅(2)**: usePaletteMembers.test.tsx — renderHook + `vi.mock('@/src/lib/members')`·next/navigation pushMock. 성공/401/비401 + **지연 프라미스 전이로 AC-A18**.
- **컨테이너(3)**: 기존 테스트 확장. workspace(PERSONAL/SHARED/null)·members fixture·액션 **vi.fn 주입**. 그룹 렌더(AC-A1/A2/A13/A14/A15/A21), 필터(AC-A10/A11), **방향키 크로스는 Enter-프록시 역검증**(경계 넘긴 뒤 Enter→해당 콜백 발화; AC-A16/A17 — CommandPalette 무변경이라 aria-selected 없음), 선택 시 콜백+onClose(AC-A3~A9/A12), 재열림 초기화(AC-A23). `within(dialog)` 스코프.
- **Sidebar(5·6)**: 토스트 케이스는 `<ToastProvider><Sidebar/></ToastProvider>` wrap 후 **고정 문구 텍스트 단정**(role=alert 일반 단정은 인라인 오류와 혼선 → 텍스트로). mutation 비401 reject → 트리 findByText 유지 + 인라인 문구 부재 + 토스트 문구 present + 재시도 클릭→mutation 재호출(AC-B11). 401 reject → pushMock('/login') + 문구 부재. 라우팅/로그아웃/테마는 pushMock·`vi.mock('@/src/lib/auth/logout')`·useTheme 실제(jsdom dataset) 검증. **SHARED+open 케이스는 `listMembers` 목 필수 등록**(미처리 호출 방지). AC-A8/A9(로그아웃 라우팅)·AC-A3 onNavigate·AC-B10은 이 레이어에서 검증.
- **MembersModal(4)**: ToastProvider wrap + `window.alert` 스파이 미호출 + role=alert 문구, 401 pushMock. 모의: users/members/invitations/next-navigation.

## 리스크
- **Sidebar god-component 팽창**: 그룹 로직(groups.ts)·멤버 조회(usePaletteMembers) 분리로 완화. 액션 배선은 인라인(Q1) — 후속 변경비용 인지.
- **방향키 재구성 회귀**: 단일 리스트→flat 전역 순회 교체가 핵심 회귀 구간. 기존 페이지-only 케이스 + 신규 크로스 케이스 둘 다 green 필수.
- **members 지연 로드 시 activeIndex 이동**: 팔레트 열린 채 사람 그룹이 뒤늦게 삽입되면 하이라이트가 밀릴 수 있음(AC 없음). 허용하되 인지.
- **토스트/인라인 role=alert 혼선**: 토스트 검증은 텍스트 단정로 회피(전략 반영).

## 비고 (범위 밖 / 한계)
- mutation 성공 후 `loadTree` 재조회 실패는 기존 인라인 오류(setStatus)로 폴백 — "성공 후 재조회 실패" UX는 토스트가 아님(결정 5, 한계로 수용).
- 전용 멤버 프로필 페이지 없음 — 사람 선택은 항상 `/workspace/{wsId}/members`.
- 사람 후보 본인 미제외, 멤버 목록 캐시 공유 없음(PRD 비고 준수).

---

## Testability 평가 (test-architect)

### 컴포넌트별 테스트 전략
- **groups.ts (순수)**: 단위 — render 없이 buildCommandCandidates(workspace null/PERSONAL/SHARED × actions 유무)·assembleGroups(vi.fn onSelect 심은 그룹으로 필터/빈 그룹 제거/flat 순서). 모의 0. 완전 격리. AC-A1/A2/A10/A11/A13/A14/A15/A22, BR-A1.
- **usePaletteMembers (훅)**: 단위 — renderHook + listMembers 목 + next/navigation 목. 성공/401(push '/login')/비401([]유지)/닫힘·ws변경 리셋. **로딩은 지연 프라미스 전이**로 검증. AC-A18/A19/A20.
- **CommandPaletteContainer**: 단위 — 신규 props vi.fn 주입. 명령/사람 클릭→콜백+onClose. 방향키는 flat 기준 **Enter-프록시**. loading→"불러오는 중…"만. AC-A3~A7/A10~A17/A21~A23(A8/A9는 onLogout+onClose까지).
- **Sidebar**: 통합 — 기존 목 + ToastProvider wrap. mutation 비401→트리 유지+토스트+재시도, 401→push. 로그아웃/onNavigate/B10은 이 레이어. AC-A8/A9/A12/B4~B11.
- **MembersModal**: 신규 파일 — ToastProvider wrap + window.alert 스파이. AC-B1/B2/B3.

### Testability Score: 9/10
순수 함수 추출 + 훅 분리 + 콜백 주입형 컨테이너 + 실제 ToastProvider wrap 관용으로 강결합·전역상태·static 의존 없음. 감점 1: members `[]` 과다 수렴(로딩/빈 내부 구분 불가 — 관찰 계약상 무해), aria-selected 부재로 AC-A16을 Enter-프록시로 검증, 신규 테스트 셋업.

### 판정
✅ **9 ≥ 7 → TESTABILITY PASS.** RGR 진입 가능. 반영 완료: (1) usePaletteMembers 리셋·세대가드(MUST-ADDRESS), (2) AC-A18 지연 프라미스, (3) AC-A16/17 Enter-프록시, (4) 컨테이너 loading→groups 비움 게이팅, (5) 로그아웃/라우팅은 Sidebar 레이어 검증.
