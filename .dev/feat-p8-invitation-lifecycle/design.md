# 설계: P8 초대 수락 (InvitationService.acceptInvitation, AC-1~10)

## 개요·범위
워크스페이스 OWNER가 생성한 PENDING 초대를 피초대자가 토큰으로 수락하여 멤버십을 획득한다. 이번 슬라이스는 **수락 경로만** 완성한다(철회/만료 스케줄러/Resend는 후속). 설계 규모: **중형**.

## 확정 결정 (사용자 승인)
- **D-1** 수락 성공 = **204 No Content**
- **D-2** 이미 멤버 멱등 시 = Membership 미생성 + **invitation.status=ACCEPTED 전이**
- **Q1** 이메일 비교 = trim 후 **equalsIgnoreCase**
- **Q2** 만료 전이 영속화 = **`@Transactional(noRollbackFor = GoneException.class)`** (단일 트랜잭션 유지하며 EXPIRED 커밋)
- **Q3** 동시수락(QE-1) = DB unique로 Membership 1건만 보장, 패배 요청 응답코드 정제는 후속

## 변경 범위
**신규 (1)**
- `backend/src/main/java/com/ieum/common/GoneException.java` — 410 전용 RuntimeException (`ConflictException` 패턴 복제)

**수정 (3)**
- `backend/.../invitation/InvitationService.java` — `acceptInvitation`(:173) 스텁 구현
- `backend/.../common/ApiExceptionHandler.java` — `GoneException`→410(`ErrorResponse("GONE", ...)`) 매핑 추가
- `backend/.../invitation/InvitationController.java` — `acceptInvitation` `currentUserId=null` → `currentUserService.requireCurrentUserId()`

기존 `createInvitation`/`listInvitations`/`revokeInvitation` 무영향. 신규 라이브러리 없음. API 시그니처(POST `/api/invitations/accept`, `AcceptInvitationRequest{token}`, 204) 불변.

## acceptInvitation 구현 흐름 (`@Transactional(noRollbackFor = GoneException.class)`)

| 단계 | 동작 | 실패 시 | AC |
|---|---|---|---|
| 0 | (미인증은 SecurityFilter `JsonAuthenticationEntryPoint`가 컨트롤러 진입 전 401) | — | AC-9 |
| 1 | `token = request.token()` null/blank 가드 | IllegalArgumentException→400 | — |
| 2 | `invitationRepository.findByToken(token)` | EntityNotFoundException→404 | AC-2 |
| 3 | **만료 우선**: `status==PENDING && expiresAt.isBefore(Instant.now())` → `setStatus(EXPIRED)` + `save` 후 GoneException | GoneException→410 (EXPIRED 커밋됨) | AC-5 |
| 4 | `status != PENDING` | ConflictException→409 | AC-3/4/6 |
| 5 | 이메일 대조: `userRepository.findById(currentUserId).orElseThrow(...)`.email vs `invitation.email`, **trim+equalsIgnoreCase** 불일치 | AccessDeniedException→403 | AC-7 |
| 6 | 멱등 검사: `membershipRepository.findByUserIdAndWorkspaceId(currentUserId, inv.workspaceId)` | (예외 없음) | AC-8 |
| 7 | **존재하지 않을 때만** Membership 생성: `Membership.builder().userId(currentUserId).workspaceId(inv.workspaceId).role(inv.getRole()).build()` 저장 | (DB unique 위반 시 §QE-1) | AC-1/10 |
| 8 | `inv.setStatus(ACCEPTED)` 저장 — **항상 실행(멱등 포함)** | — | AC-1/8 |
| 9 | `void` → 컨트롤러 204 | — | AC-1 |

### ★ design-critic MUST-ADDRESS 해소 (구현 필수 지침)
1. **멱등 제어흐름 — early-return 금지**: 기존 스텁 주석의 `membershipRepository.findBy...().ifPresent(m -> { return; })`는 **람다 내부 return이라 메서드를 빠져나가지 못하는 버그 패턴**이다. 절대 그대로 쓰지 말 것. 올바른 구현:
   ```java
   boolean alreadyMember = membershipRepository
       .findByUserIdAndWorkspaceId(currentUserId, inv.getWorkspaceId()).isPresent();
   if (!alreadyMember) {
       membershipRepository.save(Membership.builder()
           .userId(currentUserId).workspaceId(inv.getWorkspaceId())
           .role(inv.getRole()).build());
   }
   inv.setStatus(InvitationStatus.ACCEPTED);   // 멱등이어도 항상 실행 (D-2)
   invitationRepository.save(inv);
   ```
   → 멱등(AC-8)일 때 Membership 생성(7)만 스킵하고 status 전이(8)는 **반드시 실행**한다.
2. **AC-8 "status는 PENDING" = invitation.status**: `Membership` 엔티티에는 status 필드가 없다(userId/workspaceId/role/joinedAt만). 멱등 검사는 **멤버십 행의 존재 여부**만 판정하며, "이미 멤버"는 다른 경로로 Membership을 보유한 상태를 뜻한다. 초대 자체는 여전히 PENDING이므로 단계 3·4를 통과해 6에 도달한다.

