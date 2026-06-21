# Cross-Review 결과

- advisor: claude (orchestrator-direct) + PR #19 gemini-code-assist 통합
- 브랜치: feat/p7-invitation-create (base: main)
- 대상: PR #19 (commit 68e90cd), CI 106 tests ✅ 0 fail

## AC 충족 매트릭스
| AC | 충족 | 근거 |
|----|------|------|
| AC-1 생성 PENDING | O | InvitationService.createInvitation + 단위 |
| AC-2 토큰 고유·길이 | O | generateSecureToken(32B) + 단위 |
| AC-3 만료 7일 | O | expiresAt now+7d + 단위 |
| AC-4 비OWNER 403 | O | accessGuard.requireOwner + 단위 |
| AC-5 이미멤버 409 | O | ConflictException + 단위/통합 |
| AC-6 메일 fallback | O | try/catch + 단위 |
| AC-7~10 REST | O | 통합 4건(201/403/401/409) |

[Must] 5/5, [Should] 1/1 충족. CI green(106 tests).

## 설계 범위 이탈
- 이탈 없음. design.md 변경 범위(6 파일)와 일치. status.md는 phase-complete 표준 갱신.

## 신규 위험 (trust-ledger에 없는 항목)

### HIGH
- [RISK] InvitationService.java:106 — `@Transactional` 내 외부 메일 호출(gemini)
  - 근거: createInvitation이 @Transactional이며 마지막에 resendEmailClient.sendInvitationEmail 호출. 실제 HTTP 발송 시 메일 응답 동안 DB 커넥션을 점유 → 커넥션 풀 고갈 안티패턴.
  - 현황: sendInvitationEmail은 현재 no-op(apiKey 미설정)이라 실측 점유 0. 실발송(INV-07 Resend HTTP)은 Phase 4 명시 연기.
  - 권고: 실발송 도입 시 `@TransactionalEventListener(phase = AFTER_COMMIT)`로 커밋 후 발송 분리(+필요 시 @Async). Phase 4에서 처리.

### MEDIUM
- [RISK] InvitationService.java:78 — request null 가드 부재(gemini, 슬라이스 ① 동일)
  - 근거: request null 시 request.email() NPE→500. 컨트롤러(@RequestBody)는 non-null이나 서비스 직접 호출 시 노출.
  - 권고: 진입부 null 검증(→400). **핵심 방어로 이번에 반영**.
- [RISK] InvitationService.java:52 — 초대 URL 하드코딩(gemini)
  - 근거: INVITE_URL_PREFIX="https://ieum.app/invite?token=" 하드코딩 → 환경별(local/staging/prod) 대응 어려움.
  - 현황: URL은 메일 본문에만 사용되며 실발송이 Phase 4라 현재 미사용 경로.
  - 권고: application.yml + @Value 분리. Phase 4(실발송)에서 함께 처리.

## 총평
- 강점: AC 전건 충족 + CI green, invitedById 신뢰 경계·OWNER 강제·INV-05·강한 토큰 견고.
- 합산: HIGH 1, MEDIUM 2 (HIGH·MEDIUM#3는 Phase 4 실발송과 결부, MEDIUM#2는 즉시 방어).
- 권고: request null 가드(핵심 방어) 즉시 반영, 트랜잭션 분리·URL 설정은 Phase 4 실발송 시 함께 처리.

## 처리 결과 (사용자 선택: 핵심 방어 수정 + 나머지 문서화)
- MEDIUM#2 request null 가드: **수정** (RGR, 단위 +1).
- HIGH#1 트랜잭션 분리 / MEDIUM#3 URL 설정: **문서화/연기** — Phase 4(INV-07 실발송)에서 AFTER_COMMIT 이벤트 분리 + @Value 설정 함께 반영.
