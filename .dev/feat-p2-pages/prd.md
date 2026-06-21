# PRD: P2 페이지 도메인 Walking Skeleton

## 배경

P1(인증·권한 기반)이 머지되어 OAuth 로그인·개인 워크스페이스·`AccessGuard`/`CurrentUserService` 헬퍼가 준비됐다. 그러나 페이지 도메인(`PageService`)과 워크스페이스 목록(`WorkspaceService.listMyWorkspaces`)은 전부 `UnsupportedOperationException` 스텁이고, 컨트롤러는 `currentUserId = null` TODO로 막혀 있어 **실제로 동작하는 페이지 API가 0개**다.

이번 사이클은 로드맵의 Walking Skeleton("페이지 1개 생성+저장+조회 API가 골격")을 구현한다. 즉 페이지 생성·트리 조회·내 워크스페이스 목록을 동작시키고, P1에서 만든 권한 헬퍼를 실제 엔드포인트에 처음으로 배선한다. 아카이브·이동·제목변경·프론트는 다음 사이클로 미룬다.

## 요구사항 (MoSCoW)

### Must
- **M1** 페이지 생성: 최상위(`parentPageId=null`) 및 하위 페이지 생성. 생성자(`createdById`)는 현재 인증 사용자.
- **M2** 하위 페이지 부모 검증: `parentPageId` 지정 시 부모가 동일 `workspaceId` 소속이어야 한다.
- **M3** 페이지 트리 조회: 워크스페이스의 비(非)아카이브 페이지를 `parentPageId` 기준 트리로 조립, 같은 레벨은 `position` 오름차순.
- **M4** 내 워크스페이스 목록: 현재 사용자 멤버십 기반 소속 워크스페이스 반환.
- **M5** 컨트롤러 인증 컨텍스트 주입: `PageController`/`WorkspaceController.listMyWorkspaces`의 `currentUserId = null`을 `CurrentUserService.requireCurrentUserId()`로 대체.
- **M6** 권한 적용: 페이지 생성·조회, 워크스페이스 목록에 워크스페이스 멤버십 검증(`AccessGuard.requireWorkspaceMember`). 비멤버는 403.

### Should
- **S1** 페이지 제목 검증: `title`이 null이거나 공백뿐이면 400(`IllegalArgumentException`).

### Could
- **C1** 페이지 생성 시 `position` 서버 자동 채번(gap-based 1000 단위) — Q1 결정에 따름.

## 수용 기준 (Given-When-Then)

> 테스트 1급 계층은 서비스(`PageService`/`WorkspaceService`)다. AC는 서비스 단위/통합 테스트 또는 REST 통합 테스트로 검증한다. 검증 시 "현재 사용자"는 해당 워크스페이스 OWNER 멤버십을 가진 사용자로 픽스처 구성.

**AC-1: 최상위 페이지 생성** _(M1)_
- Given: 사용자 U가 워크스페이스 W의 멤버다
- When: `PageService.createPage(U.id, W.id, {parentPageId=null, title="회의록", icon=null, position=0})` 호출
- Then: `pages` 테이블에 1건 저장되고 그 row의 `parentPageId`는 null, `workspaceId`=W.id, `createdById`=U.id, `title`="회의록"이며, 반환 `PageDto.id != null`, `PageDto.parentPageId == null`, `PageDto.children == null`

**AC-2: 하위 페이지 생성** _(M1)_
- Given: 사용자 U가 워크스페이스 W의 멤버이고, W에 부모 페이지 P가 존재한다
- When: `createPage(U.id, W.id, {parentPageId=P.id, title="안건", position=0})` 호출
- Then: 저장된 Page의 `parentPageId`=P.id이고, 반환 `PageDto.parentPageId == P.id`, `PageDto.workspaceId == W.id`

**AC-3: 다른 워크스페이스 부모 거부** _(M2)_
- Given: 사용자 U가 워크스페이스 W의 멤버이고, 페이지 P는 다른 워크스페이스 W2에 속한다
- When: `createPage(U.id, W.id, {parentPageId=P.id, title="x", position=0})` 호출
- Then: `IllegalArgumentException`이 던져지고(→HTTP 400), `pages`에 신규 row가 저장되지 않는다 (count 불변)

**AC-4: 비멤버 페이지 생성 거부** _(M6)_
- Given: 사용자 U가 워크스페이스 W의 멤버가 아니다
- When: `createPage(U.id, W.id, {parentPageId=null, title="x", position=0})` 호출
- Then: `AccessDeniedException`이 던져지고(→HTTP 403), `pages`에 신규 row가 저장되지 않는다

