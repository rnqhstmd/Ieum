# PRD: P2 잔여 — 페이지 이름변경·아이콘·아카이브

## 배경
P2에서 페이지 트리는 "읽기+생성"만 구현됐다(PR #5). 남은 관리 동작 **이름 변경·아이콘 설정(US-PAGE-05)**, **아카이브/soft delete(US-PAGE-04)**를 완성한다.

발견: 백엔드 `PageController`는 PATCH `/{pageId}`(updatePage)·DELETE `/{pageId}`(archivePage) 라우트를 배선했으나, `PageService.updatePage`/`archivePage`가 `UnsupportedOperationException` **스텁**이다. 따라서 본 작업은 **백엔드 서비스 구현 + 프론트 사이드바 UI** 양층이다. 프론트 위치는 사이드바 트리 행 액션(사용자 선택).

## 요구사항
### [Must]
- **FR-1** 백엔드 `PageService.updatePage`: 멤버가 페이지 제목/아이콘을 부분 변경. null 필드=변경없음, blank title=거부. 멤버/소속 워크스페이스 검증.
- **FR-2** 백엔드 `PageService.archivePage`: 멤버가 페이지를 soft delete(archivedAt). **하위 페이지 재귀 아카이브**. 멤버/소속 검증. 트리 조회에서 제외.
- **FR-3** 프론트 `apiPatch` + `pages.updatePage`/`archivePage` 클라이언트 함수.
- **FR-4** 사이드바 트리 행: **인라인 이름 변경**(Enter 커밋·Escape 취소), **아이콘(이모지) 설정**, **아카이브 버튼**.
- **FR-5** 액션 후 트리 재조회로 UI 반영(아카이브 시 트리에서 사라짐).
### [Should]
- **FR-6** 아카이브는 재귀적·파괴적이므로 프론트에서 확인(confirm) 후 실행.
- **FR-7** 401 응답 시 로그인 유도(기존 handleError 재사용).

## 수용 기준 (Given-When-Then)

### 백엔드 updatePage
**AC-B1: 제목 변경**
- Given: 멤버 user, ws 소속 page(title="T", icon="📄")
- When: `updatePage(user, ws, pageId, {title:"새제목", icon:null})`
- Then: 저장된 page.title=="새제목" 이고 page.icon=="📄"(보존) 이고 반환 PageDto.title=="새제목"

**AC-B2: 아이콘 변경(제목 보존)**
- Given: page(title="T", icon=null)
- When: `updatePage(..., {title:null, icon:"🔥"})`
- Then: page.icon=="🔥" 이고 page.title=="T"(보존)

**AC-B3: blank 제목 거부**
- Given: page 존재
- When: `updatePage(..., {title:"  ", icon:null})`
- Then: `IllegalArgumentException` throw, `save` 호출 안 됨

**AC-B4: 비멤버 거부**
- Given: accessGuard.requireWorkspaceMember가 AccessDeniedException
- When: `updatePage(...)`
- Then: `AccessDeniedException` throw, `save` 안 됨

**AC-B5: 없는 페이지**
- Given: findById(pageId) 비어있음
- When: `updatePage(...)`
- Then: `EntityNotFoundException` throw

**AC-B6: 다른 워크스페이스 페이지**
- Given: page.workspaceId != 인자 wsId
- When: `updatePage(...)`
- Then: `IllegalArgumentException` throw, `save` 안 됨

### 백엔드 archivePage
**AC-B7: soft delete**
- Given: ws 소속 활성 page
- When: `archivePage(user, ws, pageId)`
- Then: 저장된 page.archivedAt != null (saveAll로 영속)

**AC-B8: 하위 재귀 아카이브**
- Given: 부모 P → 자식 C → 손자 G (활성)
- When: `archivePage(user, ws, P.id)`
- Then: P, C, G 모두 archivedAt 설정되어 저장됨

**AC-B9: 비멤버 거부**
- Given: requireWorkspaceMember가 AccessDeniedException
- When: `archivePage(...)`
- Then: `AccessDeniedException` throw, `saveAll` 안 됨

**AC-B10: 없는 페이지**
- Given: findById 비어있음
- When: `archivePage(...)`
- Then: `EntityNotFoundException` throw

**AC-B11: 다른 워크스페이스**
- Given: page.workspaceId != wsId
- When: `archivePage(...)`
- Then: `IllegalArgumentException` throw, `saveAll` 안 됨

### 백엔드 통합(e2e)
**AC-I1: 제목 변경 e2e**
- Given: 멤버가 페이지 생성
- When: PATCH `/api/workspaces/{ws}/pages/{id}` body `{"title":"수정됨"}` (asUser)
- Then: 200 + 응답 title=="수정됨"; 이후 GET 트리에서 해당 페이지 title=="수정됨"

**AC-I2: 아카이브 e2e (자식 포함 제외)**
- Given: 부모+자식 페이지 생성
- When: DELETE `/api/workspaces/{ws}/pages/{부모id}` (asUser)
- Then: 204; 이후 GET 트리 length==0 (부모·자식 모두 제외)

**AC-I3: 비멤버 거부 e2e**
- Given: 다른 사용자(G-OTHER)
- When: PATCH/DELETE 페이지 (asUser G-OTHER)
- Then: 403

### 프론트 클라이언트 (pages.ts)
**AC-F1: updatePage 호출**
- Given: fetch mock 200 + PageDto JSON
- When: `updatePage("w1","p1",{title:"x"})`
- Then: PATCH `/api/workspaces/w1/pages/p1` 호출(body title:"x"), 파싱된 Page 반환

**AC-F2: archivePage 호출**
- Given: fetch mock 204
- When: `archivePage("w1","p1")`
- Then: DELETE `/api/workspaces/w1/pages/p1` 호출

### 프론트 PageTreeNode (표현)
**AC-F3: 인라인 이름 변경**
- Given: 노드 렌더(title="A"), onRename mock
- When: "A 이름 변경" 클릭 → 입력창에 "B" 입력 → Enter
- Then: `onRename("a","B")` 호출

**AC-F4: 이름 변경 Escape 취소**
- Given: 이름 변경 입력 중
- When: Escape
- Then: `onRename` 호출 안 됨, 입력창 닫힘

**AC-F5: 아이콘 설정**
- Given: onSetIcon mock
- When: "A 아이콘 변경" 클릭 → "🔥" 입력 → Enter
- Then: `onSetIcon("a","🔥")` 호출

**AC-F6: 아카이브**
- Given: onArchive mock
- When: "A 아카이브" 클릭
- Then: `onArchive("a")` 호출

### 프론트 Sidebar (컨테이너)
**AC-F7: 이름 변경 반영**
- Given: 트리 로드됨
- When: 노드에서 이름 변경 커밋(onRename)
- Then: `updatePage(ws, id, {title})` 호출 후 트리 재조회(getPageTree 재호출)

**AC-F8: 아카이브 확인**
- Given: window.confirm mock
- When: 아카이브 트리거
- Then: confirm true → `archivePage` 호출 + 트리 재조회 / confirm false → `archivePage` 미호출

**AC-F9: 회귀**
- Given: 본 변경 적용
- When: `pnpm typecheck && pnpm test`(web), `./gradlew test`(backend)
- Then: 기존 테스트 + 신규 테스트 전부 통과, tsc 0

## Out-of-scope
- 아이콘 피커 UI(직접 입력만), 아이콘 비우기(clear), 드래그 순서변경(P8), 아카이브 복원 UI, 페이지 상세 헤더 제목 편집(P3 에디터와 함께).

## 확인이 필요한 사항
추가 확인 사항 없음. PRD가 확정되었습니다.
