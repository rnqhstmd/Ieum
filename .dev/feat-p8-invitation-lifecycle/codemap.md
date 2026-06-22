## 코드 맵: P8 초대 전 과정 (수락·철회·만료·메일)

### 핵심 파일
- `backend/src/main/java/com/ieum/invitation/InvitationService.java` → 초대 도메인 서비스. `createInvitation`(완료, :73), `listInvitations` 스텁(:130), `revokeInvitation` 스텁(:146), `acceptInvitation` 스텁(:173). 스텁에 가이드 주석 완비. 클래스 기본 `@Transactional(readOnly=true)`, 쓰기 메서드는 `@Transactional`
- `backend/src/main/java/com/ieum/invitation/InvitationController.java` → POST 생성(:30), DELETE revoke(:53 `/api/workspaces/{wsId}/invitations/{invitationId}`), POST accept(:67 `/api/invitations/accept`). currentUserId 주입 패턴
- `backend/src/main/java/com/ieum/invitation/Invitation.java` → 엔티티: workspaceId, email, invitedById, role(MemberRole), token(unique), status(InvitationStatus), expiresAt, createdAt
- `backend/src/main/java/com/ieum/invitation/InvitationStatus.java` → PENDING/ACCEPTED/REVOKED/EXPIRED
- `backend/src/main/java/com/ieum/invitation/InvitationRepository.java` → findByToken 등 조회

### 참조 파일
- `backend/src/main/java/com/ieum/invitation/dto/AcceptInvitationRequest.java` → token 필드
- `backend/src/main/java/com/ieum/workspace/Membership.java` → userId/workspaceId/role
- `backend/src/main/java/com/ieum/workspace/MembershipRepository.java` → findByUserIdAndWorkspaceId(멱등 검사)
- `backend/src/main/java/com/ieum/workspace/MemberRole.java` → OWNER/MEMBER
- `backend/src/main/java/com/ieum/common/security/AccessGuard.java` → requireOwner(비OWNER→403)
- `backend/src/main/java/com/ieum/common/ConflictException.java` → 409
- `backend/src/main/java/com/ieum/common/ApiExceptionHandler.java` → 예외→HTTP 상태 매핑
- `backend/src/main/java/com/ieum/user/UserRepository.java` → findByEmail (INV-06 이메일 대조에 활용)

### 설정
- `backend/src/main/resources/db/migration/` → Flyway 마이그레이션 (invitations 테이블)
- `backend/src/main/java/com/ieum/common/email/ResendEmailClient.java` → 메일 발송 클라이언트(주입, 현재 fallback 발송)

### 테스트 (기존 패턴 재사용)
- `backend/src/test/java/com/ieum/invitation/InvitationServiceTest.java` → 단위
- `backend/src/test/java/com/ieum/invitation/InvitationCreateIntegrationTest.java` → testcontainers 통합 (V1~Vn 픽스처)

### cross-review 연기분 (P8 동반 처리 후보)
- `INVITE_URL_PREFIX` 하드코딩(InvitationService:52) → `@Value` 분리
- 메일 발송 `@TransactionalEventListener` AFTER_COMMIT 분리 (현재 createInvitation 내 try-catch 인라인)

### 탐색 추가 (requirements)
- `backend/src/main/java/com/ieum/common/security/CurrentUserService.java` → `requireCurrentUserId` 반환타입/예외 (컨트롤러 accept/revoke/list 인증 연결 FR-4)
- `backend/src/main/java/com/ieum/common/ApiExceptionHandler.java` → 410 Gone 매핑 추가 필요 (`GoneException` 신규 + 409/403 기존 매핑 확인)
- `backend/src/main/resources/application.yml` → `app.resend.*`(api-key/from)·초대 URL 설정값 존재 여부 (후속③)
- `backend/src/main/java/com/ieum/workspace/MembershipRepository.java` → `findByUserIdAndWorkspaceId` 시그니처 (멱등 검사 AC-8)

### 탐색 추가 (design)
- `backend/src/main/java/com/ieum/common/security/JsonAuthenticationEntryPoint.java:29` → `/api/` 미인증→401 `ErrorResponse("UNAUTHORIZED")` (AC-9는 컨트롤러 진입 전 Security 필터가 충족)
- `backend/src/main/java/com/ieum/config/SecurityConfig.java:41` → `.anyRequest().authenticated()`로 accept 엔드포인트 보호
- `backend/src/main/java/com/ieum/common/security/CurrentUserService.java:20` → `requireCurrentUserId()` googleId→User.id 조회 (컨트롤러 인증 연결 FR-4)
- `backend/src/main/resources/db/migration/V1__init.sql:38` → `uq_memberships_user_workspace UNIQUE(user_id, workspace_id)` (QE-1 안전망)
- `backend/src/main/java/com/ieum/common/ApiExceptionHandler.java` → 기존: AccessDenied→403, EntityNotFound→404, IllegalArgument→400, Conflict→409, Exception→500. **GoneException→410 추가 필요**
- `backend/src/main/java/com/ieum/common/GoneException.java` → **신규 생성** (ConflictException 패턴 복제, 410)
