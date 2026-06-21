# 설계: P7 슬라이스 ②a — 초대 생성 (INV-01/05 + 메일 fallback)

## 설계 규모
**중형** — 단일 엔드포인트지만 가드(OWNER 403·이미멤버 409)·토큰·만료·메일 fallback·신규 예외 매핑이 결합. 기존 스캐폴드 시그니처를 채우고 인증/권한/예외를 배선한다. 신규 엔티티·리포지토리·DTO·엔드포인트 없음.

## 접근 방식
`InvitationService.createInvitation`/`toDto` 스텁을 채운다. 권한 검증은 슬라이스 ①과 동일하게 `AccessGuard`(requireOwner)를 재사용하되, InvitationService에 `AccessGuard`를 주입한다(scaffold의 `workspaceService` 필드는 requireOwner를 노출하지 않으므로). 409는 전역 `IllegalStateException` 매핑(광범위 부작용)을 피하기 위해 **전용 `ConflictException`+핸들러**로 매핑한다. 메일 발송은 try/catch로 감싸 실패해도 초대 생성을 막지 않는다.

## 변경 범위 (6개 파일: 신규 2 · 수정 2 · 테스트 2)

### 신규
1. `backend/src/main/java/com/ieum/common/ConflictException.java` — `RuntimeException`, 409 전용.

### 수정
2. `backend/src/main/java/com/ieum/common/ApiExceptionHandler.java` — `@ExceptionHandler(ConflictException) → 409 CONFLICT` 추가.
3. `backend/src/main/java/com/ieum/invitation/InvitationService.java` — `createInvitation`/`toDto` 구현, `AccessGuard` 주입, `normalizeEmail` 헬퍼.
4. `backend/src/main/java/com/ieum/invitation/InvitationController.java` — `CurrentUserService` 주입 + `createInvitation`에 `requireCurrentUserId()` 배선(다른 스텁 메서드는 미수정).

### 테스트 (신규)
5. `backend/src/test/java/com/ieum/invitation/InvitationServiceTest.java` (Mockito 단위) — AC-1,2,3,4,6.
6. `backend/src/test/java/com/ieum/invitation/InvitationCreateIntegrationTest.java` (MockMvc 통합) — AC-7,8,9,10.

## 핵심 인터페이스 (기존 시그니처 유지)
```java
// InvitationService (필드 추가: private final AccessGuard accessGuard;)
private static final String INVITE_URL_PREFIX = "https://ieum.app/invite?token=";

@Transactional
public InvitationDto createInvitation(UUID currentUserId, UUID wsId, CreateInvitationRequest request) {
    accessGuard.requireOwner(currentUserId, wsId);            // 비OWNER → AccessDeniedException(403)
    String email = normalizeEmail(request.email());          // 빈/공백 → IllegalArgumentException(400)
    MemberRole role = request.role() != null ? request.role() : MemberRole.MEMBER;

    // INV-05: 이미 멤버인 이메일 → 409
    userRepository.findByEmail(email)
        .flatMap(u -> membershipRepository.findByUserIdAndWorkspaceId(u.getId(), wsId))
        .ifPresent(m -> { throw new ConflictException("이미 워크스페이스 멤버인 사용자입니다."); });

    Invitation invitation = invitationRepository.save(Invitation.builder()
        .workspaceId(wsId).email(email).invitedById(currentUserId).role(role)
        .token(generateSecureToken())                        // 32바이트(256-bit) URL-safe Base64
        .status(InvitationStatus.PENDING)
        .expiresAt(Instant.now().plus(INVITATION_EXPIRY_DAYS, ChronoUnit.DAYS)) // +7일
        .build());

    try {                                                    // M5: 발송 실패해도 PENDING 유지
        String wsName = workspaceRepository.findById(wsId).map(Workspace::getName).orElse("워크스페이스");
        resendEmailClient.sendInvitationEmail(email, INVITE_URL_PREFIX + invitation.getToken(), wsName);
    } catch (Exception e) {
        log.warn("초대 이메일 발송 실패 (email={}): {}", email, e.getMessage());
    }
    return toDto(invitation);
}

private static String normalizeEmail(String raw) {
    String email = (raw == null) ? "" : raw.trim();
    if (email.isEmpty()) throw new IllegalArgumentException("초대 이메일은 비어있을 수 없습니다.");
    return email;
}
private InvitationDto toDto(Invitation inv) {
    return new InvitationDto(inv.getId(), inv.getWorkspaceId(), inv.getEmail(), inv.getInvitedById(),
        inv.getRole(), inv.getStatus(), inv.getExpiresAt(), inv.getCreatedAt());
}
```
```java
// ConflictException
package com.ieum.common;
public class ConflictException extends RuntimeException {
    public ConflictException(String message) { super(message); }
}
// ApiExceptionHandler 추가
@ExceptionHandler(ConflictException.class)
public ResponseEntity<ErrorResponse> handleConflict(ConflictException ex) {
    log.warn("충돌: {}", ex.getMessage());
    return ResponseEntity.status(HttpStatus.CONFLICT).body(new ErrorResponse("CONFLICT", ex.getMessage()));
}
// InvitationController: private final CurrentUserService currentUserService; +
//   UUID currentUserId = currentUserService.requireCurrentUserId();
```

