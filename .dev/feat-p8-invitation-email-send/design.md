# 설계: P8 마지막 — Resend 초대 이메일 실 HTTP 발송 (INV-07)

## 설계 규모
**소형** — `ResendEmailClient` 1 메서드의 TODO 주석을 실 HTTP 호출로 교체 + 생성자 DI 변경 + 신규 record 1 + `application-test.yml` 설정. 호출부(InvitationService) 변경 없음.

## 확정 결정 (사용자 승인 + test-architect 반영)
1. **설정 주입**: 생성자 `@Value` 파라미터 승격 — `ResendEmailClient(RestClient.Builder builder, @Value("${app.resend.api-key}") String apiKey, @Value("${app.resend.from}") String from)`. `@Value` 필드 주입 제거 → 테스트는 `new ResendEmailClient(builder, "key", "from")`로 타입 안전(ReflectionTestUtils 불필요).
2. **로그 레벨**: 발송 실패(4xx/5xx/네트워크)는 모두 `log.warn` 단일(비치명 — PENDING 유지·재발송 가능).
3. **응답 타입**: 별도 파일 `ResendResponse.java`(record).

## 변경 범위

### 수정 파일 (2)
| 파일 | 역할 |
|------|------|
| `common/email/ResendEmailClient.java` | 생성자 DI(Builder+apiKey+from), 실 HTTP 호출 + 응답 파싱 + 예외 처리 |
| `test/resources/application-test.yml` | `app.resend.api-key: ""` + `app.resend.from` 명시(QE-1, @Value 해결 보장) |

### 신규 파일 (2)
| 파일 | 역할 |
|------|------|
| `common/email/ResendResponse.java` | `public record ResendResponse(String id) {}` — 2xx 응답 매핑 |
| `test/.../common/email/ResendEmailClientTest.java` | MockRestServiceServer 단위 테스트(AC-1~7) |

### 변경 없음
- `InvitationService.java:108-115` 호출부 try-catch — 2차 방어선 유지(시그니처 불변).

## 상세 설계

### 1. ResendResponse (신규)
```java
package com.ieum.common.email;
public record ResendResponse(String id) {}
```
Jackson 역직렬화(`FAIL_ON_UNKNOWN_PROPERTIES=false` 기본)로 스키마 변동 안전.

### 2. ResendEmailClient — 생성자 DI
```java
private final RestClient restClient;
private final String apiKey;
private final String from;

public ResendEmailClient(RestClient.Builder builder,
                         @Value("${app.resend.api-key}") String apiKey,
                         @Value("${app.resend.from}") String from) {
    this.restClient = builder.build();
    this.apiKey = apiKey;
    this.from = from;
}
```
Spring Boot가 `RestClient.Builder` 빈 자동 제공. @Value 필드 주입 제거.

### 3. sendInvitationEmail — 실호출 + 응답 파싱 + 예외 처리
```java
public void sendInvitationEmail(String to, String inviteUrl, String workspaceName) {
    if (apiKey == null || apiKey.isBlank()) {
        log.info("[ResendEmailClient] API 키 미설정 — 이메일 발송 건너뜀. to={}, ...", to, ...);
        return;  // FR-4
    }
    Map<String,Object> payload = Map.of("from", from, "to", to,
        "subject", "[Ieum] " + workspaceName + " 워크스페이스에 초대되었습니다.",
        "html", "<p><a href=\"" + inviteUrl + "\">초대 수락하기</a></p>");
    try {
        ResponseEntity<ResendResponse> resp = restClient.post()
            .uri(RESEND_EMAILS_URL)
            .header("Authorization", "Bearer " + apiKey)
            .contentType(MediaType.APPLICATION_JSON)
            .body(payload)
            .retrieve()
            .toEntity(ResendResponse.class);          // 4xx/5xx → RestClientResponseException
        ResendResponse body = resp.getBody();
        if (body != null && body.id() != null && !body.id().isBlank()) {
            log.info("[ResendEmailClient] 초대 이메일 발송 성공 — to={}, messageId={}", to, body.id()); // FR-2
        } else {
            log.warn("[ResendEmailClient] 발송 응답에 messageId 없음 — to={}", to);  // FR-6
        }
    } catch (Exception e) {
        log.warn("[ResendEmailClient] 초대 이메일 발송 실패 — to={}, error={}", to, e.getMessage()); // FR-3
    }
}
```
- import 추가: `org.springframework.http.MediaType`, `org.springframework.http.ResponseEntity`.
- FR-3: try-catch(Exception)로 RestClientResponseException(4xx/5xx)·ResourceAccessException(네트워크) 흡수 → 미전파.
- FR-6: 2xx인데 body/id 없음은 catch가 아닌 try 내부 정상 분기(warn).

