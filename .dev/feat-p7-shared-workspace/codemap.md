## 코드 맵: P7 공유 워크스페이스 생성 (US-WS-02)

> 발견: P7 전체가 **스캐폴드만 존재**(컨트롤러/DTO/서비스 시그니처/리포지토리). 서비스 본문은 `throw new UnsupportedOperationException("TODO(Phase 1)")` 스텁, 컨트롤러는 `currentUserId = null // TODO`로 인증 미배선. 이번 슬라이스 = 스텁 채우기 + 인증 배선.

### 핵심 파일 (구현 대상)
- backend/src/main/java/com/ieum/workspace/WorkspaceService.java:75 → `createSharedWorkspace(currentUserId, request)` — 현재 TODO 스텁, **구현 대상**
- backend/src/main/java/com/ieum/workspace/WorkspaceController.java:44 → `POST /api/workspaces`, `currentUserId = null // TODO` — **인증 배선 대상**(`currentUserService.requireCurrentUserId()`)
- backend/src/main/java/com/ieum/workspace/dto/CreateWorkspaceRequest.java → `record { String name }` 요청
- backend/src/main/java/com/ieum/workspace/dto/WorkspaceDto.java → `record { id, name, type, ownerId, createdAt }` 응답
- backend/src/main/java/com/ieum/workspace/Workspace.java → 엔티티 (name `nullable=false`, type, ownerId, @CreationTimestamp createdAt)

### 참조 파일
- backend/src/main/java/com/ieum/workspace/WorkspaceService.java:35 → `ensurePersonalWorkspace` — Workspace+OWNER Membership 저장 패턴(미러 대상)
- backend/src/main/java/com/ieum/workspace/Membership.java + MembershipRepository.java → OWNER 멤버십 저장
- backend/src/main/java/com/ieum/workspace/WorkspaceType.java (PERSONAL/SHARED), MemberRole.java (OWNER/MEMBER)
- backend/src/main/java/com/ieum/common/security/CurrentUserService.java:18 → `requireCurrentUserId()` (SecurityContext→googleId→User.id)
- backend/src/main/java/com/ieum/common/ApiExceptionHandler.java → IllegalArgumentException→400, AccessDeniedException→403, EntityNotFound→404
- backend/src/main/java/com/ieum/common/security/AccessGuard.java → requireOwner 등 (이번 슬라이스 미사용, 후속 슬라이스)

### 테스트 (스타일 미러)
- backend/src/test/java/com/ieum/workspace/WorkspaceServiceTest.java → Mockito(@InjectMocks/ArgumentCaptor/AssertJ) 단위 스타일 — createSharedWorkspace 테스트 추가 대상
- backend/src/test/java/com/ieum/support/AbstractIntegrationTest.java → Testcontainers PG 싱글톤 베이스
- backend/src/test/java/com/ieum/page/PageDetailIntegrationTest.java → @AutoConfigureMockMvc + oauth2Login(sub→googleId) + FK순서 cleanup 통합 스타일

### 설정
- .claude/config.json → java-spring: build=`./gradlew build`, test=`./gradlew test`
- 미인증 `/api/**` → 401 (Spring Security, PageDetailIntegrationTest AC-3로 확인)
