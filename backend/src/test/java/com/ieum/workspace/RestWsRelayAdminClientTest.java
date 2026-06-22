package com.ieum.workspace;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

@ExtendWith(OutputCaptureExtension.class)
class RestWsRelayAdminClientTest {

    private static final String ADMIN_BASE_URL = "http://localhost:9090";
    private static final UUID USER_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");

    private RestClient.Builder builder;
    private MockRestServiceServer server;
    private RestWsRelayAdminClient client;

    @BeforeEach
    void setUp() {
        builder = RestClient.builder();
        server  = MockRestServiceServer.bindTo(builder).bufferContent().build();
        client  = new RestWsRelayAdminClient(builder, ADMIN_BASE_URL);
    }

    // ── AC-14/15: 정상 시 DELETE 엔드포인트 1회 호출 ────────────────────────

    @Test
    @DisplayName("AC-14/15: admin-url 설정 시 disconnectUser(userId) → DELETE {base}/admin/connections/{userId} 1회 호출")
    void disconnectUser_withAdminUrl_sendsDeleteRequest() {
        String expectedUrl = ADMIN_BASE_URL + "/admin/connections/" + USER_ID;

        server.expect(requestTo(expectedUrl))
              .andExpect(method(HttpMethod.DELETE))
              .andRespond(withSuccess());

        client.disconnectUser(USER_ID);

        server.verify();
    }

    // ── AC-14: admin-url 빈 문자열 → HTTP 호출 없음 ─────────────────────────

    @Test
    @DisplayName("AC-14: admin-url이 빈 문자열이면 HTTP 호출 없이 no-op으로 동작한다")
    void disconnectUser_emptyAdminUrl_noHttpCall(CapturedOutput output) {
        RestClient.Builder noUrlBuilder = RestClient.builder();
        MockRestServiceServer noUrlServer = MockRestServiceServer.bindTo(noUrlBuilder).bufferContent().build();
        RestWsRelayAdminClient noUrlClient = new RestWsRelayAdminClient(noUrlBuilder, "");

        assertThatCode(() -> noUrlClient.disconnectUser(USER_ID))
                .doesNotThrowAnyException();

        noUrlServer.verify(); // 요청 0회 검증
    }

    // ── AC-16: 5xx 응답 → 예외 미전파 ──────────────────────────────────────

    @Test
    @DisplayName("AC-16: 서버가 5xx 응답을 반환해도 disconnectUser는 예외를 전파하지 않는다")
    void disconnectUser_serverError_doesNotThrowAnyException() {
        String expectedUrl = ADMIN_BASE_URL + "/admin/connections/" + USER_ID;

        server.expect(requestTo(expectedUrl))
              .andExpect(method(HttpMethod.DELETE))
              .andRespond(withServerError());

        assertThatCode(() -> client.disconnectUser(USER_ID))
                .doesNotThrowAnyException();

        server.verify();
    }
}
