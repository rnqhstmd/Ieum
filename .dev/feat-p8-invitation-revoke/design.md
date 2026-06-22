# 설계: P8 후속① — 초대 철회(REVOKE) + 초대 목록 조회

## 설계 규모
**소형** — 기존 InvitationService/Controller의 확립된 패턴(createInvitation/acceptInvitation)을 그대로 따르며, 스텁 2개 메서드 구현 + 리포지토리 메서드 1개 추가 + 컨트롤러 2곳 배선만 수정. 신규 추상화·신규 도메인 파일 없음.

## 확정 결정 (사용자 승인)
1. **revoke 검증 순서**: `requireOwner` 선행 (OWNER 먼저). 비OWNER가 타 워크스페이스 초대 ID를 probe해도 403으로 차단 → 자원 은닉. create 패턴과 일치.
2. **목록 응답 DTO**: 기존 `InvitationDto` 재사용 (create/accept와 일관). AC-1 명시 필드의 상위집합.
3. **비PENDING revoke 409 메시지**: `"철회할 수 없는 초대 상태입니다."` (내부 enum 미노출, accept 정책과 동일).

## 변경 범위

### 수정 파일 (3개 프로덕션)
| 파일 | 역할 |
|------|------|
| `backend/src/main/java/com/ieum/invitation/InvitationRepository.java` | `findByWorkspaceIdOrderByCreatedAtDesc(UUID)` 파생 쿼리 추가 |
| `backend/src/main/java/com/ieum/invitation/InvitationService.java:135,151` | `listInvitations`/`revokeInvitation` 스텁 → 실제 구현 |
| `backend/src/main/java/com/ieum/invitation/InvitationController.java:45,57` | `currentUserId=null` TODO → `currentUserService.requireCurrentUserId()` 배선 |

### 신규/수정 테스트 (3개)
| 파일 | 역할 |
|------|------|
| `backend/src/test/java/com/ieum/invitation/InvitationServiceTest.java` | `listInvitations`/`revokeInvitation` 단위 테스트 추가 |
| `backend/src/test/java/com/ieum/invitation/InvitationListIntegrationTest.java` (신규) | 목록 조회 MockMvc 통합 (AC-1~5) |
| `backend/src/test/java/com/ieum/invitation/InvitationRevokeIntegrationTest.java` (신규) | 철회 MockMvc 통합 (AC-6~13) |

신규 도메인 코드 파일 없음. ConflictException/EntityNotFoundException/AccessDeniedException 모두 기존 존재, ApiExceptionHandler가 409/404/403 매핑 보유.

## 적용 컨벤션
- **OWNER 검증**: `accessGuard.requireOwner(currentUserId, wsId)` → 비OWNER `AccessDeniedException` → 403 + `code:FORBIDDEN`. createInvitation:85과 동일.
- **인증 추출**: 컨트롤러 `currentUserService.requireCurrentUserId()`. 미인증은 `SecurityConfig.anyRequest().authenticated()` + `JsonAuthenticationEntryPoint`가 컨트롤러 진입 전 401(`code:UNAUTHORIZED`)로 차단 → 컨트롤러/서비스는 401 미처리.
- **상태 충돌**: `ConflictException`(409, `code:CONFLICT`). `IllegalStateException` 금지(매핑 없음→500). 고정 문자열 메시지.
- **자원 은닉**: 미존재·타 워크스페이스 → `EntityNotFoundException`(404, `code:NOT_FOUND`).
- **트랜잭션**: 클래스 `@Transactional(readOnly=true)` 기본. `revokeInvitation`은 `@Transactional`(이미 부착). `listInvitations`는 readOnly 기본.
- **DTO 변환**: 기존 `toDto(Invitation)` private 헬퍼 재사용.
- **DI 격리**: 서비스 `@InjectMocks`+협력자 `@Mock`. 컨트롤러 통합 `AbstractIntegrationTest`+`@AutoConfigureMockMvc`+`oauth2Login()`.

## 상세 설계

### 1. InvitationRepository
Spring Data 파생 쿼리(기존 `findByToken` 컨벤션). 정렬을 메서드명으로 표현 → 서비스 재정렬 불필요. 빈 결과 → 빈 List(AC-3).
```java
List<Invitation> findByWorkspaceIdOrderByCreatedAtDesc(UUID workspaceId);
```

### 2. InvitationService.listInvitations
```java
public List<InvitationDto> listInvitations(UUID currentUserId, UUID wsId)
```
1. `accessGuard.requireOwner(currentUserId, wsId)` — 비OWNER 403(AC-5)
2. `invitationRepository.findByWorkspaceIdOrderByCreatedAtDesc(wsId)`
3. `.stream().map(this::toDto).toList()` 반환
- readOnly 트랜잭션(클래스 기본). 빈 워크스페이스 → 빈 리스트 → 컨트롤러 200+`[]`(AC-3). 정렬은 리포지토리 보장(AC-2).

