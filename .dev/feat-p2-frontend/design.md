# 설계서 — P2 프론트엔드 (사이드바 + 랜딩/로그인)

- 브랜치: feat/p2-frontend (base: main)
- 대상: `apps/web` (Next.js 15 App Router · React 19 · Tailwind 3 · vitest)

## 1. 아키텍처 개요

3계층으로 분리해 격리/테스트 가능성을 확보한다.

```
[표현]  components/sidebar/* (RTL)  ·  app/page.tsx · (auth)/login · (app)/layout (RTL)
   │  props / 콜백
[데이터] src/lib/api/workspaces.ts · pages.ts  (fetch 모킹 단위 테스트)
   │  apiGet/apiPost (기존 래퍼, credentials:'include')
[계약]  src/lib/types.ts · src/lib/schemas.ts (Zod 런타임 검증)
```

데이터 페칭은 **CSR 클라이언트 컴포넌트**(D1). `Sidebar`가 상태(workspaces/selected/pages/loading/error)를 소유하고, 하위는 순수 props 컴포넌트로 둬 RTL 단위 테스트를 쉽게 한다.

## 2. 변경 범위 (이탈 점검 기준)

### 신규
- `src/lib/types.ts` — Workspace/Page/CreatePageInput 타입
- `src/lib/schemas.ts` — Zod 스키마(workspace, page[재귀], 배열)
- `src/lib/api/workspaces.ts` — `listWorkspaces()`
- `src/lib/api/pages.ts` — `getPageTree(wsId)`, `createPage(wsId, input)`
- `components/sidebar/Sidebar.tsx` (`'use client'`) — 컨테이너(상태/페칭/로딩·에러·401)
- `components/sidebar/WorkspaceSwitcher.tsx` — 목록+전환(props)
- `components/sidebar/PageTree.tsx` — 트리 루트+빈 상태(props)
- `components/sidebar/PageTreeNode.tsx` — 재귀 노드(펼침/접힘/네비)
- `components/sidebar/NewPageButton.tsx` — 고스트 pill
- `components/sidebar/AccountArea.tsx` — 계정 정적 표시
- 테스트: `src/lib/api/__tests__/{workspaces,pages}.test.ts`, `components/sidebar/__tests__/{Sidebar,PageTree}.test.tsx`, `app/__tests__/{landing,login}.test.tsx`, `app/(app)/__tests__/app-shell.test.tsx`
- 설정: `apps/web/vitest.config.ts`, `apps/web/vitest.setup.ts`

### 수정
- `app/layout.tsx` — `data-theme="dark"`, Pretendard, 다크 base
- `app/globals.css` — IEUM 디자인 토큰 CSS 변수(dark/light)
- `tailwind.config.ts` — colors(토큰 매핑) + fontFamily Pretendard
- `app/(app)/layout.tsx` — placeholder `<aside>` → `<Sidebar />`, 다크
- `app/page.tsx` — 랜딩 IEUM 재구성
- `app/(auth)/login/page.tsx` — 로그인 IEUM 재구성
- `package.json` — devDeps(@testing-library/react·jest-dom·user-event, jsdom, @vitejs/plugin-react)

신규 백엔드/DB 변경 0. 기존 API 무변경.

## 3. 인터페이스

### 타입 (src/lib/types.ts)
```ts
export type WorkspaceType = 'PERSONAL' | 'SHARED';
export interface Workspace { id: string; name: string; type: WorkspaceType; ownerId: string; createdAt: string; }
export interface Page {
  id: string; workspaceId: string; parentPageId: string | null;
  title: string; icon: string | null; position: number; createdById: string;
  createdAt: string; updatedAt: string; children: Page[] | null;
}
export interface CreatePageInput { parentPageId: string | null; title: string; icon?: string | null; position: number; }
```

### Zod (src/lib/schemas.ts)
- `workspaceSchema` → Workspace, `workspaceListSchema = z.array(...)`
- `pageSchema: z.ZodType<Page> = z.lazy(() => z.object({ …, children: z.array(pageSchema).nullable() }))`
- 파싱은 데이터 계층에서 `schema.parse(json)` — 위반 시 ZodError throw (AC-4).

### API 도메인 (src/lib/api/*)
```ts
listWorkspaces(): Promise<Workspace[]>            // GET /api/workspaces
getPageTree(wsId: string): Promise<Page[]>        // GET /api/workspaces/{wsId}/pages
createPage(wsId: string, input: CreatePageInput): Promise<Page>  // POST 〃
```
기존 `apiGet/apiPost`(credentials:'include') 위임 후 Zod 파싱.

