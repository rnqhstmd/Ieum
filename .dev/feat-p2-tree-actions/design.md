# 설계: P2 잔여 — 이름변경·아이콘·아카이브 (백엔드+프론트)

## 설계 규모
**중형** — 백엔드 2 서비스 + 프론트 4 파일. 재귀 아카이브·부분갱신 의미 결정 존재.

## 변경 범위
| 파일 | 구분 | 내용 |
|------|------|------|
| backend `PageService.java` | 수정 | updatePage/archivePage 구현(스텁 교체) |
| backend `PageServiceTest.java` | 수정 | AC-B1~B11 Mockito 단위 테스트 추가 |
| backend `PageIntegrationTest.java` | 수정 | AC-I1~I3 e2e 추가 |
| `apps/web/src/lib/api.ts` | 수정 | `apiPatch` 추가 |
| `apps/web/src/lib/pages.ts` | 수정 | `updatePage`/`archivePage` 추가 |
| `apps/web/src/lib/types.ts` | 수정 | `UpdatePageInput` 추가 |
| `apps/web/components/sidebar/PageTreeNode.tsx` | 수정 | 행 액션(이름변경 인라인·아이콘·아카이브) |
| `apps/web/components/sidebar/PageTree.tsx` | 수정 | onRename/onSetIcon/onArchive 전달 |
| `apps/web/components/sidebar/Sidebar.tsx` | 수정 | 핸들러 3종(+confirm) + loadTree 재조회 |
| `apps/web/src/lib/__tests__/pages.test.ts` | 수정 | AC-F1/F2 |
| `apps/web/components/sidebar/__tests__/{PageTree,Sidebar}.test.tsx` | 수정 | AC-F3~F8 |

## 핵심 결정
### D1. updatePage 부분 갱신
`UpdatePageRequest{title, icon}`. **null=변경없음**(PATCH 의미). `title!=null`이면 `isBlank()` 검사(blank→IllegalArgument) 후 setTitle. `icon!=null`이면 setIcon. 멤버검사→findById(없으면 EntityNotFound)→workspaceId 일치 검사(불일치 IllegalArgument)→부분 적용→`save`→toDto. rename은 icon 미전달로 보존, set-icon은 title 미전달로 보존. (icon clear는 범위 밖)

### D2. archivePage 재귀
멤버검사→findById(없으면 EntityNotFound)→workspaceId 검사(불일치 IllegalArgument). 활성 목록 `findByWorkspaceIdAndArchivedAtIsNull(wsId)`로 parentPageId→children 맵 구성, 대상 id에서 BFS로 후손 수집(대상 포함). 각 `setArchivedAt(Instant.now())` 후 `saveAll(collected)`. createPage가 부모 사전 존재를 강제하므로 사이클 없음(유한).

### D3. apiPatch
api.ts에 `apiPatch<T>(path, body)` 추가(PUT과 동형, method 'PATCH'). pages.updatePage가 사용. archivePage는 기존 apiDelete<void> 사용(204 → undefined).

### D4. PageTreeNode 편집 상태
`editing: 'none'|'title'|'icon'` useState. 호버 액션 그룹(기존 '하위 추가' 패턴)에 버튼 3개 추가:
- 이름변경: `aria-label={`${title} 이름 변경`}` → editing='title'. title 자리에 `<input aria-label="페이지 이름" defaultValue=title>`. Enter→`commitRename`(trim, 비어있지않고 변경시 onRename(id,val)) + editing='none'; Escape→editing='none'(취소); blur→commit.
- 아이콘: 아이콘 span을 버튼화 `aria-label={`${title} 아이콘 변경`}` → editing='icon'. `<input aria-label="페이지 아이콘" defaultValue={icon??''}>`. Enter/blur→onSetIcon(id, val) (빈값이면 무시); Escape 취소.
- 아카이브: `aria-label={`${title} 아카이브`}` → onArchive(id).
- 콜백은 모두 optional(`?`) — 기존 PageTree 사용처 비파괴.