### 3. InvitationService.revokeInvitation
```java
@Transactional
public void revokeInvitation(UUID currentUserId, UUID wsId, UUID invitationId)
```
검증 순서 (확정 결정 1 — requireOwner 선행):
1. `accessGuard.requireOwner(currentUserId, wsId)` → 비OWNER `AccessDeniedException`(403, AC-13)
2. `invitationRepository.findById(invitationId)` → 없으면 `EntityNotFoundException`(404, AC-10)
3. `inv.getWorkspaceId().equals(wsId)` 불일치 → `EntityNotFoundException`(404, AC-11, 자원 은닉)
4. `inv.getStatus() != PENDING` → `ConflictException("철회할 수 없는 초대 상태입니다.")`(409, AC-7/8/9)
5. `inv.setStatus(REVOKED)` → `invitationRepository.save(inv)` (AC-6)
- BR-4 단일 트랜잭션은 `@Transactional`로 충족. AC-7/8/9는 4단계에서 차단 → save 미도달 → status 불변.

### 4. InvitationController 배선
- `:45` listInvitations: `UUID currentUserId = currentUserService.requireCurrentUserId();` → `ResponseEntity.ok(...)`(200, AC-1)
- `:57` revokeInvitation: `UUID currentUserId = currentUserService.requireCurrentUserId();` → `ResponseEntity.noContent().build()`(204, AC-6)
- 시그니처·반환·매핑 변경 없음. 미인증은 진입 전 401 차단(AC-4/12).

## 구현 순서 (RGR 단위)
```
1. InvitationRepository.findByWorkspaceIdOrderByCreatedAtDesc 추가 (선행, 컴파일)
2. RGR: InvitationServiceTest listInvitations 단위(Red) → listInvitations 구현(Green)
3. RGR: InvitationServiceTest revokeInvitation 단위(Red) → revokeInvitation 구현(Green)
   — 2와 같은 파일이라 순차. 논리 의존은 1만.
4. InvitationController 배선 (의존 2,3)
5. InvitationListIntegrationTest (AC-1~5) (의존 4)
6. InvitationRevokeIntegrationTest (AC-6~13) (의존 4)
   — 5와 독립 파일 → 병렬 가능
```

## 테스트 전략 개요
- **단위(InvitationServiceTest)**: 협력자 `@Mock`, `@InjectMocks`. listInvitations(requireOwner 위임/비OWNER 차단·repo never/매핑/빈). revokeInvitation 5단계 각각 + BR-2 회귀 가드(ConflictException 타입 단언, never save).
- **통합(testcontainers)**: List(정렬 AC-2/빈 AC-3/MEMBER 403 AC-5/미인증 401 AC-4), Revoke(204+DB REVOKED AC-6 / 비PENDING 409+DB불변 AC-7~9 / 404 AC-10·11 / 미인증 401 AC-12 / MEMBER 403 AC-13).

---

## Testability 평가 (test-architect)

### Testability Score: 9/10 — ✅ PASS
모든 협력자 생성자 주입+Mockito mock 가능. `@InjectMocks` 단위 패턴 + testcontainers 통합 패턴이 도메인에 이미 정착. ConflictException→409 / EntityNotFoundException→404 / AccessDeniedException→403+`code:FORBIDDEN` 매핑 확정. 검증 순서 5단계 단위 완전 격리(AC-11 포함). 전역 상태·static 의존 없음.

1점 감점(차단 아님): AC-2 정렬 검증이 `@CreationTimestamp` 자동 채움에 의존 → 동일 밀리초 삽입 시 비결정 위험.

### 테스트 작성 지침 (Green 단계 준수 필수)
1. **AC-2 정렬**: 통합 테스트에서 행마다 `createdAt` 시차를 명시적으로 보장(헬퍼에 createdAt 파라미터 추가 또는 삽입 간 시간 분리). mock 단위로 정렬 검증 금지(동어반복).
2. **AC-6~9 상태**: 단위(`verify(repo).save` / `verify(repo, never()).save`)와 통합(DB 재조회 영속/불변)을 모두 작성. 트랜잭션 함정은 단위만으로 못 잡음.
3. **revoke 비PENDING**: `ConflictException`(409)이어야 하며 `IllegalStateException`(→500) 금지 — 단위에서 예외 타입 단언으로 회귀 고정.
4. **AC-4/AC-12 미인증 401**: 컨트롤러/서비스 아닌 통합(MockMvc, `.with(asUser)` 생략)으로만 검증.

### 격리 전략 (red-writer 참조)
- 단위: `accessGuard`/`invitationRepository`를 `@Mock`. requireOwner는 `doThrow(AccessDeniedException)`로 비OWNER 시뮬레이션. findById는 `Optional.of(invitation)` / `Optional.empty()` 스텁. AC-11은 workspaceId가 다른 invitation 반환.
- 통합: `InvitationAcceptIntegrationTest`의 setUp/asUser/saveInvitation 헬퍼 복제. **AC-2용 createdAt 시차 헬퍼 별도 추가**(saveInvitation은 createdAt 미설정).