### 검증 순서 정당성 (design-critic 확인)
- 만료(3)를 비PENDING 상태검사(4)보다 **먼저** 두되, 만료 조건에 `status==PENDING`을 포함 → PENDING+만료는 410(AC-5), 이미 EXPIRED는 단계 4의 409(AC-6)로 정확히 분기. 중복·누락 없음.
- AC-7(403, AccessDeniedException)은 noRollbackFor 대상이 아니므로 롤백됨 → "status 변경 없음" 충족. 만료 전이(GoneException)만 noRollbackFor로 커밋.

## 예외 매핑 표
| AC | 조건 | 예외 | HTTP | code |
|---|---|---|---|---|
| AC-9 | 미인증 | (SecurityFilter) | 401 | UNAUTHORIZED |
| AC-2 | 토큰 없음 | EntityNotFoundException | 404 | NOT_FOUND |
| AC-5 | PENDING+만료 | **GoneException(신규)** | 410 | GONE |
| AC-3/4/6 | 비PENDING | ConflictException | 409 | CONFLICT |
| AC-7 | 이메일 불일치 | AccessDeniedException | 403 | FORBIDDEN |
| AC-1/8/10 | 정상/멱등 | — | 204 | — |

## QE-1 동시수락
`memberships.uq_memberships_user_workspace UNIQUE(user_id, workspace_id)`(V1__init.sql:38)가 안전망. 동시 요청이 멱등 검사(6)를 둘 다 통과해도 둘째 INSERT를 DB가 거부 → Membership 1건. 패배 트랜잭션의 `DataIntegrityViolationException`은 현재 500으로 떨어지며, 응답코드 정제는 후속 슬라이스(Q3).

## 구현 순서 (RGR 사이클 매핑)
1. `GoneException` 생성 (의존 없음)
2. `ApiExceptionHandler` 410 매핑 (의존 1)
3. `InvitationService.acceptInvitation` 구현 — 검증순서/멱등/role 승계 (의존 1)
4. `InvitationController` 인증 연결 (의존 3)
→ 2·3은 1에만 의존(병렬 가능), 4는 3 후.

---

## Testability 평가 (test-architect)

### Testability Score: 9/10 — ✅ TESTABILITY PASS

### 컴포넌트별 테스트 전략
- **GoneException**: 단위 불필요(POJO). 핸들러 테스트에서 간접. RuntimeException(언체크) — noRollbackFor·전파 자연스러움.
- **InvitationService.acceptInvitation**: 기존 `InvitationServiceTest`(`@InjectMocks`, 7 의존성 mock) 확장.
  - 단위: AC-1(role 승계 captor + ACCEPTED save captor), AC-2(Optional.empty→404), AC-3/4/6(상태별 stub→409), AC-5(과거 expiresAt PENDING stub → `setStatus(EXPIRED)` save captor + GoneException assert), AC-7(다른 email User stub→403 + `save` never), AC-8(멤버 존재 stub → `save` **never** + ACCEPTED save captor), AC-10(role=OWNER captor).
  - accept 경로 미사용 의존성(Resend/WorkspaceService/WorkspaceRepository/AccessGuard)은 stub 불필요.
- **ApiExceptionHandler**: `new ApiExceptionHandler()` 직접 인스턴스화. `handleGone(...)` → 410 + code + 내부 메시지 비노출 assert.
- **InvitationController**: 단독 단위 생략(thin delegation) → 통합 흡수.
- **통합 (`InvitationAcceptIntegrationTest` 신규, testcontainers + MockMvc `oauth2Login`/`asUser`)**:
  - **AC-5 noRollbackFor 실커밋**: 만료 PENDING 픽스처 → accept → 410 + **DB 재조회 status==EXPIRED 단언**(롤백 회귀 검출). ★유일한 진짜 리스크 지점 — 반드시 포함.
  - AC-1 end-to-end(Membership 1건 + ACCEPTED 영속), AC-9(`asUser` 없이 POST → 401).

### 구현 시 반영 권고 (비차단)
1. **AC-5 통합테스트에 DB 재조회 status==EXPIRED 단언 필수** (noRollbackFor 안전망).
2. 단위는 captor로 부수효과 발생/미발생을 `verify().save()`/`never()` 명시 검증(전이 누락·이중저장 회귀 방지).
3. 컨트롤러 단독 단위 생략, 통합 흡수.

### -1 감점 (비차단)
시간이 `Instant.now()` 직접 호출(Clock 미주입) → 만료 **경계값** 결정론 검증 불가. 단 expiresAt 입력 데이터로 분기 제어 충분, 기존 createInvitation 컨벤션과 일관. 향후 시계 의존 확대 시 Clock 빈 도입 권고(범위 밖).