### 컴포넌트 props
- `WorkspaceSwitcher({ workspaces, currentId, onSelect(id) })`
- `PageTree({ pages, onNavigate(pageId) })` — pages=[] 시 빈 상태
- `PageTreeNode({ page, depth, onNavigate })` — 자식 있으면 chevron + 토글(local expanded state)
- `NewPageButton({ onCreate() })`
- `AccountArea({ name?, email? })`
- `Sidebar({})` — 마운트 시 listWorkspaces → 기본(PERSONAL 우선, D7) 선택 → getPageTree. 전환/생성/401 처리.

### 라우팅/네비
- `next/navigation` `useRouter().push('/page/{id}')` (AC-8), 401 시 `push('/login')` (AC-13).

## 4. 디자인 토큰 매핑 (design/screens/IEUM App.dc.html :root 기준)

CSS 변수(globals.css) → Tailwind colors:
`--c-surface #0a0a0a`(surface) · `--c-deep #000`(deep) · `--c-hover #16161b`(hover) · `--c-hair #3a3a3f`(hair)/`#242429`(hair-2)/`#1d1d22`(hair-3) · 텍스트 `--c-text #f0f0fa`(ink)/`--c-body #c8c8ce`(body)/`--c-faint #6a6a70`(faint)/`--c-label #4a4a50`(label) · `--c-accent #6fd6e8` · `--c-ok #79e0a0`. light 변형 동시 정의(`[data-theme="light"]`).
폰트 Pretendard CDN(디자인 동일) 또는 `font-sans`. 사이드바 폭 300px, 들여쓰기 16px/depth, 고스트 pill radius 32px.

## 5. 구현 순서 (RGR 태스크)

- **T0 (infra)**: vitest.config(jsdom)+setup+devDeps. (RGR 전 선행 — 첫 RED 실행 환경)
- **T1 (AC-1~4)**: 계약(types/schemas) + API 도메인. RED: api 테스트(fetch 모킹) → GREEN.
- **T2 (AC-5,10,11,12,13)**: Sidebar 컨테이너 + WorkspaceSwitcher(목록/전환/빈/에러/401). RED → GREEN.
- **T3 (AC-6,7,8)**: PageTree + PageTreeNode(중첩/토글/네비). RED → GREEN.
- **T4 (AC-9)**: 새 페이지 생성 흐름. RED → GREEN.
- **T5 (AC-14,15)**: 랜딩 + 로그인 IEUM 재구성. RED → GREEN.
- **T6 (AC-16)**: 앱 셸 다크 토큰 + 토큰/Tailwind/레이아웃 + Sidebar 통합. RED → GREEN.
- **REFACTOR**: 중복(행 스타일/토큰) 정리, GREEN 유지.

## 6. Testability 평가

| 컴포넌트 | 단위 전략 | 모의 전략 | score |
|----------|-----------|-----------|-------|
| API 도메인(workspaces/pages) | `global.fetch` 모킹 후 URL/method/credentials/파싱 단언 | `vi.spyOn(global,'fetch')` | 9/10 |
| Zod 스키마 | 정상/위반 입력 parse 단언 | 없음(순수) | 10/10 |
| Sidebar 컨테이너 | RTL 마운트 → `findBy`로 비동기 로드 검증, 전환/401 콜백 | `vi.mock('@/lib/api/*')`, `vi.mock('next/navigation')` | 8/10 |
| PageTree/Node | RTL 렌더 + `user-event` 토글/클릭 | router push 스파이 | 8/10 |
| 랜딩/로그인 | RTL 렌더 + href/텍스트 단언 | 없음 | 9/10 |
| 디자인 토큰/셸 | 구조 단언(다크 컨테이너·landmark 존재) — 픽셀 충실도는 quality 리뷰 | 없음 | 6/10 |

**종합 testability: 8/10 → PASS (≥7).**
근거: 3계층 분리로 데이터/표현이 격리되어 모킹 경계가 명확. 비동기 useEffect 로딩은 `findBy/waitFor`로 흡수. 약점은 디자인 시각 충실도(단위 테스트 부적합)이며 구조적 최소 단언 + quality 리뷰로 보완.

## 7. 리스크/주의

- **R1** 비동기 상태 로딩 테스트 flakiness → `findBy*`/`waitFor` 사용, act 경고 회피.
- **R2** `next/navigation` 모킹 누락 시 렌더 실패 → setup 또는 테스트별 모킹.
- **R3** Pretendard CDN 미로딩(오프라인) → font fallback 체인 유지(시스템 sans).
- **R4** 401 처리: 래퍼가 ApiError(status) throw → Sidebar에서 status===401 분기. 다른 에러는 에러 상태.
