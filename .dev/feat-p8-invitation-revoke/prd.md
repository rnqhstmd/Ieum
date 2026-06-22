# PRD: P8 후속① — 초대 철회(REVOKE) + 초대 목록 조회

## 배경

PR #19(초대 생성), PR #20(초대 수락) 완료 이후, 워크스페이스 OWNER가 발송한 초대를 관리할 수단이 없는 상태다. `InvitationService`의 `listInvitations` / `revokeInvitation` 두 메서드는 `UnsupportedOperationException` 스텁으로 존재하고, `InvitationController`의 해당 두 엔드포인트는 `currentUserId = null`을 서비스에 그대로 전달한다. 결과적으로 두 엔드포인트는 현재 500으로 응답하며 실질적으로 비활성 상태다.

완료해야 할 작업:
- `InvitationRepository`에 `findByWorkspaceId(UUID)` 추가
- `listInvitations` 스텁 구현 (OWNER 검증 → 조회 → DTO 변환)
- `revokeInvitation` 스텁 구현 (OWNER 검증 → 존재 확인 → 워크스페이스 일치 확인 → PENDING 검증 → REVOKED 전이)
- 두 컨트롤러 메서드에 `currentUserService.requireCurrentUserId()` 연결

## 요구사항

### 기능 요구사항
- [Must] FR-1: OWNER는 `GET /api/workspaces/{wsId}/invitations`로 해당 워크스페이스의 전체 초대 목록(상태 무관)을 받는다. 응답은 `createdAt` 내림차순 `InvitationDto` 배열이다.
- [Must] FR-2: OWNER는 `DELETE /api/workspaces/{wsId}/invitations/{invitationId}`로 PENDING 초대를 REVOKED로 전이시킨다. 성공 시 204 No Content.
- [Must] FR-3: 두 엔드포인트 모두 미인증 요청을 401로 거부한다.
- [Must] FR-4: 두 엔드포인트 모두 비OWNER 인증 사용자를 403으로 거부한다.
- [Must] FR-5: revoke 대상 초대가 존재하지 않거나, 경로 `wsId`와 초대의 `workspaceId`가 다르면 404로 응답한다.
- [Must] FR-6: PENDING이 아닌 초대(ACCEPTED/REVOKED/EXPIRED)에 revoke 시도 시 409로 응답한다.
- [Should] FR-7: 초대 0건일 때 목록 조회는 빈 배열(`[]`)과 200을 반환한다.

### 비즈니스 규칙
- [Must] BR-1: OWNER 검증에 기존 `accessGuard.requireOwner(currentUserId, wsId)` 사용. 비OWNER 시 `AccessDeniedException` → ApiExceptionHandler 403(JSON `code=FORBIDDEN`).
- [Must] BR-2: revoke는 PENDING 상태만 허용. ACCEPTED/REVOKED/EXPIRED 시도 시 `ConflictException`(409). (`IllegalStateException` 금지 — 핸들러 매핑 없음)
- [Must] BR-3: `invitationId`가 존재해도 초대의 `workspaceId`가 경로 `wsId`와 다르면 `EntityNotFoundException`(404). (타 워크스페이스 자원 존재 비노출)
- [Must] BR-4: `revokeInvitation`은 `@Transactional`. REVOKED 전이+저장이 단일 트랜잭션.
- [Must] BR-5: 인증 컨텍스트는 `currentUserService.requireCurrentUserId()`. 미인증 401. (create/accept 동일 패턴)
- [Should] BR-6: `listInvitations` 정렬 기준은 `createdAt` 내림차순.

### 품질 기대
- [Should] QE-1: OWNER가 목록 조회 시 방금 생성한 초대가 상단에 나타난다.
- [Should] QE-2: 이미 수락/만료된 초대 철회 시도 시 명확한 409 피드백.

## 수용 기준

**목록 조회 — 정상**

AC-1: OWNER 인증 사용자가 초대 목록을 조회하면 200과 배열을 받는다
  Given: 워크스페이스 W에 초대 3건(상태 혼재)이 존재하고, 요청자가 W의 OWNER 세션을 보유한다
  When: `GET /api/workspaces/{wsId}/invitations` 요청
  Then: HTTP 200, 응답 본문은 3건 `InvitationDto` 배열이며 각 항목에 `id`, `workspaceId`, `email`, `status`, `createdAt` 포함