### 4. application-test.yml (QE-1)
```yaml
app:
  resend:
    api-key: ""
    from: "Ieum <noreply@test.local>"
```
테스트 컨텍스트 @Value 해결 보장 + 통합 경로 HTTP 미시도(api-key 빈값).

### 로그 문구 고정 (코드/테스트 공유)
- 미설정: `API 키 미설정` / 성공: `messageId=` / id 없음: `messageId 없음` / 실패: `초대 이메일 발송 실패`

## 구현 순서 (RGR)
```
T1 Resend 실발송 (단일 클래스 집중)
  R: ResendEmailClientTest(AC-1~7) 작성 → 3-arg 생성자·ResendResponse 미존재로 컴파일 RED
  G: ResendResponse record + ResendEmailClient 생성자 DI + 실호출/파싱/예외 + application-test.yml
  F: 정리
```
AC 7건이 모두 단일 클래스/단일 테스트 파일에 집중되어 1태스크로 진행.

## 테스트 전략 개요
- **순수 단위(ResendEmailClientTest)** — @SpringBootTest 불필요. `@BeforeEach`에서 `RestClient.Builder builder = RestClient.builder()` → `MockRestServiceServer server = MockRestServiceServer.bindTo(builder).bufferContent().build()` → `new ResendEmailClient(builder, "test-key", "no-reply@test.local")` **매번 재생성**(stateful mock 상태 누수 방지).
- 로그 검증: `@ExtendWith(OutputCaptureExtension.class)` + `CapturedOutput`. info=`getOut()`, warn=`getAll()`. 부분 문자열 매칭.
- import 주의: `org.springframework.test.web.client.MockRestServiceServer`(client-side, MockMvc 아님), `org.springframework.test.web.client.match.MockRestRequestMatchers.*`, `org.springframework.test.web.client.response.MockRestResponseCreators.*`.

---

## Testability 평가 (test-architect)

### Testability Score: 8/10 — ✅ PASS
생성자 DI로 HTTP 계층 완전 격리, 외부 SaaS 100% mock 결정론화, AC 7건 단위 1:1 매핑, 예외/로그 검증이 기존 컨벤션(`assertThatCode`+`OutputCaptureExtension`) 재사용.

(설정 주입 생성자 승격 채택으로 test-architect 감점 -1 해소. 잔여 -1은 테스트 안정성 가이드 — 아래 지침으로 보완.)

### 테스트 작성 지침 (Green 단계 준수)
1. **MockRestServiceServer**: `bindTo(builder).bufferContent().build()`(헤더+body 다중 andExpect 안정). builder/server/client `@BeforeEach` 매번 재생성.
2. **AC-1**: `server.expect(requestTo(RESEND_EMAILS_URL)).andExpect(method(POST)).andExpect(header("Authorization","Bearer test-key")).andExpect(content().contentType(APPLICATION_JSON)).andExpect(jsonPath("$.to").value(...)).andExpect(jsonPath("$.subject").value("[Ieum] 테스트워크스페이스 워크스페이스에 초대되었습니다.")).andExpect(jsonPath("$.html").exists()).andRespond(withSuccess("{\"id\":\"msg_abc123\"}", APPLICATION_JSON))`. 말미 `server.verify()`.
3. **AC-2**: 위 응답 → `getOut()` contains `messageId=msg_abc123`.
4. **AC-3/4**: `andRespond(withServerError())`(500)/`withStatus(BAD_REQUEST)`(400) → `assertThatCode(()->client.send(...)).doesNotThrowAnyException()` + `getAll()` contains `초대 이메일 발송 실패`.
5. **AC-5**: `new ResendEmailClient(builder, "", from)` → expectation 0건 → 호출 시 mock이 "no request expected"면 실패하므로 호출 0회 간접 증명 + `server.verify()` + `getOut()` contains `API 키 미설정` (2중 검증).
6. **AC-6**: AC-1 통과가 곧 Builder 주입 캡처 증거.
7. **AC-7**: `andRespond(withSuccess("{}", APPLICATION_JSON))` → `doesNotThrowAnyException()` + `getAll()` contains `messageId 없음`.

### 격리 전략 (red-writer 참조)
- 외부 mock 없음(MockRestServiceServer가 HTTP 격리). Mockito 불필요 — OutputCaptureExtension만.
- InvitationServiceTest는 `@Mock ResendEmailClient`라 생성자 변경 영향 없음(회귀 0 확인됨).