## 설계 판단 / 근거
- **AccessGuard 주입**: WorkspaceService는 requireOwner를 노출하지 않음. AccessGuard가 정본 권한 헬퍼(슬라이스 ①·페이지 도메인과 일관). scaffold의 미사용 `workspaceService` 필드는 후속 스텁용이라 유지(이번 슬라이스 미수정).
- **전용 ConflictException**: 전역 `IllegalStateException→409`는 내부 오류까지 409로 오분류할 위험. 전용 예외가 정밀.
- **메일 fallback**: `sendInvitationEmail`은 apiKey 미설정 시 no-op이나, 호출 자체 예외(네트워크 등)도 try/catch로 흡수해 초대 생성을 보장(M5).
- **role 기본 MEMBER**: request.role() null 시 MEMBER. 대부분 초대가 MEMBER.
- **invitedById 신뢰 경계**: 컨트롤러가 세션에서 currentUserId 추출 → 위조 불가(슬라이스 ① 동일 원칙).

## 구현 순서 (RGR 3 태스크)
1. **T1 (AC-1,2,3,4,6) — 서비스 코어**: requireOwner·normalizeEmail·token·7일만료·save·메일 fallback·toDto + AccessGuard 주입. RED(단위 5건)→GREEN→REFACTOR.
2. **T2 (AC-5) — 이미멤버 409**: ConflictException 신규 + INV-05 체크. RED(단위 1건)→GREEN.
3. **T3 (AC-7,8,9,10) — REST**: 컨트롤러 인증 배선 + ApiExceptionHandler 409 핸들러 + 통합 4건. RED→GREEN.

## 위험 / 주의
- 통합테스트 컨텍스트는 InvitationService→ResendEmailClient(@Component, `app.resend.*` 프로퍼티 필요)를 로드. 슬라이스 ① 통합테스트가 통과했으므로 프로퍼티 존재 확인됨.
- ObjectMapper 빈 부재 → 통합테스트 JSON 본문은 직접 문자열 구성(슬라이스 ① 동일).
- 컨트롤러 다른 스텁(list/revoke/accept)은 미수정 — 컴파일·기존 테스트 무영향.

---

## Testability 평가 (test-architect)

### 컴포넌트별 테스트 전략

#### InvitationService.createInvitation
- 단위 테스트: Mockito `@InjectMocks` + `@Mock`(invitationRepository, workspaceRepository, membershipRepository, userRepository, workspaceService, resendEmailClient, accessGuard).
  - AC-1/2/3: `userRepository.findByEmail`→empty(비멤버), `invitationRepository.save`→id 부여 thenAnswer, `workspaceRepository.findById`→empty(이름 fallback). ArgumentCaptor로 저장 Invitation(status/workspaceId/email/invitedById/role/token/expiresAt) 검증. 토큰 2회 호출 상이·길이≥32, expiresAt now+7일(±1일) 검증.
  - AC-4: `accessGuard.requireOwner`가 AccessDeniedException throw하도록 stub → save never.
  - AC-6: `resendEmailClient.sendInvitationEmail`가 throw하도록 stub(doThrow) → save 발생·예외 미전파 확인.
- 모의 대상: 모든 리포지토리 + AccessGuard + ResendEmailClient.
- 격리 전략: 생성자 DI — 완전 격리.
- AC 매핑: AC-1,2,3,4,6.

#### InvitationService INV-05 가드 (ConflictException)
- 단위: `userRepository.findByEmail`→Optional.of(user), `membershipRepository.findByUserIdAndWorkspaceId`→Optional.of(membership) → ConflictException + save never.
- AC 매핑: AC-5.

#### InvitationController + ApiExceptionHandler (REST)
- 통합 테스트: `@AutoConfigureMockMvc` + AbstractIntegrationTest(Testcontainers PG). setup에서 owner User+SHARED Workspace+OWNER Membership 생성. AC-8용 MEMBER User+membership, AC-10용 기존 멤버 User. oauth2Login(sub→googleId) 인증. JSON 본문 직접 구성.
- 모의 대상: 없음(실 DB). ResendEmailClient는 no-op(apiKey blank).
- 격리 전략: 통합. FK 순서 cleanup(invitation→membership→workspace→user).
- AC 매핑: AC-7,8,9,10.

### Testability Score: 9/10

### 판정
- ≥ 7 → ✅ **TESTABILITY PASS**
- 근거: 서비스는 완전 생성자 DI로 Mockito 격리 자명, 모든 가드/예외/메일 fallback이 mock 제어 가능. REST는 슬라이스 ① 통합 패턴 재사용. 감점 1: expiresAt now+7일 검증이 시계 의존이나 ±1일 윈도우로 비결정성 흡수.
