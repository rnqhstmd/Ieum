# PR 비즈니스 맥락 — P8 후속① 초대 철회(REVOKE) + 목록 조회

## 배경
PR #19(초대 생성)·PR #20(초대 수락, 스택 베이스) 이후, 워크스페이스 OWNER가 발송한 초대를 **관리할 수단**이 없었다. `InvitationService.listInvitations`/`revokeInvitation`은 `UnsupportedOperationException` 스텁이었고, `InvitationController`의 두 엔드포인트는 `currentUserId=null`을 그대로 전달해 사실상 500으로 비활성 상태였다. 이 슬라이스는 그 공백을 닫아 초대 라이프사이클의 "조회·철회"를 완성한다.

> 스택 PR: 베이스는 `feat/p8-invitation-lifecycle`(PR #20, 미머지). PR #20 머지 후 main으로 자연 정렬.

## 요구사항
- OWNER는 워크스페이스 초대 전체 목록을 `createdAt` 내림차순으로 조회한다(상태 무관).
- OWNER는 PENDING 초대를 철회(REVOKED 전이)한다. 비PENDING은 409, 타 워크스페이스/미존재는 404로 은닉.
- 미인증 401, 비OWNER 403(`code:FORBIDDEN`)을 일관 적용한다.

## 핵심 설계 판단
- `revokeInvitation` 검증 순서를 **requireOwner 선행**으로 두어, 비OWNER가 타 워크스페이스 초대 ID를 추측해도 403으로 차단(자원 은닉 강화).
- 미존재·타 워크스페이스를 **동일 메시지 404**로 통합해 자원 존재 여부 비노출.
- 비PENDING 철회는 `ConflictException`(409) 고정 문자열로 내부 상태(enum) 미노출 — accept 정책과 일관.
- 목록 응답은 기존 `InvitationDto` 재사용(token 미포함).

## Audit Summary
- 총 5건 (CRITICAL: 0, HIGH: 2, MEDIUM: 3) + quality Minor 2 — **전부 코드 변경 불필로 판단**
- [HIGH/정책] InvitationDto의 invitedById·expiresAt 노출 — 이 슬라이스 도입 아님(기존 DTO 재사용, OWNER 전용). 횡단 DTO 정책으로 후속
- [HIGH/문서GAP] 비OWNER·미존재 wsId가 403으로 수렴 — 자원 은닉 의도(감사자 "오히려 안전"). PRD 명문화 후속
- [MEDIUM/오탐] listInvitations @Transactional 누락 — 클래스 `@Transactional(readOnly=true)` 상속으로 해소됨
- [MEDIUM/오탐] 401→500 위험 — 통합 테스트(AC-4·12) 통과로 검증됨
- [MEDIUM/제외] 동시 revoke 경쟁 — PRD 명시 제외 범위(멱등 무해)
- 정합 확인: BR-1~6 전부 코드 일치, token 미노출

## 검증
- `./gradlew clean test build` BUILD SUCCESSFUL (0 failures)
- 단위 LIST-U1~3·REV-U1~7 + 통합 AC-1~13(testcontainers)
- product-owner 인수 ACCEPT — Must 13/13
