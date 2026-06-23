# P10 설계 초안: 워크스페이스 삭제·나가기 (US-WS-04)

## 설계 규모
중형. 신규 파일 0, 수정 소스 2(WorkspaceService, WorkspaceController) + 테스트. 16 AC, P9 패턴 답습. RGR 4슬라이스.

## 개요 / 접근
세 서비스 메서드 완성: renameWorkspace(스텁→구현), deleteWorkspace(스텁→구현), leaveWorkspace(신규). P9 removeMember/updateMemberRole 검증 구조·예외 타입 답습. 컨트롤러 currentUserId=null 2곳 → requireCurrentUserId(), leave 엔드포인트(DELETE /{id}/members/me) 신설.

핵심 결정 3:
1. 삭제 cascade = DB ON DELETE CASCADE 의존 workspaceRepository.deleteById() 단일 호출.
2. 검증 순서 — 삭제는 권한 우선(requireOwner→조회→PERSONAL 차단) → AC-5는 403 확정. leave는 멤버십 우선(조회 404→PERSONAL 400→마지막 OWNER 400).
3. WS 강제종료 — 삭제 시 멤버십 삭제 전 멤버 목록 캡처 후 각자 disconnect, 나가기 시 본인 disconnect. best-effort(클라이언트 계약 흡수, 서비스 try/catch 없음).

## 변경 범위
- 신규: 없음
- 수정(소스): WorkspaceService.java(rename/delete 본문 + leave 신규), WorkspaceController.java(PATCH/DELETE /{id} 배선 + leave 신설)
- 수정/신규(테스트): WorkspaceService 단위(@InjectMocks 확장), WorkspaceDeleteLeaveIntegrationTest(신규, Testcontainers cascade 실증 + HTTP E2E)

## 상세 설계

### 1. renameWorkspace (FR-7, AC-13/14)
시그니처: `@Transactional public WorkspaceDto renameWorkspace(UUID currentUserId, UUID workspaceId, RenameWorkspaceRequest request)`
순서: requireWorkspaceMember(403 비멤버) → request null 방어 + normalizeName(400) → findById(orElseThrow EntityNotFound) → setName(@Setter) → save → toDto.
권장 배치: 가드 → normalizeName → 조회 → setName → save (입력검증을 DB조회보다 먼저).

### 2. deleteWorkspace (FR-1/2/3/8, AC-1~5/15)
시그니처: `@Transactional public void deleteWorkspace(UUID currentUserId, UUID workspaceId)`
순서(BR-1 권한 우선, P9 일관):
1. requireOwner → MEMBER/비멤버/없는WS 모두 403 (AC-3/4/5 전부 403)
2. findById(orElseThrow EntityNotFound) — 타입 확인용 로드
3. PERSONAL 차단: type==PERSONAL → IllegalArgumentException("개인 워크스페이스는 삭제할 수 없습니다") 400. (IllegalStateException 금지=500)
4. 멤버 목록 캡처(삭제 전): findByWorkspaceId → 각 userId disconnectUser (AC-15). deleteById 전 필수.
5. workspaceRepository.deleteById(workspaceId) — DB cascade로 자식 정리.

cascade 전략: deleteById 단일 호출 + DB ON DELETE CASCADE 의존(권장). 근거: V1 5개 자식 FK 전부 CASCADE, ddl-auto=validate+Flyway 운영/테스트 동일. Hibernate는 자식 JPA 매핑 없어 순수 DB FK가 정리. 통합테스트로 삭제 후 5개 자식 카운트 0 실증(안전망). 명시적 JPA 삭제는 5중 중복·순서버그·이중관리 → 기각.

### 3. leaveWorkspace (FR-4/5/9, BR-2/3/5/6/7, AC-6~11/16) 신규
시그니처: `@Transactional public void leaveWorkspace(UUID currentUserId, UUID workspaceId)`
순서(BR-7):
1. findByUserIdAndWorkspaceId(orElseThrow EntityNotFound 404) — 비멤버/없는WS/이미나감 모두 404
2. findById(워크스페이스) → PERSONAL 차단 IllegalArgumentException("개인 워크스페이스에서는 나갈 수 없습니다") 400
3. 마지막 OWNER 차단: role==OWNER && countByWorkspaceIdAndRole(ws,OWNER)<=1 → IllegalArgumentException("마지막 OWNER는 워크스페이스에서 나갈 수 없습니다") 400 (BR-6 메시지 구분)
4. membershipRepository.delete(m) — 본인만
5. disconnectUser(currentUserId) best-effort (try/catch 없음, P9 패턴)

### 4. Controller 배선 + leave 엔드포인트 (FR-6, AC-12)
- PATCH /{id}: currentUserId=null → requireCurrentUserId()
- DELETE /{id}: 동일
- 신설:
```
@DeleteMapping("/{id}/members/me")
public ResponseEntity<Void> leaveWorkspace(@PathVariable UUID id) {
    UUID currentUserId = currentUserService.requireCurrentUserId();
    workspaceService.leaveWorkspace(currentUserId, id);
    return ResponseEntity.noContent().build();
}
```
경로 충돌: 기존 /{id}/members/{userId}와 /{id}/members/me 공존 — Spring MVC 리터럴 세그먼트(me) 우선 매칭. 통합테스트로 확인.

## 구현 순서 (RGR)
1. [Must] T1 — renameWorkspace + PATCH 배선 (의존 없음). FR-6(PATCH)/FR-7/AC-12(PATCH)/13/14.
2. [Must] T2 — deleteWorkspace + DELETE 배선 + 삭제 WS강제종료 (의존 T1, 동일파일). FR-1/2/3/6(DELETE)/8, BR-1/4, AC-1~5/12(DELETE)/15.
3. [Must] T3 — leaveWorkspace + leave 엔드포인트 + 나가기 WS강제종료 (의존 T2, 동일파일). FR-4/5/9, BR-2/3/5/6/7, AC-6~11/16.
4. [Should] T4 — cascade 실증 통합테스트 (의존 T2). AC-1 삭제 후 5자식 카운트0.
각 태스크 RGR: 단위(@InjectMocks) Red→서비스 Green→통합(Testcontainers+MockMvc) Red→배선 Green.

## 테스트 가능성 고려
- 단위: @InjectMocks WorkspaceService, 전 의존 mock(repo/guard/client). rename/delete/leave 각 분기 mock+verify. 마지막OWNER 차단 시 delete/disconnect never() verify.
- 통합: AbstractIntegrationTest(Testcontainers PG+Flyway V1), @AutoConfigureMockMvc, @MockitoBean WsRelayAdminClient(실HTTP차단), oauth2Login asUser 헬퍼. cascade 실증은 실DB로만.
- disconnect best-effort: 서비스 try/catch 없음. RestWsRelayAdminClientTest가 5xx 미전파 단위커버. 통합은 disconnectUser 호출횟수 verify(AC-15/16).

## 미해결 질문 (오케스트레이터가 사용자에게 확인 예정)
1. PERSONAL 삭제/나가기 차단 메시지 문구 — 권장(a): 삭제 "개인 워크스페이스는 삭제할 수 없습니다" / 나가기 "개인 워크스페이스에서는 나갈 수 없습니다".
2. AC-5(없는 WS 삭제) 기대코드 — 권장(a): 403 확정(P9 일관·존재 비누설).
