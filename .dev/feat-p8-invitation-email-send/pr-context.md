# PR 비즈니스 맥락 — P8 마지막: Resend 초대 이메일 실 HTTP 발송 (INV-07)

## 배경
초대 생성 시 `ResendEmailClient.sendInvitationEmail`이 payload 구성까지만 동작하고 실제 Resend API HTTP POST가 주석 처리된 no-op이었다. 초대를 만들어도 수신자에게 메일이 가지 않았다. 또 `RestClient`를 생성자 내부 `RestClient.create()`로 만들어 테스트가 곤란했다. 이 PR로 실 발송을 활성화하여 **P8 초대 라이프사이클을 마감**한다.

> 스택 PR: 베이스는 `feat/p8-invitation-expiry-scheduler`(PR #22). PR #22·#21·#20 머지 후 main으로 자연 정렬.

## 요구사항
- api-key 설정 시 Resend API로 실제 초대 메일 발송, 2xx 응답의 messageId 로깅.
- 발송 실패(4xx/5xx/네트워크)가 초대 생성을 막지 않음(예외 미전파, PENDING 유지).
- api-key 미설정(로컬/테스트)에서는 HTTP 미시도(기존 fallback 유지).

## 핵심 설계 판단
- **테스트 가능성**: `RestClient.Builder`를 생성자 주입(+ apiKey/from `@Value` 파라미터 승격)으로 변경 → `MockRestServiceServer`로 실 네트워크 없이 요청/응답을 결정론적으로 검증.
- **응답 매핑**: `ResendResponse(String id)` record로 messageId 안전 추출(Jackson, 미지 필드 무시).
- **실패 격리**: HTTP 예외를 클라이언트 내부 try-catch로 흡수 → 호출부 무관하게 PENDING 보장.
- **RestClientConfig**: Spring Boot 4.x에서 `RestClient.Builder` 자동 빈 미제공 → 명시 등록(+ 타임아웃).

## Audit Summary
- 총 7건 (CRITICAL: 0, HIGH: 1, MEDIUM: 4) + quality Minor 5 — HIGH 1·MEDIUM 2(신규파일 면)는 리뷰 중 RGR 해소
- [HIGH 해소] catch 로그 `e.getMessage()`→전체 예외 객체 `e`(스택트레이스 보존, apiKey는 예외 미포함)
- [MEDIUM 해소] RestClientConfig 타임아웃 미설정 → `SimpleClientHttpRequestFactory` connect 5s/read 10s(@Transactional 내 HTTP 고착 방지)
- [MEDIUM 해소] workspaceName CRLF 미정제 → subject 헤더 인젝션 방어(SEC-1 테스트)
- [MEDIUM 후속] @Transactional 커밋 전 발송 — 현 코드 경로 무해(save 이후 롤백 트리거 없음), 메서드 성장 시 afterCommit 적용
- [정합] BR-1 발송 실패 PENDING 유지(이중 try-catch) / api-key 빈값 미호출 / SSRF 없음(URL 상수) / inviteUrl 토큰 URL-safe

## 검증
- `./gradlew clean test build` BUILD SUCCESSFUL (0 failures)
- ResendEmailClientTest: AC-1~7 + SEC-1 (MockRestServiceServer)
- product-owner 인수 ACCEPT — Must 7/7

## 문서 동기화 (이 PR)
- context/auth/status.md: INV-07 실발송 반영
- context/workspace/status.md: US-INV-02(수락 PR #20)·US-INV-04(취소 PR #21)·INV-07 ✅
