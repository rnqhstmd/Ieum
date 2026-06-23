# P10 — 워크스페이스 삭제·나가기 (US-WS-04) PRD

## 배경

이음 앱에서 사용자는 워크스페이스를 삭제하거나, 참여 중인 워크스페이스에서 나갈 수 있어야 한다. 그러나 현재 두 기능 모두 미완 상태다.

**현재 제품 상태:**
- `DELETE /api/workspaces/{id}` 엔드포인트는 존재하나, 컨트롤러에서 `currentUserId = null`로 배선되어 있어 실제 호출 시 비정상 동작한다.
- `WorkspaceService.deleteWorkspace()`는 `UnsupportedOperationException` 스텁. 스텁 주석은 PERSONAL 차단 시 `IllegalStateException` 사용을 제안하나, 이는 catch-all에 의해 500으로 매핑되므로 수정이 필요하다.
- `PATCH /api/workspaces/{id}` rename 엔드포인트도 동일한 `currentUserId = null` 배선 버그 + `renameWorkspace()` 스텁.
- 나가기(leave)는 엔드포인트 자체가 없다. P9 `removeMember`는 자기 자신 제거를 `IllegalArgumentException(400)`으로 차단하므로, 나가기는 별도 경로·별도 서비스 메서드가 필요하다.
- DB 스키마: `ON DELETE CASCADE` 완비 — workspaces 행 삭제 시 memberships/invitations/pages/crdt_ops/snapshots가 DB 수준에서 자동 정리된다 (V1__init.sql).
- 예외→HTTP 매핑(`ApiExceptionHandler`): AccessDeniedException→403, EntityNotFoundException→404, IllegalArgumentException→400, ConflictException→409, GoneException→410, 그 외(IllegalStateException 포함)→500.

## 확정된 정책 결정 (2026-06-23, 사용자 승인)

1. **leave 엔드포인트 경로**: `DELETE /api/workspaces/{id}/members/me` (REST 관례 'me'=현재 인증 사용자).
2. **마지막 OWNER 차단 코드**: **400** (`IllegalArgumentException`) — P9 removeMember/updateMemberRole와 일관.
3. **WS 강제종료(FR-8·FR-9)**: 이번 슬라이스에 **포함** (best-effort).
4. **renameWorkspace(FR-6·FR-7)**: 이번 슬라이스에 **포함** (delete와 동일 파일 버그 동반 수정).

---

## 요구사항

### 기능 요구사항

- **[Must] FR-1 워크스페이스 삭제**: OWNER는 SHARED 워크스페이스를 삭제할 수 있다. 삭제 시 하위 페이지·멤버십·초대·CRDT op·snapshot이 함께 제거된다(DB cascade).
- **[Must] FR-2 PERSONAL 삭제 차단**: PERSONAL 타입은 삭제 요청 시 HTTP 400 반환(`IllegalArgumentException`. `IllegalStateException` 금지 — 500 유발).
- **[Must] FR-3 삭제 권한 OWNER 전용**: MEMBER/비멤버 삭제 시도 → 403(`AccessGuard.requireOwner`).
- **[Must] FR-4 나가기(leave) 엔드포인트 신설**: 멤버가 SHARED 워크스페이스에서 자신의 멤버십을 스스로 삭제. 경로 `DELETE /api/workspaces/{id}/members/me`.
- **[Must] FR-5 마지막 OWNER 나가기 차단**: OWNER가 1명뿐인 SHARED에서 그 OWNER 나가기 시도 → 400(`IllegalArgumentException`).
- **[Must] FR-6 컨트롤러 currentUserId 배선 수정**: DELETE `/{id}`·PATCH `/{id}`의 `currentUserId = null`을 `currentUserService.requireCurrentUserId()`로 교체.
- **[Must] FR-7 renameWorkspace 본문 구현**: 스텁 → 실 구현. `requireWorkspaceMember` 확인 후 `normalizeName()` 재사용하여 이름 변경 저장.
- **[Must] FR-8 삭제 시 WS 강제종료**: 삭제 시점 전체 멤버 각각에 `WsRelayAdminClient.disconnectUser()` 호출(멤버십 삭제 전 목록 기준, best-effort).
- **[Must] FR-9 나가기 시 WS 강제종료**: 나가기 처리 시 `disconnectUser(currentUserId)` 호출(best-effort).

### 비즈니스 규칙

