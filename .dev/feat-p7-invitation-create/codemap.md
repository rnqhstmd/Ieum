## 코드 맵: P7 슬라이스 ②a 초대 생성 (INV-01/05 + 메일 fallback)

> 슬라이스 ①과 동일하게 P7 스캐폴드의 스텁(`createInvitation` = UnsupportedOperationException)을 채우고 인증/권한/예외 매핑을 배선한다.

### 핵심 파일 (구현 대상)
- backend/src/main/java/com/ieum/invitation/InvitationService.java:68 → `createInvitation(currentUserId, wsId, request)` TODO 스텁 — **구현 대상**. `toDto`(211) 스텁도 구현. `generateSecureToken`(201) 기존 사용.
- backend/src/main/java/com/ieum/invitation/InvitationController.java:34 → `POST /api/workspaces/{wsId}/invitations`, `currentUserId=null // TODO` — **인증 배선 대상**. `CurrentUserService` 미주입(추가 필요).
- backend/src/main/java/com/ieum/common/ApiExceptionHandler.java → **409 매핑 추가 대상**(현재 403/404/400/500만). INV-05용.

### 신규 파일
- backend/src/main/java/com/ieum/common/ConflictException.java → 409 CONFLICT 전용 RuntimeException(신규). INV-05 이미멤버.

### 참조 파일
- backend/src/main/java/com/ieum/invitation/Invitation.java → 엔티티(workspaceId·email·invitedById·role·token unique·status·expiresAt·@CreationTimestamp createdAt)
- backend/src/main/java/com/ieum/invitation/InvitationRepository.java → `findByToken`만(이번 슬라이스엔 save만 필요)
- backend/src/main/java/com/ieum/invitation/InvitationStatus.java → PENDING/ACCEPTED/REVOKED/EXPIRED
- backend/src/main/java/com/ieum/invitation/dto/CreateInvitationRequest.java → `record { String email, MemberRole role }`
- backend/src/main/java/com/ieum/invitation/dto/InvitationDto.java → `record { id, workspaceId, email, invitedById, role, status, expiresAt, createdAt }`
- backend/src/main/java/com/ieum/common/security/AccessGuard.java:33 → `requireOwner(userId, wsId)` → 비OWNER AccessDeniedException(403). **InvitationService에 주입 필요**.
- backend/src/main/java/com/ieum/common/security/CurrentUserService.java:18 → `requireCurrentUserId()`
- backend/src/main/java/com/ieum/user/UserRepository.java → `findByEmail(email)` (INV-05 이미멤버 판정)
- backend/src/main/java/com/ieum/workspace/MembershipRepository.java → `findByUserIdAndWorkspaceId` (이미멤버), WorkspaceRepository.findById(워크스페이스명)
- backend/src/main/java/com/ieum/common/email/ResendEmailClient.java → `@Component sendInvitationEmail(to, inviteUrl, workspaceName)` — apiKey 미설정 시 no-op(로컬/테스트). 발송 실패는 try/catch fallback.

### 테스트 (스타일 미러)
- backend/src/test/java/com/ieum/workspace/WorkspaceServiceTest.java → Mockito 단위 스타일
- backend/src/test/java/com/ieum/workspace/WorkspaceCreateIntegrationTest.java → MockMvc oauth2Login + JSON 본문 직접구성(ObjectMapper 빈 없음) + FK순서 cleanup
- backend/src/test/java/com/ieum/support/AbstractIntegrationTest.java → Testcontainers PG 베이스

### 설정
- .claude/config.json → java-spring build/test
- ApiExceptionHandler: IllegalArgumentException→400, AccessDeniedException→403, EntityNotFound→404. ConflictException→409(신규).
