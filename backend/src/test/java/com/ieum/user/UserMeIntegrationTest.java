package com.ieum.user;

import com.ieum.support.AbstractIntegrationTest;
import com.ieum.page.PageRepository;
import com.ieum.workspace.MembershipRepository;
import com.ieum.workspace.WorkspaceRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.util.Base64;
import java.util.UUID;

import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// WS-AUTH-01 / AC-06,07: GET /api/users/me — HMAC 신원토큰 발급
@AutoConfigureMockMvc
class UserMeIntegrationTest extends AbstractIntegrationTest {

    /** token이 non-null이 되려면 app.auth.secret이 설정되어야 한다. */
    @DynamicPropertySource
    static void wsAuthProperties(DynamicPropertyRegistry registry) {
        registry.add("app.auth.secret", () -> "integration-test-secret-32-bytes!!");
    }

    @Autowired private MockMvc mockMvc;
    @Autowired private UserRepository userRepository;
    @Autowired private WorkspaceRepository workspaceRepository;
    @Autowired private MembershipRepository membershipRepository;
    @Autowired private PageRepository pageRepository;

    private static final String GOOGLE_ID = "G-ME";
    private UUID userId;

    @BeforeEach
    void setUp() {
        // FK 순서: page → membership → workspace → user
        pageRepository.deleteAll();
        membershipRepository.deleteAll();
        workspaceRepository.deleteAll();
        userRepository.deleteAll();
        User user = userRepository.save(User.builder()
                .googleId(GOOGLE_ID).email("me@test.com").name("미유저").image("img").build());
        userId = user.getId();
    }

    private static RequestPostProcessor asUser(String googleId) {
        return oauth2Login().attributes(a -> a.put("sub", googleId));
    }

    @Test
    @DisplayName("AC-1: 인증 GET /api/users/me → 200 + 내 id/email/name")
    void authenticated_me_returns200() throws Exception {
        mockMvc.perform(get("/api/users/me").with(asUser(GOOGLE_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(userId.toString()))
                .andExpect(jsonPath("$.email").value("me@test.com"))
                .andExpect(jsonPath("$.name").value("미유저"));
    }

    @Test
    @DisplayName("AC-2: 미인증 GET /api/users/me → 401")
    void unauthenticated_me_returns401() throws Exception {
        mockMvc.perform(get("/api/users/me"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("AC-06: 인증 GET /api/users/me → 200 + token 필드 존재(non-null)")
    void authenticated_me_returns_token_field() throws Exception {
        mockMvc.perform(get("/api/users/me").with(asUser(GOOGLE_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").value(notNullValue()));
    }

    @Test
    @DisplayName("AC-06: token 형식 — '.'으로 2분할, 첫 조각 base64url 디코드 시 userId 포함")
    void authenticated_me_token_format_containsUserId() throws Exception {
        var result = mockMvc.perform(get("/api/users/me").with(asUser(GOOGLE_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").value(notNullValue()))
                .andReturn();

        String body = result.getResponse().getContentAsString();
        // token 값 추출: JSON에서 "token":"<value>" 파싱
        String token = extractTokenFromJson(body);

        String[] parts = token.split("\\.");
        org.assertj.core.api.Assertions.assertThat(parts)
                .as("token은 '.'으로 정확히 2개 파트로 분할되어야 한다")
                .hasSize(2);

        // base64url 디코드 (패딩 없는 URL-safe)
        byte[] payloadBytes = Base64.getUrlDecoder().decode(padBase64(parts[0]));
        String payload = new String(payloadBytes, java.nio.charset.StandardCharsets.UTF_8);

        org.assertj.core.api.Assertions.assertThat(payload)
                .as("payload에 userId가 포함되어야 한다")
                .contains(userId.toString());
    }

    @Test
    @DisplayName("AC-07: 미인증 GET /api/users/me → 401 (기존 유지)")
    void unauthenticated_me_returns401_ac07() throws Exception {
        mockMvc.perform(get("/api/users/me"))
                .andExpect(status().isUnauthorized());
    }

    // --- 헬퍼 ---

    private static String extractTokenFromJson(String json) {
        // "token":"<value>" 단순 파싱 (Jackson ObjectMapper 의존 없이)
        int idx = json.indexOf("\"token\":");
        if (idx < 0) throw new AssertionError("token 필드가 JSON에 없음: " + json);
        int start = json.indexOf('"', idx + 8) + 1;
        int end   = json.indexOf('"', start);
        return json.substring(start, end);
    }

    private static String padBase64(String s) {
        return switch (s.length() % 4) {
            case 2  -> s + "==";
            case 3  -> s + "=";
            default -> s;
        };
    }
}
