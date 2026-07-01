package com.ieum.config;

import com.ieum.common.security.JsonAuthenticationEntryPoint;
import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.logout.LogoutFilter;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.filter.OncePerRequestFilter;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Value("${app.frontend-url}")
    private String frontendUrl;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http,
                                                   CorsConfigurationSource corsConfigurationSource,
                                                   OAuth2SuccessHandler oAuth2SuccessHandler,
                                                   JsonAuthenticationEntryPoint jsonAuthenticationEntryPoint,
                                                   org.springframework.core.env.Environment env) throws Exception {
        // dev 프로파일에서만 개발 로그인 우회(/api/dev/**)를 허용한다. prod에서는 닫힌다.
        boolean devProfile = java.util.Arrays.asList(env.getActiveProfiles()).contains("dev");
        http
            .cors(cors -> cors.configurationSource(corsConfigurationSource))
            .csrf(csrf -> csrf.disable())
            .exceptionHandling(e -> e.authenticationEntryPoint(jsonAuthenticationEntryPoint))
            .authorizeHttpRequests(auth -> {
                auth.requestMatchers(
                    "/api/health",
                    "/actuator/**",
                    "/ws/**",
                    "/login/**",
                    "/oauth2/**"
                ).permitAll();
                if (devProfile) {
                    auth.requestMatchers("/api/dev/**").permitAll();
                }
                auth.anyRequest().authenticated();
            })
            .oauth2Login(oauth2 -> oauth2
                .successHandler(oAuth2SuccessHandler)
                .failureUrl(frontendUrl + "/login?error=true")
            )
            .logout(logout -> logout
                .logoutRequestMatcher(request ->
                    "POST".equalsIgnoreCase(request.getMethod()) && "/api/auth/logout".equals(request.getRequestURI()))
                .invalidateHttpSession(true)
                .deleteCookies("JSESSIONID")
                .logoutSuccessHandler((req, res, auth) -> res.setStatus(204)))
            .addFilterBefore(new OncePerRequestFilter() {
                @Override
                protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                                FilterChain filterChain) throws java.io.IOException, jakarta.servlet.ServletException {
                    if ("GET".equalsIgnoreCase(request.getMethod()) && "/api/auth/logout".equals(request.getRequestURI())) {
                        response.setStatus(HttpServletResponse.SC_METHOD_NOT_ALLOWED);
                        return;
                    }
                    filterChain.doFilter(request, response);
                }
            }, LogoutFilter.class);

        return http.build();
    }
}
