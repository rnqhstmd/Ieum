<task>
oh-my-gx 파이프라인 산출물(PRD/설계/Trust Ledger)과 변경 코드를 교차 검증한다.
변경된 코드가 산출물의 약속을 충족하는지, 산출물에 정의되지 않은 신규 위험이 있는지 보고한다.

diff 파일: /Users/bonseung/projects/ieum/.dev/feat-p2-pages/diff.txt
이 파일을 Read하여 변경사항을 확인한다. 필요하면 아래 실제 소스도 Read한다:
- backend/src/main/java/com/ieum/page/PageService.java
- backend/src/main/java/com/ieum/page/PageController.java
- backend/src/main/java/com/ieum/workspace/WorkspaceService.java
- backend/src/main/java/com/ieum/workspace/WorkspaceController.java
- backend/src/main/java/com/ieum/common/security/AccessGuard.java
- backend/src/main/java/com/ieum/common/security/CurrentUserService.java
- backend/src/test/java/com/ieum/page/PageServiceTest.java
- backend/src/test/java/com/ieum/page/PageIntegrationTest.java
- backend/src/test/java/com/ieum/workspace/WorkspaceServiceTest.java
</task>

<grounding_rules>
- 모든 지적은 PRD 또는 설계서의 정확한 인용으로 근거를 제시한다.
- trust-ledger 항목에 이미 보고된 것은 보고하지 않는다 (중복 금지).
- 코드를 직접 확인하지 못한 추정은 ASSUMPTION으로 분리한다.
- PRD 자체가 코드와 일치하지 않을 가능성이 의심되면 ASSUMPTION으로 분류한다.
- 너는 이 코드를 작성하지 않았으니, 작성자의 자체 판정(trust-ledger)을 그대로 신뢰하지 말고 독립적으로 재검증하라.
</grounding_rules>

<structured_output_contract>
다음 섹션을 정확히 이 순서로 출력한다:

## AC 충족 매트릭스
표 형식: AC | 충족(O/X/부분) | 근거(파일:라인 또는 테스트)

## 설계 범위 이탈
설계 변경 범위에 명시되지 않은 파일 수정 목록. 없으면 "이탈 없음".

## 신규 위험
trust-ledger에 없는 신규 risk/policy/gap/assumption만.
- [Critical/Warning/Info] [RISK/POLICY/GAP/ASSUMPTION] 설명 / 위치 파일:라인 / 근거 / 권고

## 총평
- 강점 1-2개
- Critical/Warning 합산
- 권고 1줄
</structured_output_contract>

<language>
모든 출력은 한국어로 작성한다. 영어 단어는 고유명사·기술 용어에 한해 허용한다.
</language>

<artifacts>

### PRD 수용 기준 (13건)
- AC-1 최상위 페이지 생성: createPage(parentPageId=null) 시 Page 저장(parentPageId=null, createdById=현재유저, workspaceId 일치), 반환 PageDto.id 비어있지 않음, parentPageId=null, children=null
- AC-2 하위 페이지 생성: 부모가 동일 workspace면 parentPageId 설정되어 저장, 반환 PageDto.parentPageId=부모.id
- AC-3 타 워크스페이스 부모 거부: 부모가 다른 ws면 IllegalArgumentException(400), 페이지 저장 안 함
- AC-4 비멤버 생성 거부: AccessDeniedException(403), 저장 안 함
- AC-5 트리 조립: A(top), B(parent=A), C(parent=A)면 최상위 1건 A, A.children 2건
- AC-6 아카이브 제외: archivedAt 비어있지 않은 페이지는 트리에서 제외
- AC-7 빈 워크스페이스: 페이지 0건이면 빈 리스트
- AC-8 position 오름차순: 같은 레벨은 position 오름차순 정렬
- AC-9 비멤버 트리 조회 거부: AccessDeniedException(403)
- AC-10 내 워크스페이스 목록: 멤버십 기반 소속 워크스페이스 반환
- AC-11 멤버십 0건: 빈 리스트
- AC-12 미인증 REST: GET /api/workspaces/{wsId}/pages 시 401 JSON
- AC-13 빈 제목 거부: 공백뿐 title이면 IllegalArgumentException(400), 저장 안 함
- 확정사항 D1: position은 클라이언트 전달값(CreatePageRequest.position) 그대로 사용 (서버 자동채번 아님)
- 확정사항 D2: 페이지 생성 권한은 워크스페이스 멤버 누구나(OWNER+MEMBER), requireWorkspaceMember만 적용

### 설계 변경 범위 (이탈 점검 기준)
허용된 변경:
- PageService: createPage, getPageTree 구현. 의존성 WorkspaceService에서 AccessGuard로 교체. updatePage/movePage/archivePage는 스텁 유지(범위 밖).
- WorkspaceService.listMyWorkspaces 구현.
- PageController 전 핸들러 + WorkspaceController.listMyWorkspaces: currentUserId를 CurrentUserService.requireCurrentUserId()로 배선.
- 테스트 추가(PageServiceTest, PageIntegrationTest, WorkspaceServiceTest).
- 신규 클래스 0개, 신규 DB 마이그레이션 0개.
구현 순서: T1 listMyWorkspaces, T2 createPage, T3 getPageTree, T4 컨트롤러 배선+통합.

### 기존 Trust Ledger (이미 보고됨 — 중복 금지)
- Spec PASS: AC 13건 전부 충족 주장. Quality PASS: Critical 0, Important 0. Security clean: Critical 0, High 0.
- Minor 1: PageDto.children이 단건 생성 반환은 null, 트리 leaf는 빈 리스트로 의미 약간 불일치(허용).
- Minor 2: WorkspaceController는 listMyWorkspaces만 인증 배선, 나머지 핸들러는 currentUserId=null TODO 유지(범위 내 스텁).
- LOW 알려진 한계: 아카이브된 부모 + 활성 자식 조합 시 자식이 트리에서 숨겨짐(고아). archivePage 미구현이라 API로는 해당 상태 생성 불가.
- MEDIUM 검토됨-문제없음: requireWorkspaceMember 적용으로 비멤버 403, createPage 부모 동일 ws 검증으로 교차 ws 주입 차단, listMyWorkspaces는 본인 멤버십만 조회.

### 코드 맵 (핵심 파일)
- PageService.java: createPage(권한검사 + 제목검증 + 부모검증 + save), getPageTree(findByWorkspaceIdAndArchivedAtIsNull 후 buildSubtree 재귀 조립), buildSubtree(parentId 그룹핑 + position 정렬), toDto
- PageController.java: /api/workspaces/{wsId}/pages, CurrentUserService 주입
- WorkspaceService.java: listMyWorkspaces(findByUserId 후 findAllById 후 toDto)
- WorkspaceController.java: listMyWorkspaces 인증 배선
- AccessGuard.java: requireWorkspaceMember(userId,wsId) 비멤버 AccessDeniedException, requirePageAccess
- CurrentUserService.java: requireCurrentUserId() OAuth2 principal(sub=googleId) → User.id
- ApiExceptionHandler: AccessDeniedException 403, EntityNotFoundException 404, IllegalArgumentException 400

### references
없음 (references/ 디렉토리 부재).

</artifacts>
