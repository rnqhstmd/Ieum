package com.ieum.config;

import com.ieum.support.AbstractIntegrationTest;
import jakarta.servlet.ServletContext;
import jakarta.servlet.SessionCookieConfig;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.context.WebApplicationContext;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@AutoConfigureMockMvc
class SessionSecurityTest extends AbstractIntegrationTest {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    WebApplicationContext wac;

    @Test
    @DisplayName("AC-SEC-01: 세션 쿠키에 HttpOnly=true, SameSite=Lax 속성이 설정되어야 한다")
    void sessionCookie_shouldHaveHttpOnlyAndSameSiteLax() {
        ServletContext servletContext = wac.getServletContext();
        SessionCookieConfig cfg = servletContext.getSessionCookieConfig();

        assertThat(cfg.isHttpOnly())
                .as("세션 쿠키 HttpOnly 속성이 true여야 한다")
                .isTrue();

        assertThat(cfg.getAttribute("SameSite"))
                .as("세션 쿠키 SameSite 속성이 Lax여야 한다")
                .isEqualTo("Lax");
    }

    @Test
    @DisplayName("AC-SEC-02: 변조된 JSESSIONID 쿠키로 요청 시 401 Unauthorized가 반환되어야 한다")
    void tamperedSessionCookie_shouldReturn401() throws Exception {
        mockMvc.perform(
                get("/api/workspaces")
                        .cookie(new jakarta.servlet.http.Cookie("JSESSIONID", "tampered-invalid-value"))
        ).andExpect(status().isUnauthorized());
    }
}
