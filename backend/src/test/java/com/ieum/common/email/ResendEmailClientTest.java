package com.ieum.common.email;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

@ExtendWith(OutputCaptureExtension.class)
class ResendEmailClientTest {

    private static final String RESEND_URL = "https://api.resend.com/emails";

    private RestClient.Builder builder;
    private MockRestServiceServer server;
    private ResendEmailClient client;

    @BeforeEach
    void setUp() {
        builder = RestClient.builder();
        server  = MockRestServiceServer.bindTo(builder).bufferContent().build();
        client  = new ResendEmailClient(builder, "test-key", "no-reply@test.local");
    }

    // ── AC-1: 요청 구조 검증 ────────────────────────────────────────────────

    @Test
    @DisplayName("AC-1: POST 요청에 올바른 URL·메서드·Authorization 헤더·JSON 바디가 포함된다")
    void sendInvitationEmail_requestStructure_isCorrect() {
        server.expect(requestTo(RESEND_URL))
              .andExpect(method(HttpMethod.POST))
              .andExpect(header("Authorization", "Bearer test-key"))
              .andExpect(content().contentType(MediaType.APPLICATION_JSON))
              .andExpect(jsonPath("$.to").value("user@example.com"))
              .andExpect(jsonPath("$.subject").value("[Ieum] 테스트워크스페이스 워크스페이스에 초대되었습니다."))
              .andExpect(jsonPath("$.html").exists())
              .andRespond(withSuccess("{\"id\":\"msg_abc123\"}", MediaType.APPLICATION_JSON));

        assertThatCode(() -> client.sendInvitationEmail(
                "user@example.com",
                "https://ieum.app/invite?token=TOKEN",
                "테스트워크스페이스"
        )).doesNotThrowAnyException();

        server.verify();
    }

    // ── AC-2: 성공 로그 ─────────────────────────────────────────────────────

    @Test
    @DisplayName("AC-2: 2xx + id 존재 응답 시 messageId 포함 INFO 로그를 남긴다")
    void sendInvitationEmail_successResponse_logsMessageId(CapturedOutput output) {
        server.expect(requestTo(RESEND_URL))
              .andExpect(method(HttpMethod.POST))
              .andExpect(header("Authorization", "Bearer test-key"))
              .andExpect(content().contentType(MediaType.APPLICATION_JSON))
              .andExpect(jsonPath("$.to").value("user@example.com"))
              .andExpect(jsonPath("$.subject").value("[Ieum] 테스트워크스페이스 워크스페이스에 초대되었습니다."))
              .andExpect(jsonPath("$.html").exists())
              .andRespond(withSuccess("{\"id\":\"msg_abc123\"}", MediaType.APPLICATION_JSON));

        client.sendInvitationEmail(
                "user@example.com",
                "https://ieum.app/invite?token=TOKEN",
                "테스트워크스페이스"
        );

        assertThat(output.getOut()).contains("messageId=msg_abc123");
        server.verify();
    }

    // ── AC-3: 5xx 응답 — 예외 미전파 + warn 로그 ────────────────────────────

    @Test
    @DisplayName("AC-3: 5xx 응답 시 예외를 전파하지 않고 '초대 이메일 발송 실패' warn 로그를 남긴다")
    void sendInvitationEmail_serverError_doesNotThrow_logsWarn(CapturedOutput output) {
        server.expect(requestTo(RESEND_URL))
              .andRespond(withServerError());

        assertThatCode(() -> client.sendInvitationEmail(
                "user@example.com",
                "https://ieum.app/invite?token=TOKEN",
                "테스트워크스페이스"
        )).doesNotThrowAnyException();

        assertThat(output.getAll()).contains("초대 이메일 발송 실패");
        server.verify();
    }

    // ── AC-4: 4xx 응답 — 예외 미전파 ───────────────────────────────────────

