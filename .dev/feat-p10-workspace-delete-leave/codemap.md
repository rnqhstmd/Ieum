## 코드 맵: P10 워크스페이스 삭제·나가기 (US-WS-04)

### 핵심 파일
- backend/src/main/java/com/ieum/workspace/WorkspaceService.java:117 → `renameWorkspace` 스텁(UnsupportedOperationException) · `deleteWorkspace`:129 스텁 · `removeMember`:169 (OWNER 멤버 제거 패턴 참조) · `@Transactional(readOnly=true)` 클래스 기본
- backend/src/main/java/com/ieum/workspace/WorkspaceController.java:54 → PATCH `/{id}`(rename, currentUserId=null 배선버그) · DELETE `/{id}`:66(delete, currentUserId=null 배선버그). leave 엔드포인트 신설 위치
- backend/src/main/java/com/ieum/workspace/WorkspaceRepository.java → `deleteById`(JpaRepository) · `findFirstByOwnerIdAndType` · `existsByOwnerIdAndType`
- backend/src/main/java/com/ieum/workspace/MembershipRepository.java:14 → `findByUserIdAndWorkspaceId` · `countByWorkspaceIdAndRole`(P9, 마지막 OWNER 판정) · `delete`(JpaRepository)
- backend/src/main/java/com/ieum/common/security/AccessGuard.java:33 → `requireOwner`(403) · `requireWorkspaceMember`(403). 삭제=requireOwner, leave=requireWorkspaceMember

### 참조 파일
- backend/src/main/resources/db/migration/V1__init.sql:25 → **ON DELETE CASCADE** 완비: memberships/invitations/pages → workspaces; crdt_ops/snapshots → pages. deleteById 1회로 DB cascade
- backend/src/main/java/com/ieum/workspace/Workspace.java → 엔티티(type PERSONAL/SHARED, ownerId)
- backend/src/main/java/com/ieum/workspace/WorkspaceType.java → PERSONAL/SHARED (PERSONAL 삭제·나가기 정책 분기)
- backend/src/main/java/com/ieum/workspace/dto/RenameWorkspaceRequest.java → rename 요청 DTO
- backend/src/main/java/com/ieum/workspace/WsRelayAdminClient.java → disconnectUser(best-effort). 삭제/leave 시 WS 강제종료 필요성 검토
- backend/src/test/java/com/ieum/workspace/MemberManagementIntegrationTest.java → P9 통합테스트(Testcontainers) 패턴·addOwnerB 헬퍼 참조
- backend/src/test/java/com/ieum/workspace/WorkspaceServiceTest.java → 워크스페이스 서비스 단위테스트 패턴

### 설정
- backend/src/main/java/com/ieum/common/ApiExceptionHandler.java → AccessDeniedException→403 / EntityNotFoundException→404 / IllegalArgumentException→400 / ConflictException→409 / GoneException→410 / **그 외(IllegalStateException 포함)→catch-all 500**. ⚠️ 스텁의 "PERSONAL이면 IllegalStateException"은 500 유발 → PERSONAL 삭제 불가·마지막 OWNER 차단은 IllegalArgumentException(400) 또는 ConflictException(409)로 설계
