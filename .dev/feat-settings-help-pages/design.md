# 설계서: AccountMenu 설정·도움말 페이지 구현 및 배선

## 설계 규모
**중형** — 신규 페이지 2개 + 테마 로직 공유 훅 추출 + 기존 AccountArea 배선/리팩터(회귀 주의) + 테스트.

## 확정 스코프
설정=계정정보(이름/이메일 읽기전용)+테마전환+로그아웃 / 도움말=앱 소개(정적, 단축키 미노출) / 전체 페이지 이동 / 둘 다 로그인 필요((app) 그룹, 401→/login).

## 변경 범위
### 신규 파일
- `apps/web/src/lib/theme/useTheme.ts` — 테마 상태/토글 공유 훅(DOM dataset + localStorage 'ieum-theme' 캡슐화)
- `apps/web/app/(app)/settings/page.tsx` — 설정 페이지(client)
- `apps/web/app/(app)/help/page.tsx` — 도움말 페이지(client)
- `apps/web/src/lib/theme/__tests__/useTheme.test.ts`
- `apps/web/app/(app)/__tests__/settings.test.tsx`
- `apps/web/app/(app)/__tests__/help.test.tsx`
### 수정 파일
- `apps/web/components/sidebar/AccountArea.tsx` — 핸들러 배선(push('/settings')·push('/help')) + 테마 로직을 useTheme로 대체
- `apps/web/components/sidebar/__tests__/AccountArea.test.tsx` — "설정 no-op" 기대값 변경 + 도움말 이동 테스트 추가

## 상세 설계

### 1. src/lib/theme/useTheme.ts (신규) — 테마 공유 훅
AccountArea의 테마 로직(`:21,36,71-80`)을 추출. `export function useTheme(): { theme: '다크'|'라이트'; toggleTheme: () => void }`. 마운트 effect에서 `document.documentElement.dataset.theme` 기준 라벨 동기화(초기 '다크'), toggleTheme: dataset 반전 + localStorage 'ieum-theme' 저장(try/catch 무시) + 라벨 갱신. document 접근은 effect/핸들러 내부만. 라벨 타입은 AccountMenu theme prop('다크'|'라이트')과 일치.

**★critic 반영 — 인스턴스 간 라벨 동기화**: useTheme는 React 상태가 인스턴스별이라, /settings에서 토글 시 사이드바 AccountArea 배지가 stale('다크')로 남는 문제가 있다(DOM/localStorage만 공유). 이를 **경량 pub/sub**로 해결한다:
- `toggleTheme` 실행 시 `window.dispatchEvent(new Event('ieum-theme-change'))`를 발행한다(dataset 반전·localStorage 저장 이후).
- 각 useTheme는 마운트 effect에서 `window`의 `'ieum-theme-change'`를 구독하여, 이벤트 수신 시 현재 `dataset.theme` 기준으로 라벨을 재동기화한다(cleanup에서 해제).
- 결과: 어느 화면에서 토글해도 모든 useTheme 인스턴스(설정 페이지·사이드바 배지)가 즉시 일관된 라벨을 표시한다. jsdom에서 `window.dispatchEvent`/`addEventListener`로 결정론적 테스트 가능.

### 2. AccountArea.tsx (수정) — 배선 + 테마 훅 소비
- `const { theme, toggleTheme } = useTheme();`로 교체(기존 useState/handleToggleTheme/effect setTheme 제거). getCurrentUser effect는 유지.
- `handleSettings = () => router.push('/settings');`
- `handleHelp = () => router.push('/help');`
- AccountMenu에 `theme={theme}` `onToggleTheme={toggleTheme}` 전달(prop 이름 불변).
- 회귀: 기존 테마 토글 테스트(`:66-77`)는 동작 보존이므로 무수정 통과해야 함.

### 3. app/(app)/settings/page.tsx (신규) — 설정 페이지
dashboard 패턴 client 페이지. `useTheme()` + `getCurrentUser()`.
- 마운트 effect: getCurrentUser → {name,email} + status='ready'. catch → 401이면 push('/login'), 그 외 status='error'(오류 문구).
- 계정 정보: **읽기전용 텍스트만**(input/저장버튼 없음 — BR-1/AC-4).
- 테마 전환 버튼: toggleTheme() + 현재 라벨 표시.
- 로그아웃 버튼: `await logout(); router.push('/login')`(실패 무시).
- 렌더 분기: loading(text-faint) / error(role=alert text-danger) / ready.
- state: `account: {name,email}|null`, `status: 'loading'|'ready'|'error'`.