### D5. Sidebar 핸들러
- `handleRename(id,title)`: selectedWsId 가드 → `updatePage(ws,id,{title})` → `loadTree(ws)`; catch handleError.
- `handleSetIcon(id,icon)`: `updatePage(ws,id,{icon})` → loadTree.
- `handleArchive(id)`: `if(!window.confirm('이 페이지와 하위 페이지를 아카이브할까요?')) return;` → `archivePage(ws,id)` → loadTree; catch handleError.
- PageTree에 onRename/onSetIcon/onArchive 전달.

## 구현 순서 (RGR)
1. **T1 백엔드 updatePage** (AC-B1~B6): RED PageServiceTest → GREEN 구현 → REFACTOR
2. **T2 백엔드 archivePage** (AC-B7~B11): RED → GREEN → REFACTOR
3. **T3 백엔드 통합** (AC-I1~I3): RED PageIntegrationTest → GREEN(이미 통과 예상) 
4. **T4 프론트 lib** (AC-F1,F2): RED pages.test → GREEN api.ts/pages.ts/types.ts
5. **T5 프론트 PageTreeNode** (AC-F3~F6): RED PageTree.test → GREEN 컴포넌트
6. **T6 프론트 Sidebar** (AC-F7,F8): RED Sidebar.test → GREEN 핸들러
7. **T7 회귀** (AC-F9): 전체 vitest+tsc, gradle test

백엔드(T1~T3)와 프론트(T4~T6)는 독립 — 순차 진행하되 검증은 각 레이어 도구로.

## Out-of-scope
아이콘 피커/clear, 순서 DnD(P8), 복원 UI, 페이지 상세 헤더 편집(P3).

---

## Testability 평가 (test-architect)

### 컴포넌트별 전략
#### PageService.updatePage / archivePage
- 단위: Mockito(@Mock PageRepository, AccessGuard; @InjectMocks). save/saveAll은 ArgumentCaptor로 캡처해 archivedAt/title/icon 단정. 비멤버는 guard mock이 throw. 격리 완벽(DB 불필요).
- 통합: Testcontainers + MockMvc + oauth2Login(asUser) — 실제 PATCH/DELETE→DB→GET 트리 검증.
- 모의 대상: PageRepository, AccessGuard (단위). 통합은 실 DB.
- AC 매핑: AC-B1~B11(단위), AC-I1~I3(통합).

#### apiPatch / pages.updatePage·archivePage
- 단위: `global.fetch` mock → 호출 URL·method·body 단정, 응답 파싱 검증.
- AC: AC-F1,F2.

#### PageTreeNode (표현)
- 단위: RTL render + userEvent. onRename/onSetIcon/onArchive를 vi.fn으로 주입, 인터랙션 후 호출 인자 단정. 순수 표현(부수효과 없음).
- AC: AC-F3~F6.

#### Sidebar (컨테이너)
- 단위: vi.mock('@/src/lib/pages')로 updatePage/archivePage/getPageTree mock. window.confirm은 vi.spyOn. 핸들러→API 호출+재조회 단정.
- AC: AC-F7,F8.

### Testability Score: 9/10
양층 모두 의존성 주입/모킹이 자연스럽다. 백엔드는 mockito+ArgumentCaptor로 save 인자 직접 검증, 프론트는 fetch/모듈 mock + window.confirm spy로 결정론적. 외부 시간(Instant.now)은 archivedAt!=null 존재만 단정하여 비결정성 회피. -1은 통합 테스트가 Testcontainers 기동 비용 있는 정도.

### 판정
≥ 7 → ✅ **TESTABILITY PASS** (9/10)

## design-critic 요약
- [CHALLENGE→해소] 부분갱신 null 모호성 → D1에서 "null=변경없음, blank=400, icon clear 범위밖" 명문화.
- [RISK→방어] 재귀 아카이브 사이클 → createPage 부모 사전존재 강제로 DAG 보장(유한). BFS visited 불필요하나 안전상 대상집합 중복 방지.
- [SIMPLIFY] archive는 활성목록 1회 조회로 child map 구성(추가 repo 메서드 불필요).
- 근본 문제 없음.