**AC-5: 트리 조립 — 부모-자식 구조** _(M3)_
- Given: 워크스페이스 W에 페이지 A(parent=null), B(parent=A), C(parent=A)가 존재하고 U는 W의 멤버다
- When: `getPageTree(U.id, W.id)` 호출
- Then: 반환 리스트 size==1이고 그 원소는 A이며, `A.children`의 size==2이고 [B, C]를 포함한다

**AC-6: 트리 조회 — 아카이브 제외** _(M3)_
- Given: 워크스페이스 W에 활성 페이지 X(archivedAt=null) 1건, 아카이브 페이지 Y(archivedAt!=null) 1건이 있고 U는 멤버다
- When: `getPageTree(U.id, W.id)` 호출
- Then: 반환 트리의 전체 노드 수==1이고 Y의 id는 결과 어디에도 존재하지 않는다

**AC-7: 빈 워크스페이스** _(M3)_
- Given: 워크스페이스 W에 페이지가 0건이고 U는 멤버다
- When: `getPageTree(U.id, W.id)` 호출
- Then: 빈 리스트(size==0)가 반환되고 예외가 발생하지 않는다

**AC-8: 같은 레벨 position 오름차순 정렬** _(M3)_
- Given: 워크스페이스 W에 최상위 페이지 3건이 position [2000, 1000, 3000]으로 존재하고 U는 멤버다
- When: `getPageTree(U.id, W.id)` 호출
- Then: 반환 리스트의 position 순서가 [1000, 2000, 3000] (오름차순)이다

**AC-9: 비멤버 트리 조회 거부** _(M6)_
- Given: 사용자 U가 워크스페이스 W의 멤버가 아니다
- When: `getPageTree(U.id, W.id)` 호출
- Then: `AccessDeniedException`이 던져진다(→HTTP 403)

**AC-10: 내 워크스페이스 목록** _(M4)_
- Given: 사용자 U가 워크스페이스 W1, W2 두 곳의 멤버다(다른 워크스페이스 W3에는 비멤버)
- When: `listMyWorkspaces(U.id)` 호출
- Then: 반환 리스트 size==2이고 id 집합이 {W1.id, W2.id}와 일치하며 W3.id는 포함되지 않는다

**AC-11: 멤버십 없으면 빈 목록** _(M4)_
- Given: 사용자 U의 멤버십이 0건이다
- When: `listMyWorkspaces(U.id)` 호출
- Then: 빈 리스트(size==0)가 반환된다

**AC-12: 미인증 요청 차단 (REST)** _(M5)_
- Given: 인증 세션 없이 요청한다
- When: `GET /api/workspaces/{wsId}/pages` 호출
- Then: HTTP 401이 반환되고 응답 본문이 `{"code":"UNAUTHORIZED", ...}` JSON이다 (기존 `JsonAuthenticationEntryPoint` 동작)

**AC-13: 페이지 제목 검증** _(S1)_
- Given: 사용자 U가 워크스페이스 W의 멤버다
- When: `createPage(U.id, W.id, {parentPageId=null, title="   ", position=0})` (공백뿐인 제목) 호출
- Then: `IllegalArgumentException`이 던져지고(→HTTP 400), `pages`에 신규 row가 저장되지 않는다

## 범위 밖 (Out of scope)

- `updatePage`(제목·아이콘 변경), `movePage`(부모 변경·순환참조 방지), `archivePage`(재귀 soft delete) — 다음 사이클
- 프론트엔드 사이드바 트리 렌더링·워크스페이스 전환 UI
- 드래그앤드롭 정렬, 이모지 피커 UI
- 공유 워크스페이스 생성/삭제/멤버 관리/초대 (P7)
- 페이지 단건 조회 엔드포인트(`GET /pages/{id}`) — 현재 컨트롤러에 없음, 트리 조회로 충분

## 확정된 결정사항 (사용자 승인 2026-06-18)

- **D1 (position 채번)**: `createPage`는 `CreatePageRequest.position`을 그대로 저장한다(클라이언트 전달값). 서버 gap-based 자동 채번은 `movePage`/재정렬이 들어오는 다음 사이클로 연기 → **C1은 이번 범위에서 제외**.
- **D2 (생성 권한)**: 페이지 생성은 워크스페이스 멤버 누구나(OWNER+MEMBER) 가능. `AccessGuard.requireWorkspaceMember`만 적용(역할 구분 없음).

추가 확인 사항 없음. PRD가 확정되었습니다.
