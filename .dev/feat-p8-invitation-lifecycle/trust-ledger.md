# Trust Ledger — P8 초대 수락

## 통합 감사 (review, security-auditor)

> 총 9건 — CRITICAL 0 / HIGH 3 / MEDIUM 6. (이번 슬라이스 = 수락 AC-1~10)

### HIGH
- **[RISK/HIGH] 409 응답에 내부 상태값 노출** — `InvitationService` `"이미 처리된 초대입니다: " + inv.getStatus()` → ACCEPTED/REVOKED/EXPIRED enum이 응답 body 노출. ApiExceptionHandlerTest의 고정 메시지 정책과 불일치.
  - 권고: 고정 문자열 `"이미 처리된 초대입니다."`로 교체. → **이번 슬라이스에서 수정**
- **[RISK/HIGH] OWNER role 초대 정책 미정의** — 수락이 `inv.getRole()` 그대로 승계. createInvitation이 OWNER role 초대를 거부하지 않아 복수 OWNER 가능.
  - 판정: **AC-10으로 PRD에 OWNER 승계 허용이 명기·승인됨(정책 확정)**. createInvitation OWNER 거부는 수락 슬라이스 범위 밖 → **후속 검토**(필요 시 별도 정책 슬라이스).
- **[GAP/HIGH] AC-7(이메일 불일치 403) 통합 테스트 누락** — 단위(mock)만 존재. 서비스에서 throw한 `AccessDeniedException`이 실제 HTTP 403으로 매핑되는지(Security FilterChain vs ApiExceptionHandler 경로) 미검증.
  - 권고: 통합 테스트 추가. → **이번 슬라이스에서 수정**

### MEDIUM (후속 트래킹)
- 토큰 존재 timing side-channel — 토큰 256bit SecureRandom이라 실질 위협 낮음. rate limiting과 조합 수용. 기록.
- 동시수락 경쟁 시 DataIntegrityViolation→500 — PRD가 후속 슬라이스로 명시 연기. 후속에서 409/204 변환.
- 만료 전이 flush 타이밍 — 통합테스트 AC-5(DB 재조회 EXPIRED)가 회귀 검출. `saveAndFlush`로 의도 명확화 가능(선택).
- IllegalArgumentException 메시지 노출 일관성 — 에러 메시지 정책 명문화(횡단, 후속).
- 멱등 의미 불일치(ACCEPTED 재수락 409 vs PENDING+이미멤버 204) — PRD AC-3/AC-8이 의도적으로 구분(정책 명기됨).
- 고아 OAuth 세션(인증됐으나 DB User 없음)→500 — 응답코드 정의 필요(횡단, 후속).

### 교차 검증 — 정합 확인
토큰404·만료410+EXPIRED영속·비PENDING409·이메일대조·미인증401·role승계·Membership unique 모두 [정합]. 검증순서(만료우선)는 PRD와 의도적 차이(ACCEPTED 만료 초대는 409, 의도적).
