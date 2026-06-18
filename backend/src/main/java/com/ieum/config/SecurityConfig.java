package com.ieum.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.web.cors.CorsConfigurationSource;

import java.io.IOException;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Value("${app.frontend-url}")
    private String frontendUrl;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http,
                                                   CorsConfigurationSource corsConfigurationSource) throws Exception {
        http
            // CORS 활성화 (CorsConfig의 CorsConfigurationSource 빈 사용)
            .cors(cors -> cors.configurationSource(corsConfigurationSource))
            // API 서버 + WebSocket 사용 → CSRF 비활성화
            .csrf(csrf -> csrf.disable())
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(
                    "/api/health",
                    "/actuator/**",
                    "/ws/**",
                    "/login/**",
                    "/oauth2/**"
                ).permitAll()
                .anyRequest().authenticated()
            )
            .oauth2Login(oauth2 -> oauth2
                // TODO(Phase 0/1): successHandler 내부에서 User upsert +
                //   개인 워크스페이스 자동생성 로직 추가 (08 §1-2)
                .successHandler(oauth2SuccessHandler())
            );

        return http.build();
    }

    /**
     * OAuth2 로그인 성공 시 프론트엔드 대시보드로 리다이렉트하는 스텁 핸들러.
     * TODO(Phase 0/1): 사용자 정보를 받아 DB upsert 및 개인 워크스페이스 생성 후 리다이렉트
     */
    @Bean
    public AuthenticationSuccessHandler oauth2SuccessHandler() {
        return new AuthenticationSuccessHandler() {
            @Override
            public void onAuthenticationSuccess(HttpServletRequest request,
                                                HttpServletResponse response,
                                                Authentication authentication) throws IOException {
                // TODO(Phase 0/1): authentication.getPrincipal()에서 OAuth2User 추출
                //   → UserService.upsert(email, name, picture) 호출
                //   → WorkspaceService.createPersonalWorkspace(userId) 호출
                response.sendRedirect(frontendUrl + "/dashboard");
            }
        };
    }
}
