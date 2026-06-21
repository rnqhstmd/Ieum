# 설계: P7 공유 워크스페이스 생성 (US-WS-02) — 슬라이스 ①

## 설계 규모
**소형** — 기존 스캐폴드의 서비스 메서드 1개 본문 구현 + 컨트롤러 1줄 인증 배선 + 단위/통합 테스트. 신규 엔티티·리포지토리·DTO·엔드포인트 없음(이미 스캐폴드 존재).

## 접근 방식
P7 스캐폴드(`WorkspaceController`/`WorkspaceService`/DTO/Repository)가 이미 존재하고, 본문만 `UnsupportedOperationException` 스텁이다. 따라서 **새 구조를 만들지 않고 기존 시그니처를 그대로 채운다.** 저장 패턴은 같은 클래스의 `ensurePersonalWorkspace`(Workspace 저장 → OWNER Membership 저장)를 그대로 미러링하여 일관성을 유지한다.

## 변경 범위 (4개 파일: 수정 2 · 테스트 2)

### 수정
1. `backend/src/main/java/com/ieum/workspace/WorkspaceService.java`
   - `createSharedWorkspace(UUID currentUserId, CreateWorkspaceRequest request)` 본문 구현 (TODO 스텁 제거).
   - private `normalizeName(String)` 헬퍼 추가 (trim + 1~100자 검증).
   - 상수 `NAME_MAX = 100` 추가.
2. `backend/src/main/java/com/ieum/workspace/WorkspaceController.java`
   - `createWorkspace`: `UUID currentUserId = null; // TODO` → `UUID currentUserId = currentUserService.requireCurrentUserId();`
   - (다른 스텁 메서드의 `null`/`UnsupportedOperationException`은 이번 슬라이스 범위 밖 — 손대지 않음)

### 테스트 (신규/추가)
3. `backend/src/test/java/com/ieum/workspace/WorkspaceServiceTest.java` (기존 파일에 테스트 추가)
   - AC-1: createSharedWorkspace_savesSharedWorkspaceAndOwnerMembership
   - AC-2: createSharedWorkspace_nameBoundary_1and100_ok (1자·100자)
   - AC-3: createSharedWorkspace_invalidName_throwsAndSavesNothing (빈/공백/101자, `never()` 검증)
4. `backend/src/test/java/com/ieum/workspace/WorkspaceCreateIntegrationTest.java` (신규)
   - AC-4: 인증 사용자 POST 유효 이름 → 201 + SHARED·ownerId + OWNER membership DB 1건
   - AC-5: 빈 이름 POST → 400 INVALID_ARGUMENT
   - AC-6: 미인증 POST → 401 + workspaces 미증가

## 핵심 인터페이스 (기존 시그니처 유지)
```java
// WorkspaceService (수정)
@Transactional
public WorkspaceDto createSharedWorkspace(UUID currentUserId, CreateWorkspaceRequest request) {
    String name = normalizeName(request.name());
    Workspace ws = workspaceRepository.save(Workspace.builder()
            .type(WorkspaceType.SHARED).ownerId(currentUserId).name(name).build());
    membershipRepository.save(Membership.builder()
            .userId(currentUserId).workspaceId(ws.getId()).role(MemberRole.OWNER).build());
    return toDto(ws); // 기존 private toDto 재사용
}

private static final int NAME_MAX = 100;
private static String normalizeName(String raw) {
    String name = (raw == null) ? "" : raw.trim();
    if (name.isEmpty() || name.length() > NAME_MAX) {
        throw new IllegalArgumentException("워크스페이스 이름은 1자 이상 " + NAME_MAX + "자 이하여야 합니다.");
    }
    return name;
}
```
```java
// WorkspaceController (수정)
@PostMapping
public ResponseEntity<WorkspaceDto> createWorkspace(@RequestBody CreateWorkspaceRequest request) {
    UUID currentUserId = currentUserService.requireCurrentUserId();
    WorkspaceDto created = workspaceService.createSharedWorkspace(currentUserId, request);
    return ResponseEntity.status(HttpStatus.CREATED).body(created);
}
```

