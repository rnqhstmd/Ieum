# PR 컨텍스트 — P10 워크스페이스 삭제·나가기 (US-WS-04)

## 배경
이음 앱에서 사용자는 워크스페이스를 삭제하거나 참여 중인 워크스페이스에서 나갈 수 있어야 한다(US-WS-04). 그러나 `DELETE /api/workspaces/{id}`·`PATCH /api/workspaces/{id}` 엔드포인트는 컨트롤러에서 `currentUserId = null`로 배선된 미완 상태였고, 서비스는 `UnsupportedOperationException` 스텁이었으며, 나가기(leave) 기능은 엔드포인트 자체가 없었다. P9에서 OWNER의 멤버 관리(역할 변경·내보내기)는 완성됐으나, 워크스페이스 수명주기 마감(삭제·나가기)이 남아 있었다.

## 요구사항 (US-WS-04)
- OWNER는 SHARED 워크스페이스를 삭제할 수 있고, 삭제 시 하위 페이지·멤버십·초대·CRDT op·snapshot이 함께 제거된다.
- PERSONAL 워크스페이스는 삭제 불가.
- 멤버는 SHARED 워크스페이스에서 스스로 나갈 수 있고, 마지막 OWNER의 나가기는 차단된다(OWNER 0명 방지).
- OWNER 전용 액션은 비OWNER/비멤버에게 403, 권한 우선 검증으로 워크스페이스 존재 여부를 누설하지 않는다.

## 핵심 설계 결정
- **cascade**: DB `ON DELETE CASCADE`(V1 완비)에 의존하는 `workspaceRepository.deleteById()` 단일 호출. 통합테스트(T4)가 활성·아카이브 페이지 각각의 crdt_op/snapshot까지 2단계 cascade 실증.
- **검증 순서 비대칭**: 삭제=권한 우선(없는 WS도 403·비누설), 나가기=멤버십 우선(404). 의미적으로 정당(타인 리소스 변경 vs 본인 멤버십 정리).
- **마지막 OWNER 차단**: 400(`IllegalArgumentException`) — P9 removeMember/updateMemberRole와 일관. 메시지는 구분("…나갈 수 없습니다").
- **WS 강제종료**: 삭제 시 멤버십 삭제 전 전체 멤버 disconnect, 나가기 시 본인 disconnect. best-effort(P9 패턴).
- **leave 경로**: `DELETE /api/workspaces/{id}/members/me`(기존 `/{userId}` removeMember와 리터럴 우선 매칭으로 분리).

## Audit Summary
- 총 6건 (CRITICAL: 0, HIGH: 1, MEDIUM: 5) — quality-reviewer QUALITY PASS / spec-reviewer 16 AC 충족
- [HIGH] WS 강제종료가 트랜잭션 커밋 전 호출(롤백 시 불일치) → **수용+문서화**(P9 removeMember 동일 패턴·best-effort 허용 손실, AFTER_COMMIT 전환은 P11 하드닝)
- [MEDIUM] renameWorkspace request null 방어 미구현 → **수정**(NPE→400 가드 + 단위테스트)
- [MEDIUM] cascade 검증 archived 페이지 제외 → **수정**(T4 archived 픽스처 + 전수 단언)
- [MEDIUM] 단위테스트 requireOwner stub 생략·T4 dead var → **수정**
- [MEDIUM] AccessGuard enum `!=` 비교 → **범위 밖**(P1 기존 코드)
- [NOTE] V3 op_type 제약(소문자) vs Java OpType enum(대문자) 불일치 → **collaboration 도메인 잠재 이슈**(P10 범위 밖, 테스트는 native SQL 우회)

## 검증
- backend 236 tests · ws-relay 76 tests 전부 통과. verify 게이트 통과.
- 인수 검증(product-owner): ACCEPT — [Must] 16 AC 전부 충족.
