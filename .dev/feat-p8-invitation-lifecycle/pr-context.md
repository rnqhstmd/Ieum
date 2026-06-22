# PR Context — P8 초대 수락 (INV-02/06)

## 비즈니스 맥락
이음(Ieum) 협업 노션 클론의 초대 라이프사이클 완성. P7(PR #19)에서 초대 "생성"이 완료됐고, 이번 슬라이스는 초대 "수락" 경로를 구현한다.

초대받은 사용자가 토큰 링크로 워크스페이스에 합류한다. 토큰 검증 → 만료 검사 → 상태 검증 → 이메일 대조 → Membership 생성(role 승계) → 초대 ACCEPTED 전이를 **단일 트랜잭션**으로 수행하며, 각 엣지케이스에서 명확한 HTTP 응답을 반환한다.

### 요구사항 (이번 슬라이스, AC-1~10)
- 초대 수락(INV-02): 유효 토큰 → 204 + Membership(role 승계) + status ACCEPTED
- 이메일 불일치(INV-06): 초대 이메일 ≠ 로그인 사용자(trim+equalsIgnoreCase) → 403
- lazy 만료: 만료 토큰 → status EXPIRED 전이 + 410 (`noRollbackFor=GoneException`으로 영속 보장)
- 멱등(D-2): 이미 멤버 → Membership 미생성 + ACCEPTED 전이
- 컨트롤러 인증 연결(`requireCurrentUserId`), 미인증 401(SecurityFilter)
- 비PENDING(ACCEPTED/REVOKED/EXPIRED) → 409

## Audit Summary
- 총 9건 (CRITICAL: 0, HIGH: 3, MEDIUM: 6)
- [HIGH] 409 응답 내부 상태값(enum) 노출 → 고정 메시지로 수정 ✅
- [HIGH] AC-7(이메일 불일치 403) 통합 테스트 누락 → 통합 테스트 추가로 AccessDeniedException 403 경로 검증 ✅
- [HIGH] OWNER role 초대 정책 미정의 → AC-10으로 "허용" 확정(생성 측 거부는 후속 검토)
- [MEDIUM 6] 동시수락 500·만료 flush 타이밍·토큰 timing·고아 OAuth 500 등 → Trust Ledger 후속 트래킹

## 테스트
단위 9(InvitationServiceTest AC-1~8,10) + 통합 4(InvitationAcceptIntegrationTest: AC-1 e2e·AC-9 401·AC-5 410+EXPIRED 영속·AC-7 403) + ApiExceptionHandlerTest(handleGone 410). 전체 backend BUILD SUCCESSFUL, 회귀 0.

## 범위 밖(후속 슬라이스)
철회(REVOKE)·만료 스케줄러·Resend 실발송(AC-11~16)은 후속 PR.
