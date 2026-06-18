package com.ieum.config;

import com.ieum.collaboration.CollaborationWebSocketHandler;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final CollaborationWebSocketHandler collaborationWebSocketHandler;

    @Value("${app.frontend-url}")
    private String frontendUrl;

    public WebSocketConfig(CollaborationWebSocketHandler collaborationWebSocketHandler) {
        this.collaborationWebSocketHandler = collaborationWebSocketHandler;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry
            .addHandler(collaborationWebSocketHandler, "/ws/pages/*")
            // 프론트엔드 오리진만 허용 (환경변수로 제어)
            .setAllowedOrigins(frontendUrl);
    }
}