### 4. app/(app)/help/page.tsx (신규) — 도움말 페이지
정적 앱 소개. AC-9 위해 인증 가드 필요(AppShell은 401 삼킴 → 페이지가 getCurrentUser로 가드).
- 마운트 effect: getCurrentUser 성공 → ready. catch → 401이면 push('/login'), 비-401은 정적 콘텐츠 노출(ready).
- ready 렌더: 앱 소개 제목/설명 정적 텍스트. **단축키(⌘K) 미노출**(BR-2/AC-8).
- state: `status: 'loading'|'ready'`.

## 구현 순서
1. useTheme 훅 + 단위 테스트 (의존: 없음)
2. AccountArea 배선 + useTheme 소비 + 테스트 수정/추가 (의존: 1)
3. settings/page.tsx + 테스트 (의존: 1)
4. help/page.tsx + 테스트 (의존: 없음)
- 병렬: 1 완료 후 2·3 병렬(다른 파일). 4는 useTheme 미사용이라 처음부터 병렬.

## 적용 컨벤션
- 'use client' + 한국어 주석 블록. `@/` alias. useEffect active 가드 + cleanup. `type Status='loading'|'ready'|'error'`. 401: `if (e instanceof ApiError && e.status===401) { router.push('/login'); return; }`(ApiError from `@/src/lib/api`). 에러: `<p role="alert" text-danger>`.
- 테스트 mock: vi.hoisted pushMock + vi.mock('next/navigation'), vi.mock('@/src/lib/users'), vi.mock('@/src/lib/auth/logout'). 테마는 실제 jsdom document/localStorage(beforeEach에서 dataset.theme 삭제 + localStorage.clear).

## 하위 호환
- AccountMenu prop 계약(onSettings/onHelp/onToggleTheme/theme) 불변. useTheme 라벨 Korean 유지 → 배지 회귀 방지.
- (app)/layout.tsx 무변경(신규 라우트 자동 포함).

## 설계 결정 확정 (design Q&A)
- Q1 테마 공유: **useTheme 훅 추출**(AccountArea·settings 공유 + pub/sub 동기화).
- Q2 도움말 비-401 실패: **정적 콘텐츠 노출**(401만 /login).
- Q3 로그아웃 재사용: **인라인 유지**(2줄 중복 허용).

## Testability 평가 (test-architect) — Score 9/10 ✅ PASS
- useTheme: renderHook, 실제 jsdom document/localStorage(beforeEach 정리) + setItem 예외 스파이. AC-5.
- AccountArea: useTheme 미모의(실제) → 기존 테마 회귀 테스트 무수정 통과가 리팩터 게이트. next/navigation·users·logout 모의. AC-1/2.
- settings: getCurrentUser/logout/next-nav 모의, **@/src/lib/api 미모의(실제 ApiError 401)**. AC-3/4/5/6/9.
- help: next-nav·users 모의, ApiError 미모의. AC-7/8/9.
- 구현 주의: (1) AC-4/AC-8 부재 단언 셀렉터를 명시적으로 고정(textbox/저장버튼/⌘K 부재), (2) ApiError는 미모의로 실제 인스턴스 reject, (3) useTheme 초기 라벨 동기화는 act/waitFor 필요.

## critic CONSIDER 처리
- [반영] 테마 배지 inter-view stale → useTheme pub/sub 동기화(위 1절).
- [수용] 테마 새로고침 미복원(localStorage 읽어 복원하는 init 없음) → 범위 밖(별도 후속). 설정에서 토글해도 새로고침 시 dark 초기화됨을 인지.
- [수용] 도움말 비-401(네트워크/5xx) 실패 시 정적 콘텐츠 노출 → Q2 트레이드오프(로그인 필수는 401에 한해 보장).

## 참고(탐색 추가)
- app/layout.tsx:15 `<html data-theme="dark">` 기본. localStorage 테마 복원 init 스크립트 없음(새로고침 복원 미구현, 범위 밖).
- globals.css:27 `[data-theme='light']` 토큰. api.ts:21-29 ApiError.