AC-2: 목록이 `createdAt` 내림차순으로 반환된다
  Given: 워크스페이스 W에 초대 A(createdAt=T), B(createdAt=T+1h)가 존재하고, 요청자가 OWNER 세션을 보유한다
  When: `GET /api/workspaces/{wsId}/invitations` 요청
  Then: 응답 배열 첫 항목이 B(더 최근), 두 번째가 A

AC-3: 초대가 없는 워크스페이스는 빈 배열을 반환한다
  Given: 워크스페이스 W에 초대 0건, 요청자가 OWNER 세션 보유
  When: `GET /api/workspaces/{wsId}/invitations` 요청
  Then: HTTP 200, 응답 본문 `[]`

**목록 조회 — 인증/권한**

AC-4: 미인증 사용자는 목록 조회 시 401을 받는다
  Given: 세션 쿠키 없이 요청
  When: `GET /api/workspaces/{wsId}/invitations` 요청
  Then: HTTP 401

AC-5: 비OWNER 인증 사용자는 목록 조회 시 403을 받는다
  Given: 요청자가 워크스페이스 W의 MEMBER 역할 세션 보유
  When: `GET /api/workspaces/{wsId}/invitations` 요청
  Then: HTTP 403, 응답 JSON에 `code: "FORBIDDEN"` 포함

**철회 — 정상**

AC-6: OWNER가 PENDING 초대를 철회하면 204와 함께 DB 상태가 REVOKED로 전이된다
  Given: 초대 I가 `status=PENDING`, 요청자가 I의 `workspaceId`와 동일한 W의 OWNER 세션 보유
  When: `DELETE /api/workspaces/{wsId}/invitations/{invitationId}` 요청
  Then: HTTP 204, 본문 없음, DB 해당 초대 `status = REVOKED`

**철회 — 비PENDING 거부**

AC-7: ACCEPTED 초대 철회 시도는 409를 반환한다
  Given: 초대 I가 `status=ACCEPTED`, 요청자가 해당 워크스페이스 OWNER 세션 보유
  When: `DELETE /api/workspaces/{wsId}/invitations/{I.id}` 요청
  Then: HTTP 409, DB 초대 `status` 불변

AC-8: REVOKED 초대 재철회 시도는 409를 반환한다
  Given: 초대 I가 `status=REVOKED`, 요청자가 OWNER 세션 보유
  When: `DELETE /api/workspaces/{wsId}/invitations/{I.id}` 요청
  Then: HTTP 409, DB 초대 `status`는 그대로 REVOKED

AC-9: EXPIRED 초대 철회 시도는 409를 반환한다
  Given: 초대 I가 `status=EXPIRED`, 요청자가 OWNER 세션 보유
  When: `DELETE /api/workspaces/{wsId}/invitations/{I.id}` 요청
  Then: HTTP 409

**철회 — 자원 오류**

AC-10: 존재하지 않는 초대 ID로 철회 시도 시 404를 반환한다
  Given: DB에 없는 임의 UUID를 `invitationId`로 사용, 요청자가 OWNER 세션 보유
  When: `DELETE /api/workspaces/{wsId}/invitations/{존재하지않는ID}` 요청
  Then: HTTP 404

AC-11: 다른 워크스페이스 소속 초대에 철회 시도 시 404를 반환한다
  Given: 초대 I가 워크스페이스 W2 소속, 요청자가 W1(≠W2)의 OWNER 세션 보유
  When: `DELETE /api/workspaces/{W1.id}/invitations/{I.id}` 요청
  Then: HTTP 404 (I의 존재가 W1 컨텍스트에 비노출)

**철회 — 인증/권한**

AC-12: 미인증 사용자는 철회 시 401을 받는다
  Given: 세션 쿠키 없이 요청
  When: `DELETE /api/workspaces/{wsId}/invitations/{invitationId}` 요청
  Then: HTTP 401

AC-13: 비OWNER 인증 사용자는 철회 시 403을 받는다
  Given: 요청자가 워크스페이스 W의 MEMBER 역할 세션 보유
  When: `DELETE /api/workspaces/{wsId}/invitations/{invitationId}` 요청
  Then: HTTP 403, 응답 JSON에 `code: "FORBIDDEN"` 포함

## 제외 범위
- 철회된 초대의 알림 — 별도 슬라이스
- 동시 revoke 경쟁 조건(낙관적 잠금) — 후속
- 초대 재발송(resend) — 별도 슬라이스
- 목록 페이지네이션/상태 필터 — 후속
