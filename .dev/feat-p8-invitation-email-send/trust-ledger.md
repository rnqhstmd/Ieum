## Trust Ledger — P8 마지막 Resend 실발송 (INV-07)

### 통합 감사 (review, security-auditor)
집계: CRITICAL 0, HIGH 1, MEDIUM 4(+ASSUMPTION 2) + quality Minor 5.

#### CRITICAL — 0건

#### HIGH (수정)
- **[RISK/HIGH] catch `e.getMessage()` 토큰 노출 경로** — 현 Spring HttpClientErrorException.getMessage()는 상태+응답바디만(요청 헤더 미포함)이라 apiKey 미노출이나 버전 의존 ASSUMPTION.
  - 처리: **수정** — `e.getMessage()` 대신 전체 예외 객체 `e`를 마지막 인자로 로깅(스택트레이스 보존, apiKey는 예외에 미포함 → 안전). quality Minor(스택트레이스 보존)와 동시 충족.

#### MEDIUM (수정 2 / 후속 2)
- **[RISK/MEDIUM] RestClientConfig 타임아웃 미설정** — RestClient.builder() 기본은 무한 대기. createInvitation @Transactional 내 호출이라 HTTP 고착 시 DB 커넥션 점유 연장.
  - 처리: **수정** — RestClientConfig에 connect(5s)·read(10s) 타임아웃 ClientHttpRequestFactory 주입.
- **[RISK/MEDIUM] workspaceName CRLF 미정제 — subject 헤더 인젝션** — 사용자 제어 workspaceName이 subject에 비정제 삽입. (html의 inviteUrl은 URL-safe Base64 토큰이라 인젝션 불가.)
  - 처리: **수정** — sendInvitationEmail 진입부에서 workspaceName CRLF strip(`replaceAll("[\r\n]", " ")`).
- **[GAP/MEDIUM] @Transactional 커밋 전 외부 HTTP 발송** — createInvitation @Transactional 내 발송. 발송 성공 후 롤백 시 무효 토큰 메일 가능.
  - 평가: 현 코드는 save 이후 잔여 작업이 `toDto`+return뿐이라 롤백 트리거 없음(latent, 무해). InvitationService는 본 슬라이스 설계 무변경 범위.
  - 처리: **후속** — 메서드 성장 시 `TransactionSynchronization afterCommit` 또는 `@TransactionalEventListener(AFTER_COMMIT)` 적용.
- **[ASSUMPTION/MEDIUM] workspaceName 조회 무음 폴백("워크스페이스")** — requireOwner가 wsId 존재 전제로 검증하므로 도달 어려움. → 후속/조치 불요.
- **[ASSUMPTION/MEDIUM] ResendResponse 필드명 "id" 고정 가정** — Resend 응답 스키마 가정. id null시 warn 처리. → 후속(API 버전 핀/회귀 테스트).

#### 기타 (security 불일치 지적)
- InvitationService 2차 try-catch가 클라이언트 내부 catch로 인해 도달 불가 — 무해한 방어 코드. 설계 무변경 범위라 유지(후속 정리 가능).

#### Minor (quality)
- 로그 prefix 하드코딩(4곳 상수화 여지), subject/html 인라인 템플릿(다국어 시 추출), 테스트 URL 상수 복제 — 전부 후속/사소.

### 교차 검증 정합 (security)
BR-1(발송 실패 PENDING 유지, 이중 try-catch) ✓ / apiKey 빈값 early return ✓ / RestClient.Builder 생성자 주입 ✓ / SSRF 없음(URL 상수) ✓ / messageId 성공 로그 ✓ / inviteUrl 로그 노출 제거(보안 개선) ✓.

### 처리 결과
- **HIGH-1(예외 로깅)**: `log.warn("... to={}", to, e)` 전체 예외 객체 로깅(스택트레이스 보존, apiKey 미포함). **해소**.
- **MEDIUM(타임아웃)**: RestClientConfig `SimpleClientHttpRequestFactory` connect 5s/read 10s(Boot 4.1.0에 ClientHttpRequestFactorySettings 부재). **해소**.
- **MEDIUM(CRLF strip)**: `safeWorkspaceName = workspaceName.replaceAll("[\r\n]", " ")` → subject 정제. SEC-1 테스트 RGR. **해소**.
- @Transactional afterCommit·ASSUMPTION 2·2차 catch·Minor: 후속/조치 불요(현 코드 경로 무해).
