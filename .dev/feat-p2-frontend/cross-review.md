# Cross-Review 결과

- advisor: claude (메인 오케스트레이터 직접 — 서브에이전트 idle-실패로 폴백)
- 브랜치: feat/p2-frontend (base: main)
- DEV_DIR: .dev/feat-p2-frontend
- 실행: 2026-06-18
- 주의: 구현자 = 검증자(독립성 제한). review.md/trust-ledger를 의심하고 적대적으로 재검증함.

## AC 충족 매트릭스

| AC | 충족 | 근거 |
|----|------|------|
| AC-1 listWorkspaces GET+credentials+파싱 | O | workspaces.test.ts |
| AC-2 getPageTree 중첩 보존 | O | pages.test.ts |
| AC-3 createPage POST+본문 | O | pages.test.ts |
| AC-4 Zod 위반 throw | O | workspaces.test.ts |
| AC-5 워크스페이스 2개 표시 | O | Sidebar.test.tsx |
| AC-6 트리 중첩 렌더 | O | PageTree.test.tsx |
| AC-7 펼침/접힘 토글 | O | PageTree.test.tsx |
| AC-8 페이지 클릭 네비 | O | PageTree.test.tsx |
| AC-9 새 페이지 생성→재조회→이동 | **부분** | Sidebar.test.tsx — **최상위 생성만 검증·구현. M4의 "하위 페이지 생성"은 미구현(신규위험 W2)** |
| AC-10 워크스페이스 전환 재조회 | O | Sidebar.test.tsx |
| AC-11 빈 상태 | O | PageTree/Sidebar.test |
| AC-12 에러 상태 | O | Sidebar.test.tsx |
| AC-13 401→로그인 | O | Sidebar.test.tsx |
| AC-14 랜딩 워드마크/h1/CTA | O | landing.test.tsx |
| AC-15 로그인 OAuth 링크 | O | login.test.tsx |
| AC-16 앱 셸 다크/landmark | O | app-shell.test.tsx |

[Must] M1·M2·M3·M5·M6·M7·M8·M9 충족, **M4 부분**(최상위만, 하위 미구현). [Should] S1·S2 충족, **S3(모바일 드로어) 미충족**. 16 AC는 테스트 통과하나 AC-9가 M4 "하위"를 검증하지 않아 갭을 가림.

## 설계 범위 이탈

실질 이탈 없음(경미):
- 도메인 API 경로 `src/lib/api/{workspaces,pages}.ts` → `src/lib/{workspaces,pages}.ts` 로 변경. `api.ts` 파일 vs `api/` 디렉토리 충돌 회피. 동일 모듈, state.md에 기록됨.
- `tsconfig.json`에 `lib: DOM/DOM.Iterable` 추가(웹 앱 필수 인프라) + Next 빌드가 `allowJs/incremental` 자동 추가. 설계서에 명시 안 됐으나 빌드 성립에 필요.

## 신규 위험

(review.md/trust-ledger에 없는 항목만)

### Warning
- **[GAP] S3 모바일 사이드바 드로어 미구현** — `Sidebar.tsx` / `app/(app)/layout.tsx`
  - 근거: PRD Should "S3 모바일 사이드바 드로어 토글" + 디자인(`IEUM App.dc.html` 모바일 드로어/햄버거). 그러나 두 파일에 반응형 클래스(`sm:`/`md:`/`hidden`/드로어/햄버거)가 **전무**. 사이드바는 항상 고정 `w-[300px]` aside → 모바일에서 본문이 과도하게 압축됨. **review.md는 "[Should] 3/3 충족"으로 과대 보고**했다(실제 2/3).
  - 권고: ① 모바일 드로어(햄버거 토글 + 오버레이) 구현, 또는 ② review.md/trust-ledger를 "S3 다음 사이클 연기"로 정정해 보고 정합성 확보.
