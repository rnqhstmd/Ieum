# Cross-Review 결과

- advisor: claude (qa-manager + security-auditor, cross-review 미션)
- 브랜치: feat/p8-invitation-lifecycle (base: main)
- DEV_DIR: .dev/feat-p8-invitation-lifecycle
- 실행 시각: 2026-06-22

## AC 충족 매트릭스

| AC | 충족 | 근거 |
|----|------|------|
| AC-1 유효 토큰 → 204+Membership+ACCEPTED | O | InvitationService 단계 2→6→7→8, 단위+통합 |
| AC-2 없는 토큰 → 404 | O | EntityNotFoundException, 단위 |
| AC-3 ACCEPTED → 409 | O | 비PENDING 분기, 단위 |
| AC-4 REVOKED → 409 | O | 동일 분기, 단위 |
| AC-5 만료 → EXPIRED+410 | O | GoneException+noRollbackFor, 단위+통합(DB 재조회) |
| AC-6 EXPIRED → 409 | O | 비PENDING, 단위 |
| AC-7 이메일 불일치 → 403 | O | equalsIgnoreCase, 단위+통합 |
| AC-8 이미 멤버 멱등 → 204+ACCEPTED | O | alreadyMember 분기, 단위 |
| AC-9 미인증 → 401 | O | requireCurrentUserId, 통합 |
| AC-10 role=OWNER 승계 | O | inv.getRole(), 단위 |

**[Must] 10/10 충족.**

## 설계 범위 이탈
이탈 없음. (테스트 2개는 설계 Testability 섹션이 요구한 산출물. list/revoke의 currentUserId=null은 후속 슬라이스 범위.)

## 신규 위험 (trust-ledger에 없는 것만)

### HIGH
- **[RISK] AccessDeniedException 403 런타임 경로 미보장** — `SecurityConfig`에 `accessDeniedHandler` 미등록. AC-7 통합테스트가 `status().isForbidden()`만 단언하여, 403 body가 `ApiExceptionHandler`의 JSON(`code=FORBIDDEN`)인지 Spring 기본 응답인지 구분 못 함.
  - 평가: 서비스 레이어에서 throw된 AccessDeniedException은 `@RestControllerAdvice`가 잡는 것이 표준(필터 체인 예외가 아님)이라 JSON 403 가능성이 높음. **AC-7 통합테스트에 `jsonPath("$.code")=="FORBIDDEN"` body 단언을 추가하면 경로가 확정**된다 → 조치 권장.

### MEDIUM
- **[RISK] 핸들러 ex.getMessage() 노출 패턴** — `handleGone`·`handleConflict`가 `ex.getMessage()`를 body에 그대로 전달. HIGH-1(InvitationService 메시지 고정)으로 당장은 안전하나, `handleAccessDenied`/`handleEntityNotFound`(고정 메시지)와 정책 불일치. 향후 호출자가 민감 메시지 주입 시 노출. → **횡단 에러 메시지 정책, 후속**.
- **[GAP] list/revoke currentUserId=null 미수정** — FR-4 문구는 accept/revoke/list 전부지만 이번 슬라이스는 accept만. revoke/list는 `UnsupportedOperationException` 스텁(런타임 미도달). → **후속 슬라이스(P9 철회/목록)**.
- **[ASSUMPTION] Invitation/User.email null 가드** — `getEmail().trim()` NPE 우려. **검증 결과 false positive**: `Invitation.email`·`User.email` 모두 `@Column(nullable=false)` + V1 `NOT NULL` 제약 존재. NPE 불가.

### Info
- 검증순서상 "만료+이메일불일치" 조합은 410 반환(이메일 검증 전 만료 처리) — 설계서에 의도 확정됨. 코드 주석 보강 권장.
- `acceptInvitation` 위 구버전 스텁 JavaDoc 블록 잔존(quality Minor와 중복) — 정리 권장.
- `InvitationAcceptIntegrationTest`의 PageRepository는 FK 정리용 — 의도 주석 권장.

## 총평
- 강점: 설계 검증순서·noRollbackFor 단일 트랜잭션·멱등 early-return 회피를 충실히 구현. AC-5 DB 재조회 단언으로 회귀 안전망 견고.
- 합산: Critical 0, HIGH 1(AC-7 body 미검증), MEDIUM 3(2건 후속/1건 FP), Info 3.
- 권고: AC-7 통합테스트 body 단언 추가로 403 JSON 경로 확정. 나머지는 후속/사소.

## 처리 결과
- **HIGH (AC-7 403 경로)**: `InvitationAcceptIntegrationTest`에 `jsonPath("$.code")=="FORBIDDEN"` body 단언 추가 → 통과. `AccessDeniedException` → `ApiExceptionHandler` JSON 403 경로 확정(accessDeniedHandler 불필요). **해소**.
- MEDIUM 핸들러 메시지 일관성: 후속(횡단 에러 메시지 정책).
- MEDIUM list/revoke null: 후속 슬라이스(P9 철회/목록).
- MEDIUM email null: **false positive**(Invitation/User.email `@Column(nullable=false)`+V1 NOT NULL) — 조치 불필요.
- Info 3(JavaDoc 중복 등): 후속/사소.
