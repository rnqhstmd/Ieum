# PRD: P8 마지막 — Resend 초대 이메일 실 HTTP 발송 (INV-07)

## 배경
현재 `ResendEmailClient.sendInvitationEmail`은 payload 구성까지만 동작하고 실제 Resend API HTTP POST가 주석 처리된 no-op이다. 초대를 생성해도 이메일이 전달되지 않는다. `app.resend.api-key` 빈값 시 발송을 건너뛰는 fallback은 이미 존재. `RestClient`를 생성자 내부 `RestClient.create()`로 만들어 테스트가 곤란하다. 호출부 `InvitationService.createInvitation`은 try-catch로 발송 실패가 초대 생성을 막지 않는 구조.

## 목표
- 초대 생성 시 실제 이메일 전달.
- 발송 실패(API 오류·네트워크)가 초대 생성·PENDING 유지를 방해하지 않음.
- 실패 시 OWNER가 목록에서 링크 수동 전달 가능.

## 요구사항

### 기능 요구사항
- [Must] FR-1: api-key 설정 시 `POST https://api.resend.com/emails`. 헤더 `Authorization: Bearer {apiKey}` + `Content-Type: application/json`, body=기존 payload(from/to/subject/html).
- [Must] FR-2: 2xx 응답 시 body JSON `id` 추출 → `log.info`(`messageId={}`).
- [Must] FR-3: HTTP 4xx/5xx/네트워크 예외 시 `ResendEmailClient` 내부에서 catch → `log.warn/error` 기록 + 예외 미전파(정상 반환). 초대 PENDING 유지.
- [Must] FR-4: api-key 빈값이면 기존 동작 — HTTP 미호출, `log.info` 후 즉시 반환.
- [Must] FR-5: `RestClient`를 `RestClient.Builder` 생성자 주입으로 변경(MockRestServiceServer 테스트 가능).
- [Should] FR-6: 2xx인데 body 없음/`id` 없음 → messageId 로깅 건너뛰고 `log.warn` + 정상 반환.

### 비즈니스 규칙
- [Must] BR-1: 이메일 발송 실패는 초대 생성에 영향 없음. 성공/실패 무관 PENDING 저장.
- [Must] BR-2: api-key 미설정 환경(로컬/테스트)에서 HTTP 미시도.
- [Should] BR-3: 재시도·DLQ는 범위 외.

### 품질 기대
- [Should] QE-1: `application-test.yml`에 `app.resend.api-key: ""` 명시 → 테스트 실 HTTP 미발생 명확화.

## 수용 기준

AC-1 → [FR-1]
  Given: api-key 유효, MockRestServiceServer가 `POST https://api.resend.com/emails`에 `{"id":"msg_abc123"}` 200 응답
  When: `sendInvitationEmail("user@example.com", "https://ieum.app/invite?token=TOKEN", "테스트워크스페이스")` 호출
  Then: 요청 URL=`https://api.resend.com/emails`, 헤더 `Authorization: Bearer {apiKey}`·`Content-Type: application/json`, body에 `"to":"user@example.com"`·`"subject":"[Ieum] 테스트워크스페이스 워크스페이스에 초대되었습니다."`·`"html"` 포함. 예외 미발생.

AC-2 → [FR-2]
  Given: AC-1과 동일
  When: 호출 후 응답 처리 완료
  Then: `log.info`에 `messageId=msg_abc123` 포함

AC-3 → [FR-3]
  Given: api-key 유효, MockRestServiceServer가 500 응답
  When: 호출
  Then: 예외가 호출부로 미전파(정상 반환) + `log.warn/error` 실패 메시지 기록

AC-4 → [FR-3]
  Given: api-key 유효, MockRestServiceServer가 400 응답
  When: 호출
  Then: 예외 미전파(정상 반환)

AC-5 → [FR-4]
  Given: api-key 빈값("")
  When: 호출
  Then: MockRestServiceServer에 요청 미도달 + `log.info` "API 키 미설정" 기록 + 예외 미발생

AC-6 → [FR-5]
  Given: `RestClient.Builder`를 생성자 주입받도록 변경
  When: `MockRestServiceServer.bindTo(builder)` 바인딩 후 인스턴스 생성, `sendInvitationEmail` 호출
  Then: MockRestServiceServer가 요청 캡처(실 네트워크 호출 없음)

AC-7 → [FR-6]
  Given: api-key 유효, MockRestServiceServer가 body 없는 200(`""`) 또는 `id` 없는 JSON(`{}`) 응답
  When: 호출
  Then: 예외 미전파 + `log.warn` id 누락 메시지 기록

## 제외 범위
- 재시도(Retry)·DLQ 연동
- HTML 템플릿 개선(Thymeleaf)
- 초대 재발송 기능
- Resend 응답 `id` 외 필드 활용

## 후속 문서 동기화 (이번 슬라이스 complete 단계)
- context/workspace/status.md: US-INV-02(수락 PR #20)·US-INV-04(취소 PR #21)·INV-07(본 PR) ✅
- context/auth/status.md: INV-07 실발송 반영(표기 정정)
