package com.ieum.config;

import com.ieum.support.AbstractIntegrationTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@AutoConfigureMockMvc
class SecurityIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    // ── AC-AUTH-04: 미인증 비-API → 302 /login ───────────────────────────────

    @Test
    @DisplayName("AC-AUTH-04: 미인증 GET /dashboard — 302 리다이렉트, Location에 /login 포함")
    void unauthenticated_nonApiRequest_redirectsToLogin() throws Exception {
        mockMvc.perform(get("/dashboard"))
                .andExpect(status().isFound())
                .andExpect(header().string("Location", containsString("/login")));
    }

    // ── AC-AUTH-05: 미인증 /api/** → 401 JSON ────────────────────────────────

    @Test
    @DisplayName("AC-AUTH-05: 미인증 GET /api/workspaces — 401, Content-Type JSON, 바디에 code 필드 존재")
    void unauthenticated_apiRequest_returns401JsonWithCodeField() throws Exception {
        mockMvc.perform(get("/api/workspaces"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.code").exists());
    }

    // ── AC-AUTH-01: OAuth 진입 → 302 google (회귀 가드) ─────────────────────

    @Test
    @DisplayName("AC-AUTH-01: GET /oauth2/authorization/google — 302, Location에 accounts.google.com 포함")
    void oauth2AuthorizationRequest_redirectsToGoogle() throws Exception {
        mockMvc.perform(get("/oauth2/authorization/google"))
                .andExpect(status().isFound())
                .andExpect(header().string("Location", containsString("accounts.google.com")));
    }

    // ── FR-9: 로그아웃 ────────────────────────────────────────────────────────

    @Test
    @DisplayName("FR-9: 인증된 사용자 POST /api/auth/logout — 204 No Content")
    void authenticatedUser_postLogout_returns204() throws Exception {
        mockMvc.perform(post("/api/auth/logout").with(oauth2Login()))
                .andExpect(status().isNoContent());
    }

    // ── SEC-CRITICAL: GET 로그아웃 차단 ──────────────────────────────────────

    @Test
    @DisplayName("SEC-CRITICAL: GET /api/auth/logout — 204가 아니어야 함 (POST 전용, GET은 405 Method Not Allowed)")
    void authenticatedUser_getLogout_mustNotReturn2xx() throws Exception {
        mockMvc.perform(get("/api/auth/logout").with(oauth2Login()))
                .andExpect(status().isMethodNotAllowed());
    }
}
