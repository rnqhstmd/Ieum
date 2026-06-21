# PRD — P2 프론트엔드 (사이드바 + 랜딩/로그인)

- 브랜치: feat/p2-frontend (base: main)
- 작성: 2026-06-18
- 모드: normal (전체 파이프라인)
- 참조 디자인: `design/screens/IEUM App.dc.html`, `IEUM Landing.dc.html`, `IEUM Login.dc.html`, `IEUM States.dc.html` + `design/spacex-DESIGN.md`(토큰) + `design/screen-prompts.md`(화면별 스펙)

## 배경

P1(인증·권한)·P2 백엔드(페이지 생성/트리 조회, 워크스페이스 목록)가 머지 완료(PR #3/#4)됐다. 프론트(`apps/web`, Next.js 15 App Router + React 19 + Tailwind + vitest)는 scaffold만 존재하고 `(app)/layout.tsx`의 사이드바·`app/page.tsx`(랜딩)·`(auth)/login`은 placeholder다. 이번 사이클은 **이미 머지된 API로 완전히 뒷받침되는 사이드바 walking skeleton**과 **랜딩/로그인 IEUM 디자인 재구성**을 구현한다.

## 목표

로그인한 사용자가 (1) 내 워크스페이스를 보고 전환하며, (2) 페이지 트리를 중첩 구조로 탐색하고, (3) 새 페이지를 만들 수 있는 앱 셸을, IEUM 다크 디자인 시스템으로 제공한다. 비로그인 사용자에겐 IEUM 디자인의 랜딩·로그인을 제공한다.

## 범위

### 포함 (IN)
- `Sidebar` 컴포넌트군: 워크스페이스 스위처(목록+전환), 페이지 트리(중첩 펼침/접힘+네비), "새 페이지", 계정 영역(정적)
- 도메인 API 클라이언트(목록/트리/생성) + 타입 + Zod 런타임 검증
- IEUM 다크 디자인 시스템 토큰(CSS 변수 + Tailwind theme) + Pretendard, `(app)` 셸 적용
- 랜딩(`app/page.tsx`) IEUM 재구성: full-bleed 다크 히어로 + 대문자 헤드라인 + 고스트 pill CTA + 오버레이 nav + 제품 밴드 + footer
- 로그인(`(auth)/login`) IEUM 재구성: black canvas + 워드마크 + 고스트 pill "Google로 로그인"(OAuth 링크 유지)
- 빈/로딩/에러 상태, 401 → 로그인 유도, 모바일 사이드바 드로어

### 제외 (OUT — 다음 사이클)
- 이름변경·아카이브·새 워크스페이스 생성 (백엔드 `updatePage`/`archivePage`/`createWorkspace` 스텁 미구현) — **사용자 확정**
- 블록 에디터(P3), 실시간 presence/커서(P4·P5), 기능형 검색 ⌘K, position 드래그 재정렬(P8)

## 요구사항 (MoSCoW)

**Must**
- M1 사이드바가 내 워크스페이스 목록 표시 + 전환 (US-WS-03)
- M2 선택 워크스페이스의 페이지 트리 중첩 표시 + 펼침/접힘 (US-PAGE-03, US-PAGE-02)
- M3 페이지 클릭 시 `/page/{id}` 이동 (US-PAGE-03)
- M4 "새 페이지" 생성(최상위/하위) (US-PAGE-01/02)
- M5 도메인 API 클라이언트(목록/트리/생성) + 타입 + Zod 검증
- M6 미인증(401) 시 로그인 유도 (AC-AUTH-05 연계)
- M7 IEUM 다크 디자인 시스템 앱 셸 적용
- M8 랜딩 IEUM 디자인 재구성
- M9 로그인 IEUM 디자인 재구성(OAuth 링크 유지)

**Should**
- S1 빈 워크스페이스 빈 상태 UI
- S2 로딩/에러 상태 UI
- S3 모바일 사이드바 드로어 토글

**Could**
- C1 계정 영역(현재 사용자 정적 표시)
- C2 검색 입력 placeholder(비기능)

**Won't (이번 사이클)**
- W1 이름변경/아카이브/새 워크스페이스  W2 블록 에디터  W3 presence/커서  W4 기능형 검색  W5 드래그 재정렬

## 수용 기준 (Given-When-Then — 자동 테스트 대상)

### API 클라이언트 (vitest, fetch 모킹)
- **AC-1 (M5)** Given 세션 쿠키 환경, When `listWorkspaces()`, Then `GET ${BASE}/api/workspaces`를 `credentials:'include'`로 요청하고 응답을 `Workspace[]`로 파싱한다.
- **AC-2 (M5)** Given getPageTree 응답이 중첩 children 포함, When `getPageTree(wsId)`, Then `GET ${BASE}/api/workspaces/{wsId}/pages` 요청하고 `Page[]`(children 보존)로 파싱한다.
- **AC-3 (M5)** Given 유효한 CreatePageRequest, When `createPage(wsId, req)`, Then `POST ${BASE}/api/workspaces/{wsId}/pages`에 JSON 본문으로 요청하고 생성된 `Page`를 반환한다.
- **AC-4 (M5)** Given 서버가 스키마 위반 응답(필수 필드 누락), When 파싱, Then Zod 검증 에러를 던진다.

### 사이드바 / 트리 (RTL + jsdom, api 모듈 모킹)
- **AC-5 (M1)** Given listWorkspaces가 2개 반환, When Sidebar 마운트, Then 두 워크스페이스 이름이 모두 표시된다.
- **AC-6 (M2)** Given getPageTree가 부모 A{자식 B, 자식 C} 반환, When 렌더 + A 펼침, Then 최상위 A 1개와 들여쓰기된 B·C가 표시된다.
- **AC-7 (M2)** Given 자식을 가진 부모 노드, When 펼침/접힘 토글(chevron) 클릭, Then 자식 가시성이 토글된다.
- **AC-8 (M3)** Given 페이지 행, When 클릭, Then `/page/{id}` 경로로 네비게이션한다(router.push 호출).
- **AC-9 (M4)** Given 워크스페이스 선택됨, When "새 페이지" 클릭, Then `createPage(wsId, …)`가 호출되고 성공 시 트리에 반영(재조회)되거나 새 페이지로 이동한다.
- **AC-10 (M1)** Given 다른 워크스페이스 선택, When 스위처에서 전환, Then 해당 워크스페이스의 트리를 다시 조회해 표시한다.
- **AC-11 (S1)** Given 페이지 0건, When 트리 렌더, Then 빈 상태 안내("페이지가 없습니다" 등)가 표시된다.
- **AC-12 (S2)** Given API가 에러를 던짐, When 트리 렌더, Then 에러 상태가 표시되고 트리는 렌더되지 않는다.
- **AC-13 (M6)** Given API가 401(ApiError status=401), When 목록/트리 조회 실패, Then 로그인 경로로 유도된다(리다이렉트 또는 명시적 안내 + 로그인 링크).

### 랜딩 / 로그인 (RTL)
- **AC-14 (M8)** Given 랜딩 페이지, When 렌더, Then 'IEUM' 워드마크 + 헤드라인 + 고스트 pill CTA(로그인/시작 진입점)가 존재한다.
- **AC-15 (M9)** Given 로그인 페이지, When 렌더, Then "Google로 로그인" CTA의 href가 `${API_URL}/oauth2/authorization/google`이다.

### 디자인 시스템 (최소 단언 — 세부 충실도는 quality 리뷰)
- **AC-16 (M7)** Given `(app)` 셸, When 렌더, Then 다크 디자인 토큰이 적용된다(다크 배경 컨테이너 + `<nav>`/`role` 사이드바 landmark 존재).

## 확정사항 (Decisions)

- **D1** 데이터 페칭 = 클라이언트 컴포넌트(CSR) + 기존 `src/lib/api.ts` fetch 래퍼(`credentials:'include'`). SSR 쿠키 포워딩 회피, 상호작용/테스트 용이. (페이지 < 2s 비기능은 P3에서 측정)
- **D2** 테스트 = vitest + `@testing-library/react` + `@testing-library/jest-dom` + jsdom. `apps/web/vitest.config.ts`(+setup) 추가. API는 모듈 모킹, 컴포넌트는 RTL, 라우터는 `next/navigation` 모킹.
- **D3** 폰트 = Pretendard(디자인 실제 사용). 디자인 토큰을 CSS 변수 + Tailwind `theme.extend`로 노출. `(app)`·랜딩·로그인 다크 기본.
- **D4** 범위 = 사이드바 + 랜딩/로그인 (사용자 확정).
- **D5** 트리 액션 = 읽기+생성만 (사용자 확정). rename/archive/새 워크스페이스 제외.
- **D6** 라우팅 = 페이지 클릭 → 기존 `(app)/page/[pageId]` 경로. 새 페이지 생성 후 해당 페이지로 이동.
- **D7** 기본 워크스페이스 = 응답 중 PERSONAL 우선, 없으면 첫 번째.
- **D8** API 베이스 URL = `NEXT_PUBLIC_API_URL`(기본 `http://localhost:8080`), 기존 래퍼 재사용.

## 트레이서빌리티

| 요구 | 로드맵 | AC |
|------|--------|-----|
| M1 워크스페이스 목록/전환 | US-WS-03 | AC-5, AC-10 |
| M2 페이지 트리 | US-PAGE-03, US-PAGE-02 | AC-6, AC-7 |
| M3 페이지 이동 | US-PAGE-03 | AC-8 |
| M4 새 페이지 | US-PAGE-01/02 | AC-9 |
| M5 API 클라이언트 | (기반) | AC-1~4 |
| M6 401 처리 | AC-AUTH-05 | AC-13 |
| M7 디자인 시스템 | (UX) | AC-16 |
| M8 랜딩 | screen-prompts §1 | AC-14 |
| M9 로그인 | screen-prompts §2 | AC-15 |