    @Test
    @DisplayName("AC-4: 4xx 응답 시 예외를 전파하지 않는다")
    void sendInvitationEmail_clientError_doesNotThrow() {
        server.expect(requestTo(RESEND_URL))
              .andRespond(withStatus(HttpStatus.BAD_REQUEST));

        assertThatCode(() -> client.sendInvitationEmail(
                "user@example.com",
                "https://ieum.app/invite?token=TOKEN",
                "테스트워크스페이스"
        )).doesNotThrowAnyException();

        server.verify();
    }

    // ── AC-5: API 키 빈값 — HTTP 미호출 + 'API 키 미설정' 로그 ─────────────

    @Test
    @DisplayName("AC-5: apiKey가 빈 문자열이면 HTTP 호출 없이 'API 키 미설정' INFO 로그만 남긴다")
    void sendInvitationEmail_emptyApiKey_noHttpCall_logsInfo(CapturedOutput output) {
        // 별도 빌더/서버로 0-expect 시나리오 검증
        RestClient.Builder noKeyBuilder = RestClient.builder();
        MockRestServiceServer noKeyServer = MockRestServiceServer.bindTo(noKeyBuilder).bufferContent().build();
        ResendEmailClient noKeyClient = new ResendEmailClient(noKeyBuilder, "", "no-reply@test.local");

        assertThatCode(() -> noKeyClient.sendInvitationEmail(
                "user@example.com",
                "https://ieum.app/invite?token=TOKEN",
                "테스트워크스페이스"
        )).doesNotThrowAnyException();

        assertThat(output.getOut()).contains("API 키 미설정");
        noKeyServer.verify(); // 요청 0회 검증
    }

    // ── AC-6: MockRestServiceServer Builder 주입 캡처 검증 ─────────────────

    @Test
    @DisplayName("AC-6: MockRestServiceServer가 ResendEmailClient의 RestClient 요청을 캡처한다 (Builder 주입 증명)")
    void sendInvitationEmail_builderInjection_serverCaptures() {
        server.expect(requestTo(RESEND_URL))
              .andExpect(method(HttpMethod.POST))
              .andExpect(header("Authorization", "Bearer test-key"))
              .andRespond(withSuccess("{\"id\":\"msg_builder_ok\"}", MediaType.APPLICATION_JSON));

        assertThatCode(() -> client.sendInvitationEmail(
                "user@example.com",
                "https://ieum.app/invite?token=TOKEN",
                "테스트워크스페이스"
        )).doesNotThrowAnyException();

        server.verify();
    }

    // ── AC-7: 2xx + body 없는(id 누락) 응답 — warn 로그 ────────────────────

    @Test
    @DisplayName("AC-7: 2xx이지만 응답 body에 id가 없으면 'messageId 없음' warn 로그를 남기고 예외를 전파하지 않는다")
    void sendInvitationEmail_successWithoutId_logsWarnNoMessageId(CapturedOutput output) {
        server.expect(requestTo(RESEND_URL))
              .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));

        assertThatCode(() -> client.sendInvitationEmail(
                "user@example.com",
                "https://ieum.app/invite?token=TOKEN",
                "테스트워크스페이스"
        )).doesNotThrowAnyException();

        assertThat(output.getAll()).contains("messageId 없음");
        server.verify();
    }

    // ── SEC-1: workspaceName CRLF 정제 — 헤더 인젝션 방어 ───────────────────

    @Test
    @DisplayName("SEC-1: workspaceName의 CRLF가 공백으로 정제되어 subject 헤더 인젝션을 방어한다")
    void sendInvitationEmail_crlfInWorkspaceName_sanitizedInSubject() {
        server.expect(requestTo(RESEND_URL))
              .andExpect(method(HttpMethod.POST))
              .andExpect(jsonPath("$.subject").value("[Ieum] 팀 Bcc: evil@x.com 워크스페이스에 초대되었습니다."))
              .andRespond(withSuccess("{\"id\":\"msg_x\"}", MediaType.APPLICATION_JSON));

        client.sendInvitationEmail(
                "user@example.com",
                "https://ieum.app/invite?token=T",
                "팀\r\nBcc: evil@x.com"
        );

        server.verify();
    }
}
