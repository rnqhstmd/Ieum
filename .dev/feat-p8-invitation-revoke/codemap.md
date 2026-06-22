## 코드 맵: P8 후속① 초대 철회(REVOKE) + 목록 조회

### 핵심 파일
- backend/src/main/java/com/ieum/invitation/InvitationService.java:135 → `listInvitations` 스텁(UnsupportedOperationException) — 채울 대상
- backend/src/main/java/com/ieum/invitation/InvitationService.java:151 → `revokeInvitation` 스텁(UnsupportedOperationException) — 채울 대상
- backend/src/main/java/com/ieum/invitation/InvitationController.java:44 → `listInvitations` — `currentUserId=null` 스텁, 인증 연결 대상
- backend/src/main/java/com/ieum/invitation/InvitationController.java:53 → `revokeInvitation` — `currentUserId=null` 스텁, 인증 연결 대상
- backend/src/main/java/com/ieum/invitation/InvitationRepository.java:11 → `findByWorkspaceId(UUID)` 메서드 추가 필요
- backend/src/main/java/com/ieum/invitation/Invitation.java → 엔티티(status, workspaceId, email, role)
- backend/src/main/java/com/ieum/invitation/InvitationStatus.java → PENDING/ACCEPTED/REVOKED/EXPIRED

### 참조 파일
- backend/src/main/java/com/ieum/common/security/AccessGuard.java → `requireOwner(userId, wsId)` 비OWNER 403
- backend/src/main/java/com/ieum/common/security/CurrentUserService.java → `requireCurrentUserId()` 미인증 401
- backend/src/main/java/com/ieum/common/ConflictException.java → 409 매핑
- backend/src/main/java/com/ieum/common/ApiExceptionHandler.java → 예외→HTTP 매핑(403/404/409/410)
- backend/src/main/java/com/ieum/invitation/dto/InvitationDto.java → 목록 응답 DTO
- backend/src/test/java/com/ieum/invitation/InvitationServiceTest.java → 단위 테스트 스타일(@InjectMocks, ArgumentCaptor)
- backend/src/test/java/com/ieum/invitation/InvitationAcceptIntegrationTest.java → 통합 테스트 스타일(MockMvc, oauth2Login, testcontainers)

### 설정
- backend/build.gradle.kts → java-spring
- .claude/config.json → vcs=git / projectTypes(java-spring, node)
