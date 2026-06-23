# P10 설계: 워크스페이스 삭제·나가기 (US-WS-04)

> 확정본. architect 설계 + design-critic MUST-ADDRESS 반영 + test-architect Testability 평가(9/10 PASS) 병합.
> 확정 정책(2026-06-23): leave=`DELETE /{id}/members/me` · 마지막 OWNER 차단=400 · WS 강제종료 포함 · rename 포함 · AC-5=403 · PERSONAL 메시지 동작별 구분.

## 설계 규모
**중형.** 신규 파일 0, 수정 소스 2(WorkspaceService, WorkspaceController) + 테스트. 16 AC, P9 패턴 답습. RGR 4슬라이스.

## 개요 / 접근
세 서비스 메서드를 완성: `renameWorkspace`(스텁→구현), `deleteWorkspace`(스텁→구현), `leaveWorkspace`(신규). 모두 P9 `removeMember`/`updateMemberRole` 검증 구조·예외 타입 컨벤션 답습. 컨트롤러 `currentUserId=null` 2곳 → `requireCurrentUserId()`, leave 엔드포인트(`DELETE /{id}/members/me`) 신설.

핵심 결정 3:
1. 삭제 cascade = DB `ON DELETE CASCADE` 의존 `workspaceRepository.deleteById()` 단일 호출.
2. 검증 순서 — 삭제는 **권한 우선**(requireOwner→조회→PERSONAL 차단), 없는 WS=**403**(AC-5). leave는 **멤버십 우선**(조회 404→PERSONAL 400→마지막 OWNER 400).
3. WS 강제종료 — 삭제 시 멤버십 삭제 **전** 멤버 목록 캡처 후 각자 disconnect, 나가기 시 본인 disconnect. best-effort(클라이언트 계약 흡수, 서비스 try/catch 없음).

## 변경 범위
- **신규**: 없음
- **수정(소스)**:
  - `backend/src/main/java/com/ieum/workspace/WorkspaceService.java` — rename/delete 본문 구현 + leave 신규
  - `backend/src/main/java/com/ieum/workspace/WorkspaceController.java` — PATCH/DELETE `/{id}` 배선 수정 + leave 엔드포인트 신설
- **수정/신규(테스트)**:
  - `backend/src/test/java/com/ieum/workspace/WorkspaceServiceTest.java`(기존 확장) 또는 신규 단위 — rename/delete/leave @InjectMocks 분기 검증
  - `backend/src/test/java/com/ieum/workspace/WorkspaceDeleteLeaveIntegrationTest.java`(신규) — Testcontainers cascade 실증 + HTTP E2E + 라우팅

## 상세 설계

### 1. renameWorkspace (FR-7, AC-13/14)
```
@Transactional
public WorkspaceDto renameWorkspace(UUID currentUserId, UUID workspaceId, RenameWorkspaceRequest request)
```
순서: **가드 → 입력검증 → 조회 → 저장**
1. `accessGuard.requireWorkspaceMember(currentUserId, workspaceId)` — 비멤버 → `AccessDeniedException`(403, AC-14).
2. `request`/`request.name()` null 방어 + `String name = normalizeName(request.name())`(기존 private static 재사용) — 빈/공백/100자 초과 → `IllegalArgumentException`(400).
3. `Workspace ws = workspaceRepository.findById(workspaceId).orElseThrow(() -> new EntityNotFoundException("워크스페이스를 찾을 수 없습니다."))`.
4. `ws.setName(name)`(엔티티 `@Setter`) → `workspaceRepository.save(ws)`.
5. `return toDto(ws)`.

(중복 조회 주석: requireWorkspaceMember는 Membership을 반환, setName엔 Workspace 엔티티 필요 → 별도 findById는 정당한 2회 조회. AccessGuard 시그니처 변경은 P9 일관성 훼손이라 기각 — design-critic 확인.)