## 설계 판단 / 근거
- **이름 trim 후 검증·저장(S1)**: 공백만 = 빈 이름으로 거부. trim된 값을 저장해 앞뒤 공백 데이터 오염 방지.
- **검증을 서비스 계층에 둠**: 컨트롤러 `@Valid`/Bean Validation 미사용(DTO에 어노테이션 없음, 기존 컨벤션). 도메인 규칙이므로 서비스에서 `IllegalArgumentException`→`ApiExceptionHandler`가 400 매핑.
- **이름 유일성 미적용**: US-WS-02에 유일성 AC 없음 → 동일 이름 다중 SHARED WS 허용.
- **createdAt 미검증**: @CreationTimestamp는 flush 시점 채워짐. AC는 type/ownerId/name만 검증(단위 mock에서 null이어도 무방).

## 구현 순서 (RGR 2 태스크)
1. **T1 (AC-1,2,3) — 서비스 단위**: RED(WorkspaceServiceTest 3건 작성·실패 확인) → GREEN(createSharedWorkspace+normalizeName 구현) → REFACTOR(중복/네이밍 정리).
2. **T2 (AC-4,5,6) — REST 통합**: RED(WorkspaceCreateIntegrationTest 3건 작성·실패 확인) → GREEN(컨트롤러 인증 배선) → REFACTOR.

## 위험 / 주의
- 컨트롤러의 다른 스텁 메서드(rename/delete/members)는 여전히 `currentUserId=null`+`UnsupportedOperationException`. 이번 슬라이스 미수정 — 컴파일·기존 테스트 무영향(해당 엔드포인트 호출 테스트 없음 확인).
- 통합테스트 멤버십 검증: `MembershipRepository.findByUserIdAndWorkspaceId`(AccessGuard에서 사용 중) 활용.

---

## Testability 평가 (test-architect)

### 컴포넌트별 테스트 전략

#### WorkspaceService.createSharedWorkspace
- 단위 테스트: Mockito `@InjectMocks WorkspaceService` + `@Mock` 리포지토리. `workspaceRepository.save` stub이 id 부여한 Workspace 반환(기존 ensurePersonalWorkspace 테스트와 동일 패턴). ArgumentCaptor로 저장된 Workspace(type/ownerId/name)·Membership(role/userId/workspaceId) 검증.
- 통합 테스트: 불필요(순수 도메인 로직, REST 통합에서 간접 커버).
- 모의 대상: WorkspaceRepository, MembershipRepository, UserRepository.
- 격리 전략: 생성자 DI — 이미 완전 격리됨.
- AC 매핑: AC-1, AC-2, AC-3.

#### WorkspaceService.normalizeName (이름 검증)
- 단위 테스트: createSharedWorkspace 단위 테스트 내에서 경계값(1/100 통과, 빈/공백/101 예외+never save)으로 커버. 순수 함수라 부수효과 없음.
- 격리 전략: static 순수 함수.
- AC 매핑: AC-2, AC-3.

#### WorkspaceController.createWorkspace (인증 배선)
- 통합 테스트: `@AutoConfigureMockMvc` + `AbstractIntegrationTest`(Testcontainers PG). `oauth2Login().attributes(sub→googleId)`로 인증, 미인증은 `.with()` 생략. `MembershipRepository`로 OWNER row 검증.
- 모의 대상: 없음(실 DB Testcontainers). 인증은 SecurityMockMvc.
- 격리 전략: 통합(전체 스택). FK 순서 cleanup(membership→workspace→user)으로 테스트 격리.
- AC 매핑: AC-4, AC-5, AC-6.

### Testability Score: 9/10

### 판정
- ≥ 7 → ✅ **TESTABILITY PASS**
- 근거: 서비스는 완전 생성자 DI로 Mockito 격리 자명. 검증 로직은 순수 함수. REST는 기존 통합 패턴(PageDetailIntegrationTest) 재사용. 외부 의존(이메일/스케줄러) 없음. 감점 1: createdAt @CreationTimestamp의 flush 타이밍이 단위 mock에서 비결정적이나 AC 검증 대상 아님으로 영향 미미.
