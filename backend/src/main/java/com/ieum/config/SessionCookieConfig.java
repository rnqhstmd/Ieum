package com.ieum.config;

import jakarta.servlet.ServletContext;
import org.springframework.context.ApplicationListener;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.ContextRefreshedEvent;
import org.springframework.web.context.WebApplicationContext;

@Configuration
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