- **[Must] BR-1 삭제 조회/권한 순서**: 권한 체크는 `requireOwner`가 담당(P9 일관 — 권한 우선). 비멤버는 멤버십 부재 → 403(AccessGuard 기존 동작). **존재하지 않는 workspaceId도 멤버십이 없으므로 `requireOwner`에서 403**(존재 여부 비누설). (2026-06-23 확정: AC-5=403.)
- **[Must] BR-2 PERSONAL 나가기 차단**: PERSONAL에서 나가기 시도 → 400.
- **[Must] BR-3 비멤버/없는 WS 나가기**: 본인 멤버십 없음 → 404(`EntityNotFoundException`). 워크스페이스 자체가 없을 때도 404.
- **[Must] BR-4 삭제 멱등성**: 이미 삭제된 워크스페이스 재삭제 → 멤버십도 cascade 삭제됨 → `requireOwner`에서 403(BR-1과 동일 경로).
- **[Must] BR-5 나가기 멱등성**: 이미 나간 상태 재시도 → 404(BR-3와 동일 경로).
- **[Must] BR-6 마지막 OWNER 차단 메시지**: `"마지막 OWNER는 워크스페이스에서 나갈 수 없습니다"` (P9 removeMember의 `"마지막 OWNER를 제거할 수 없습니다"`와 구분).
- **[Must] BR-7 나가기 검증 순서**: 멤버십 존재 확인 → PERSONAL 차단(BR-2) → 마지막 OWNER 차단(FR-5) 순.

---

## 수용 기준

**AC-1: OWNER가 SHARED 워크스페이스 삭제 성공** [FR-1]
- Given: SHARED 워크스페이스 W가 존재하고, 사용자 U가 W의 OWNER이며, W에 페이지·초대·멤버십이 존재한다.
- When: U가 인증된 상태로 `DELETE /api/workspaces/{W.id}`를 요청한다.
- Then: HTTP 204를 반환하고, workspaces에서 W 행이 삭제되며, memberships/invitations/pages/crdt_ops/snapshots에서 W에 속한 전체 행이 삭제된다.

**AC-2: PERSONAL 워크스페이스 삭제 차단** [FR-2]
- Given: 사용자 U의 PERSONAL 워크스페이스 P가 존재한다.
- When: U가 인증된 상태로 `DELETE /api/workspaces/{P.id}`를 요청한다.
- Then: HTTP 400을 반환하고, workspaces에서 P 행이 삭제되지 않는다.

**AC-3: MEMBER 역할의 삭제 시도 → 403** [FR-3]
- Given: SHARED 워크스페이스 W가 존재하고, 사용자 U가 W의 MEMBER다.
- When: U가 인증된 상태로 `DELETE /api/workspaces/{W.id}`를 요청한다.
- Then: HTTP 403을 반환하고, W가 삭제되지 않는다.

**AC-4: 비멤버의 삭제 시도 → 403** [FR-3]
- Given: SHARED 워크스페이스 W가 존재하고, 사용자 U는 W의 멤버십이 없다.
- When: U가 인증된 상태로 `DELETE /api/workspaces/{W.id}`를 요청한다.
- Then: HTTP 403을 반환한다.

**AC-5: 존재하지 않는 워크스페이스 삭제 → 403** [BR-1, BR-4]
- Given: 존재하지 않는 workspaceId X가 있다.
- When: 인증된 사용자가 `DELETE /api/workspaces/{X}`를 요청한다.
- Then: HTTP 403을 반환한다(`AccessGuard.requireOwner`가 멤버십 부재로 `AccessDeniedException`. 존재 여부 비누설).
- 확정(2026-06-23): P9 removeMember/listMembers와 동일하게 권한 우선 → 없는 WS도 403. 통합테스트는 `status().isForbidden()`으로 작성.

**AC-6: MEMBER가 SHARED 워크스페이스 나가기 성공** [FR-4]
- Given: SHARED 워크스페이스 W가 존재하고, 사용자 U가 W의 MEMBER이며, W에 다른 OWNER가 1명 이상 존재한다.
- When: U가 인증된 상태로 `DELETE /api/workspaces/{W.id}/members/me`를 요청한다.
- Then: HTTP 204를 반환하고, memberships에서 U-W 행이 삭제되며, W 자체는 삭제되지 않는다.

**AC-7: OWNER가 다른 OWNER가 있는 상태에서 나가기 성공** [FR-4, FR-5]
- Given: SHARED 워크스페이스 W가 존재하고, 사용자 U가 W의 OWNER이며, W에 다른 OWNER V가 1명 이상 존재한다.
- When: U가 인증된 상태로 `DELETE /api/workspaces/{W.id}/members/me`를 요청한다.
- Then: HTTP 204를 반환하고, U의 멤버십이 삭제되며, V의 멤버십은 유지된다.

