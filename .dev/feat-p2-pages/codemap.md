## 코드 맵: P2 페이지 도메인 Walking Skeleton (Page CRUD API 골격)

### 핵심 파일 (이번 사이클 수정 대상)
- backend/src/main/java/com/ieum/page/PageService.java:37-98 → 페이지 서비스. getPageTree/createPage/updatePage/movePage/archivePage 전부 `UnsupportedOperationException` 스텁. **이번 슬라이스: createPage + getPageTree 구현**
- backend/src/main/java/com/ieum/page/PageController.java:28-83 → 페이지 REST. `/api/workspaces/{wsId}/pages`. 모든 핸들러 `currentUserId = null` TODO → **CurrentUserService 주입 필요**
- backend/src/main/java/com/ieum/workspace/WorkspaceService.java:56-60 → `listMyWorkspaces` 스텁 → **이번 슬라이스 구현**
- backend/src/main/java/com/ieum/workspace/WorkspaceController.java:31-36 → `listMyWorkspaces()` `currentUserId = null` TODO → **CurrentUserService 주입 필요**

### 참조 파일 (재사용/의존)
- backend/src/main/java/com/ieum/common/security/AccessGuard.java:22-41 → requireWorkspaceMember(userId, wsId) / requirePageAccess(userId, pageId). 위반 시 AccessDeniedException(403), 페이지 미존재 EntityNotFoundException(404)
- backend/src/main/java/com/ieum/common/security/CurrentUserService.java:20-25 → requireCurrentUserId(): OAuth2 principal(googleId)→User.id. 미인증 시 AuthenticationCredentialsNotFoundException
- backend/src/main/java/com/ieum/page/Page.java:21-55 → 엔티티(id, workspaceId, parentPageId, title, icon, position:int, createdById, archivedAt, createdAt, updatedAt). @Builder/@Setter
- backend/src/main/java/com/ieum/page/PageRepository.java:14 → findByWorkspaceIdAndArchivedAtIsNull(wsId). **트리 빌드용 메서드 추가 검토**
- backend/src/main/java/com/ieum/page/dto/PageDto.java:10-22 → 응답 DTO. children: List<PageDto> (트리), 단건은 null
- backend/src/main/java/com/ieum/page/dto/CreatePageRequest.java:8-15 → parentPageId(nullable), title, icon, position(0-based)
- backend/src/main/java/com/ieum/workspace/MembershipRepository.java:16 → findByUserId(userId) → listMyWorkspaces 기반
- backend/src/main/java/com/ieum/workspace/dto/WorkspaceDto.java:11-17 → id, name, type, ownerId, createdAt
- backend/src/main/java/com/ieum/workspace/WorkspaceRepository.java → findAllById 등 JpaRepository 기본
- backend/src/main/java/com/ieum/common/ApiExceptionHandler.java:17-28 → AccessDeniedException→403, EntityNotFoundException→404 (이미 매핑됨)

### 설정/테스트 기반
- backend/src/test/java/com/ieum/support/AbstractIntegrationTest.java → Testcontainers(PostgreSQL) 통합 테스트 베이스
- context/page/architecture.md → gap-based position(1000 단위), soft delete(archivedAt) 재귀, 자기참조 트리 (workspaceId, parentPageId, position) 인덱스

### 이번 슬라이스 범위(확정)
- IN: createPage(최상위+하위, 부모 동일 workspace 검증), getPageTree(플랫→트리, position 정렬), listMyWorkspaces, Controller 인증 컨텍스트 주입(CurrentUserService), AccessGuard(requireWorkspaceMember/requirePageAccess) 적용
- OUT(다음 사이클): updatePage(제목/아이콘), movePage(순환참조 방지), archivePage(재귀 soft delete), 프론트 사이드바
