package com.ieum.config;

import jakarta.servlet.ServletContext;
import org.springframework.context.ApplicationListener;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.ContextRefreshedEvent;
import org.springframework.web.context.WebApplicationContext;

// ⚠️ dev 비활성: ContextRefreshedEvent 시점엔 ServletContext가 이미 초기화돼
// setHttpOnly()가 IllegalStateException을 던진다(실제 Tomcat 기동 시 발현).
// dev 수동 기동을 위해 우회. prod/test는 유지(정식 수정=application.yml 쿠키 설정으로 이전 권장).
@Configuration
@Profile("!dev")
public class SessionCookieConfig {

    @Bean
    public ApplicationListener<ContextRefreshedEvent> sessionCookieConfigurer() {
        return event -> {
            if (event.getApplicationContext() instanceof WebApplicationContext wac) {
                ServletContext sc = wac.getServletContext();
                if (sc != null) {
                    jakarta.servlet.SessionCookieConfig cfg = sc.getSessionCookieConfig();
                    cfg.setHttpOnly(true);
                    cfg.setAttribute("SameSite", "Lax");
                }
            }
        };
    }
}
