## 코드 맵: P8 마지막 — Resend 초대 이메일 실 HTTP 발송 (INV-07)

### 핵심 파일 (수정 대상)
- backend/src/main/java/com/ieum/common/email/ResendEmailClient.java → `sendInvitationEmail`. 현재 payload만 만들고 `restClient.post()` 주석 처리(no-op). 실호출 활성화 + messageId 로깅 + 실패 fallback. `RestClient.create()` 생성자 직접 생성 → **주입 가능하게 리팩터**(MockRestServiceServer 테스트 위해 `RestClient.Builder` 주입)
- (신규) backend/src/test/java/com/ieum/common/email/ResendEmailClientTest.java → MockRestServiceServer 단위/슬라이스 테스트

### 참조 파일
- backend/src/main/java/com/ieum/invitation/InvitationService.java:111 → `resendEmailClient.sendInvitationEmail(...)` 호출부. try-catch로 감싸 warn 로깅(PENDING 유지). 발송 실패가 초대 생성을 막지 않음.
- backend/src/main/resources/application.yml:42 → `app.resend.api-key`(기본 빈값) / `app.resend.from`(기본 `Ieum <noreply@ieum.app>`)
- backend/src/test/resources/application-test.yml → resend 설정 없음 → api-key 빈값 → 기존 "API 키 미설정 건너뜀" fallback 경로
- backend/build.gradle.kts:35 → `spring-boot-starter-webmvc-test`(MockRestServiceServer + spring-test). RestClient는 spring-web.

### 설정/문서
- backend/build.gradle.kts → java-spring
- context/workspace/status.md → US-INV-02(수락 PR #20)·US-INV-04(취소 PR #21)·INV-07 ✅ 동기화 대상(현재 ⬜ stale)
- context/auth/status.md → INV-07 표기 정정(실발송 반영)