**AC-8: 마지막 OWNER 나가기 차단 → 400** [FR-5, BR-6]
- Given: SHARED 워크스페이스 W에 OWNER가 사용자 U 1명뿐이고, MEMBER는 0명 이상이다.
- When: U가 인증된 상태로 `DELETE /api/workspaces/{W.id}/members/me`를 요청한다.
- Then: HTTP 400을 반환하고 `IllegalArgumentException`이 발생하며, U의 멤버십이 삭제되지 않는다. 응답 message는 `"마지막 OWNER는 워크스페이스에서 나갈 수 없습니다"`이다.

**AC-9: PERSONAL 워크스페이스 나가기 차단 → 400** [FR-4, BR-2, BR-7]
- Given: 사용자 U의 PERSONAL 워크스페이스 P가 존재한다.
- When: U가 인증된 상태로 `DELETE /api/workspaces/{P.id}/members/me`를 요청한다.
- Then: HTTP 400을 반환하고, U의 멤버십이 삭제되지 않는다.

**AC-10: 멤버십 없는 상태에서 나가기 → 404** [BR-3, BR-5]
- Given: SHARED 워크스페이스 W가 존재하고, 사용자 U는 W의 멤버십이 없다.
- When: U가 인증된 상태로 `DELETE /api/workspaces/{W.id}/members/me`를 요청한다.
- Then: HTTP 404를 반환한다.

**AC-11: 존재하지 않는 워크스페이스에서 나가기 → 404** [BR-3]
- Given: 존재하지 않는 workspaceId X가 있다.
- When: 인증된 사용자가 `DELETE /api/workspaces/{X}/members/me`를 요청한다.
- Then: HTTP 404를 반환한다.

**AC-12: delete 및 rename 엔드포인트 인증 배선 수정** [FR-6]
- Given: 미인증 사용자가 `DELETE /api/workspaces/{id}` 또는 `PATCH /api/workspaces/{id}`를 요청한다.
- When: 요청이 처리된다.
- Then: HTTP 401을 반환한다(Spring Security 처리. `currentUserId = null` NPE로 500이 발생하지 않는다).

**AC-13: renameWorkspace 구현 — 멤버만 이름 변경 가능** [FR-7]
- Given: SHARED 워크스페이스 W가 존재하고, 사용자 U가 W의 MEMBER 또는 OWNER다.
- When: U가 인증된 상태로 `PATCH /api/workspaces/{W.id}`에 유효한 이름(1~100자)을 요청한다.
- Then: HTTP 200을 반환하고, W의 이름이 요청 값으로 변경된 `WorkspaceDto`가 반환된다.

**AC-14: renameWorkspace — 비멤버 이름 변경 시도 → 403** [FR-7]
- Given: SHARED 워크스페이스 W가 존재하고, 사용자 U는 W의 멤버십이 없다.
- When: U가 인증된 상태로 `PATCH /api/workspaces/{W.id}`를 요청한다.
- Then: HTTP 403을 반환한다.

**AC-15: 삭제 시 전체 멤버 WS 강제종료** [FR-8]
- Given: SHARED 워크스페이스 W에 멤버 [U1, U2, U3]가 있고, U1이 OWNER다.
- When: U1이 W를 삭제한다.
- Then: `WsRelayAdminClient.disconnectUser()`가 U1·U2·U3 각각에 대해 1회씩 호출된다(삭제 전 멤버십 목록 기준). WS 강제종료 실패가 삭제 트랜잭션을 롤백하지 않는다(best-effort).

**AC-16: 나가기 시 본인 WS 강제종료** [FR-9]
- Given: 사용자 U가 SHARED 워크스페이스 W의 MEMBER다.
- When: U가 나가기를 성공적으로 처리한다.
- Then: `WsRelayAdminClient.disconnectUser(U.id)`가 1회 호출된다. WS 강제종료 실패가 나가기 트랜잭션을 롤백하지 않는다(best-effort).

---

## 범위 밖 (Out of Scope)

- **CRDT 재접속 복원 (US-CRDT-02)**: 별도 슬라이스.
- **프론트엔드 UI**: 삭제/나가기 확인 다이얼로그, 마지막 OWNER 안내 화면.
- **워크스페이스 소유권 이전 API**: 기존 `updateMemberRole`(P9)로 수행. 신규 API 미신설.
- **소프트 삭제/복구**: 하드 삭제만.
- **나가기 후 자동 리디렉션**: 프론트 관심사.