### 2. deleteWorkspace (FR-1/2/3/8, AC-1~5/15)
```
@Transactional
public void deleteWorkspace(UUID currentUserId, UUID workspaceId)
```
순서(BR-1 권한 우선, P9 일관):
1. `accessGuard.requireOwner(currentUserId, workspaceId)` — MEMBER/비멤버/**없는 WS** 모두 멤버십 부재 → `AccessDeniedException`(403). **AC-3·AC-4·AC-5 전부 403.**
2. `Workspace ws = workspaceRepository.findById(workspaceId).orElseThrow(() -> new EntityNotFoundException(...))` — 타입 확인용 로드.
3. PERSONAL 차단: `if (ws.getType() == WorkspaceType.PERSONAL) throw new IllegalArgumentException("개인 워크스페이스는 삭제할 수 없습니다")` → 400(AC-2). **IllegalStateException 금지(500 유발).**
4. **멤버 목록 캡처(삭제 전)**: `List<Membership> members = membershipRepository.findByWorkspaceId(workspaceId)` → 각 `m.getUserId()`로 `wsRelayAdminClient.disconnectUser(userId)`(AC-15). **deleteById 전 필수**(cascade로 멤버십 유실 방지).
5. `workspaceRepository.deleteById(workspaceId)` — DB cascade로 자식 정리.

#### cascade 전략 (확정: deleteById 단일 호출 + DB ON DELETE CASCADE 의존)
- 근거: V1__init.sql 5개 자식 FK 전부 CASCADE(memberships/invitations/pages→workspaces, crdt_ops/snapshots→pages). `ddl-auto=validate`+Flyway 운영/테스트 동일.
- **Membership 등 자식 엔티티에 JPA 연관관계 매핑이 없음**(순수 `UUID workspaceId` 컬럼). 따라서 Hibernate는 부모-자식 cascade를 모르고 `deleteById`는 `DELETE FROM workspaces` 단일 SQL만 생성 → 자식 정리는 **순수 DB FK cascade**가 담당.
- **[MUST 불변식 — design-critic]**: `deleteById` 호출 이후 **동일 트랜잭션에서 4단계에 캡처한 Membership(또는 그 워크스페이스의 어떤 자식 엔티티)을 수정/저장하지 않는다.** 캡처한 Membership을 deleteById 이후 setX+save하면 DB엔 이미 cascade 삭제된 행 → `StaleStateException`. 현재 설계는 캡처 후 읽기(disconnect)만 하므로 안전하나, 향후 삭제 경로에 멤버십 수정 로직을 끼우지 말 것.
- **실증(T4)**: 통합테스트가 ① 삭제 후 5개 자식 카운트 0 + ② `deleteById`가 영속성 예외 없이 정상 204 커밋(flush 순서)임을 실 DB로 검증.

### 3. leaveWorkspace (FR-4/5/9, BR-2/3/5/6/7, AC-6~11/16) 신규
```
@Transactional
public void leaveWorkspace(UUID currentUserId, UUID workspaceId)
```
순서(BR-7 엄수):
1. `Membership m = membershipRepository.findByUserIdAndWorkspaceId(currentUserId, workspaceId).orElseThrow(() -> new EntityNotFoundException("워크스페이스 멤버가 아닙니다."))` → 404. 비멤버(AC-10)·없는 WS(AC-11)·이미 나감(BR-5) 모두 404.
2. `Workspace ws = workspaceRepository.findById(workspaceId).orElseThrow(...)` → PERSONAL 차단: `if (ws.getType() == WorkspaceType.PERSONAL) throw new IllegalArgumentException("개인 워크스페이스에서는 나갈 수 없습니다")` → 400(AC-9, BR-2).
3. 마지막 OWNER 차단: `if (m.getRole() == MemberRole.OWNER && membershipRepository.countByWorkspaceIdAndRole(workspaceId, MemberRole.OWNER) <= 1) throw new IllegalArgumentException("마지막 OWNER는 워크스페이스에서 나갈 수 없습니다")` → 400(AC-8, FR-5, BR-6 — P9 메시지와 구분).
4. `membershipRepository.delete(m)` — 본인만(AC-6/7).
5. `wsRelayAdminClient.disconnectUser(currentUserId)` — best-effort(AC-16, try/catch 없음).

예외: 1=`EntityNotFoundException`(404) / 2·3=`IllegalArgumentException`(400). MEMBER 나가기(AC-6)는 3단계 `role==OWNER` false라 count 조회 안 함.

### 4. WorkspaceController 배선 + leave 엔드포인트 (FR-6, AC-12)
- PATCH `/{id}`(`:58`): `UUID currentUserId = null;` → `currentUserService.requireCurrentUserId();`
- DELETE `/{id}`(`:68`): 동일 교체.
- 신설:
```
@DeleteMapping("/{id}/members/me")
public ResponseEntity<Void> leaveWorkspace(@PathVariable UUID id) {
    UUID currentUserId = currentUserService.requireCurrentUserId();
    workspaceService.leaveWorkspace(currentUserId, id);
    return ResponseEntity.noContent().build();
}
```
- 경로 충돌: 기존 `/{id}/members/{userId}`와 `/{id}/members/me` 공존 — Spring MVC 리터럴 세그먼트(`me`)가 변수(`{userId}`)보다 우선 매칭 → 충돌 없음. 통합테스트로 `/me`=204, `/본인UUID`=400(removeMember 자기제거 차단) 둘 다 검증(design-critic 권고).
- **AC-12 메커니즘(design-critic)**: 미인증 401은 `SecurityConfig.anyRequest().authenticated()`가 컨트롤러 진입 전 처리(`requireCurrentUserId` 미도달). 배선 버그의 실제 노출 경로는 "인증됨→null 전달→오동작". 따라서 AC-12 검증은 ① 미인증 401 + ② **인증 사용자 정상 경로**(rename 200/delete 204)로 배선 회귀를 실증(AC-13/AC-1이 ②를 커버).

## 구현 순서 (RGR 태스크)
동일 파일(WorkspaceService·WorkspaceController) 수정 태스크 간 의존 명시(덮어쓰기 방지).

1. **[Must] T1 — renameWorkspace + PATCH 배선** (의존 없음). FR-6(PATCH)/FR-7, AC-12(PATCH)/13/14.
2. **[Must] T2 — deleteWorkspace + DELETE 배선 + 삭제 WS 강제종료** (의존 T1, 동일파일). FR-1/2/3/6(DELETE)/8, BR-1/4, AC-1~5/12(DELETE)/15.
3. **[Must] T3 — leaveWorkspace + leave 엔드포인트 + 나가기 WS 강제종료** (의존 T2, 동일파일). FR-4/5/9, BR-2/3/5/6/7, AC-6~11/16.
4. **[Should] T4 — cascade 실증 통합테스트 보강** (의존 T2). AC-1 삭제 후 5자식 카운트 0 + deleteById 정상 커밋.

각 태스크 RGR: 단위(@InjectMocks WorkspaceService) Red → 서비스 Green → 통합(Testcontainers + MockMvc oauth2Login) Red → 컨트롤러 배선 Green.

## Testability 평가 (test-architect)

### Score: 9/10 → ✅ TESTABILITY PASS

### 컴포넌트별 테스트 전략
- **renameWorkspace**: 단위 @InjectMocks — 성공(save verify+DTO name)/403(requireWorkspaceMember throw→save never)/400(normalizeName 위반→findById·save never)/404(findById empty). 통합 — PATCH+asUser 200·DB 반영(AC-13), 비멤버 403(AC-14). 모의: workspaceRepository, accessGuard.
- **deleteWorkspace**: 단위 — 성공(requireOwner→findById SHARED→findByWorkspaceId→deleteById 1회+멤버별 disconnectUser verify)/403(requireOwner throw→deleteById·disconnect never)/400 PERSONAL(예외 타입 단언, deleteById never)/없는WS(requireOwner throw 403). 통합(Testcontainers) — cascade 실증(AC-1)·PERSONAL 400(AC-2)·MEMBER 403(AC-3)·비멤버 403(AC-4)·없는WS 403(AC-5)·전체멤버 disconnect(AC-15). 모의: 단위 전 의존, 통합 @MockitoBean WsRelayAdminClient.
- **leaveWorkspace**: 단위 — 성공MEMBER(AC-6)/성공OWNER 2명(AC-7)/400 마지막OWNER(AC-8, 메시지 단언, delete·disconnect never)/400 PERSONAL(AC-9)/404(AC-10/11). 통합 — /me 204·DB 삭제(AC-6), OWNER 2명 V 유지(AC-7, addOwnerB 재사용), 400 메시지(AC-8), 404(AC-10/11), 라우팅(/me vs /{userId}). 본인 disconnect(AC-16). 모의: membershipRepository·workspaceRepository·wsRelayAdminClient.
- **Controller 배선**: 통합 — 미인증 401(AC-12) + 인증 정상(AC-13/AC-1). @MockitoBean WsRelayAdminClient.

### 보강 권고 (red-writer/통합테스트 작성 시 반영 — test-architect + design-critic)
1. **cascade 자식 픽스처 레시피(T4)**: 통합테스트에 `@Autowired PageRepository/CrdtOpRepository/SnapshotRepository/InvitationRepository`. page 1개 save → 그 pageId로 crdt_op·snapshot save(**jsonb payload/state는 NOT NULL → `"{}"` 등 유효 JSON 문자열**), invitation/membership save. `serverSeq`는 `insertable=false` IDENTITY라 빌더 생략. 삭제 후 **workspace/page 스코프 조회**(findByWorkspaceId*, pageId 기준)로 카운트 0 단언(전역 count()는 잔여 데이터 영향 → 지양).
2. **@BeforeEach 정리 FK 역순**: `crdt_op/snapshot → page → membership/invitation → workspace → user` 순 deleteAll(기존 MemberManagementIntegrationTest는 crdt_op/snapshot/invitation 정리 누락 → 신규 테스트에서 보강).
3. **AC-15 ArgumentCaptor**: 단순 `times(N)`보다 `ArgumentCaptor<UUID>`로 disconnect 호출 인자 집합 == 삭제 전 멤버 userId 집합 단언(삭제 전 캡처 보장).
4. **disconnect 예외 비롤백 단위 케이스**: 단위에서 mock `disconnectUser`가 예외를 던지도록 stub → 서비스가 그대로 진행/커밋(delete 수행)됨 검증. (RestWsRelayAdminClientTest는 5xx 미전파를 단위 커버하나, 서비스 비롤백은 별도 명시.)
5. **AC-12 배선 회귀**: 미인증 401 + 인증 정상(rename 200/delete 204) 둘 다.

### 만점 아닌 이유
cascade 실증이 실DB 통합에만 의존(단위 불가 — 설계 의도된 trade-off) + 자식 픽스처 jsonb/FK 정리 주의.

## design-critic 처리 결과
- **MUST-ADDRESS #1 (cascade 불변식)**: 위 §2 cascade 전략에 불변식 명시 + T4 실증 강화로 해소.
- **MUST-ADDRESS #2 (AC-5 403/404 충돌)**: 403 확정 + PRD AC-5/BR-1/BR-4를 403으로 동기화 완료.
- CONSIDER(전부 수용/종결): WS disconnect 트랜잭션 내부 호출=P9 일관성 우선(삭제 롤백 시 이미 끊긴 사용자=best-effort 허용 손실 명시) / AC-12 인증경로 검증 보강(§4) / 중복조회=정당 / /me 라우팅=안전+양경로 테스트 / 검증순서 비대칭=의미적 정당.

## 미해결 질문
없음. 추가 확인 사항 없음. 설계가 완료되었습니다.