- **[GAP] 하위 페이지 생성 UI 미구현 (M4 "하위" 부분)** — `NewPageButton.tsx` / `PageTreeNode.tsx`
  - 근거: PRD Must M4 "새 페이지 생성(**최상위/하위**)". 구현은 `NewPageButton`(인자 없는 onCreate) → `handleCreate`가 항상 `parentPageId: null`. 디자인의 트리 행별 hover '+' (하위 추가)·'⋯'(메뉴)가 `PageTreeNode`에 없음. AC-9는 최상위만 단언해 갭을 검출 못 함.
  - 권고: 트리 노드에 '하위 추가(+)' 액션 + `onCreateChild(parentId)` 추가, 또는 M4 범위를 "최상위 생성"으로 PRD 정정.

### Info
- **[RISK] 새 페이지 position = pages.length(루트 개수)** — `Sidebar.tsx:77`
  - 근거: 신규 페이지 position을 루트 개수로 부여. 기존 페이지 position이 0..n-1이 아니면(예: gap 기반 0/1000/2000) 새 페이지가 **맨 끝이 아닌 중간/앞**에 정렬될 수 있음. 백엔드는 클라이언트 position을 그대로 저장(D1).
  - 권고: `position = (기존 루트 최대 position) + 1`(또는 +1000 gap). 본 UI가 유일 생성자이고 빈 DB부터 0,1,2…면 현재는 무해.
- **[GAP] (app) SSR 인증 가드 부재** — `app/(app)/layout.tsx`
  - 근거: 미인증 사용자가 `/dashboard` 진입 시 앱 셸이 렌더된 뒤 클라이언트 401 → `/login` 리다이렉트(셸 flash). 서버측 `auth()` 가드(layout TODO[Phase 1])는 범위 밖이었음.
  - 권고: P1 프론트 auth 와이어링 사이클에서 미들웨어/레이아웃 세션 가드 추가.
- **[GAP] workspaces=[] 빈 상태 안내 부적합** — `Sidebar.tsx`
  - 근거: 워크스페이스가 0건이면 스위처가 빈 채로 그려지고 트리는 "페이지가 없습니다"만 표시(워크스페이스 자체 부재 안내 아님). P1 개인 WS 자동생성으로 실제 발생 가능성은 낮음.
  - 권고: 0건 분기 안내 추가(낮은 우선순위).

## references 위반

references/ 디렉토리 없음 → 해당 없음.

## 총평
- 강점: 16 AC 테스트 통과 + tsc 0/build 성공으로 기능 골격은 견고. 3계층 분리로 데이터/표현 격리 명확, Zod 런타임 경계.
- 합산: Critical 0, **Warning 2**(S3 드로어·M4 하위), Info 3.
- 권고: **W1(S3 드로어)·W2(하위 생성)는 "구현" 또는 "PRD/review 정정" 중 택1로 보고 정합성을 맞추는 것이 우선**. I1(position)은 저비용 수정 권장. review.md의 "Should 3/3·M4 충족" 표현은 실제와 어긋나므로 정정 필요.

## 처리 결과 (사용자 결정: W1·W2·I1 전부 수정)

- **W1 [Warning] 수정됨** — 모바일 드로어 구현. `AppShell.tsx`(신규) 클라이언트 셸: 데스크탑 고정 사이드바 / 모바일 햄버거 토글 + 오버레이 + 슬라이드 드로어. `(app)/layout.tsx`가 `AppShell` 사용. RED(AppShell W1: 햄버거 aria-expanded 토글)→GREEN. **S3 충족(3/3)**.
- **W2 [Warning] 수정됨** — 하위 페이지 생성 구현. `PageTreeNode`에 행별 "하위 추가(＋)" 버튼(hover 노출) + `onCreateChild`. `Sidebar.handleCreate(parentId)`가 `parentPageId` 설정. RED(PageTree W2 + Sidebar W2)→GREEN. **M4 "최상위/하위" 완전 충족**.
- **I1 [Info] 수정됨** — `handleCreate` position = 형제 최대 position + 1(없으면 0). 최상위/하위 모두 적용. RED(Sidebar I1: position 1001)→GREEN.
- **I2·I3 [Info] 백로그** — (app) SSR 인증 가드는 P1 프론트 auth 사이클, 빈 워크스페이스 안내는 발생가능성 낮아 다음 사이클.

검증: 전체 **22 테스트 통과**(17→+5), `tsc --noEmit` 0 error, `next build` 성공. (커밋 별도)
