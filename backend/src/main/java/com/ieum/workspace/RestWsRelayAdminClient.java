package com.ieum.workspace;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.UUID;

@Component
public class RestWsRelayAdminClient implements WsRelayAdminClient {

    private static final Logger log = LoggerFactory.getLogger(RestWsRelayAdminClient.class);

    private final RestClient restClient;
    private final String adminBaseUrl;

    public RestWsRelayAdminClient(RestClient.Builder builder,
                                  @Value("${app.ws-relay.admin-url:}") String adminBaseUrl) {
        this.restClient = builder.build();
        this.adminBaseUrl = adminBaseUrl;
        if (adminBaseUrl == null || adminBaseUrl.isBlank()) {
            log.warn("[RestWsRelayAdminClient] app.ws-relay.admin-url 미설정 — WS 강제종료 비활성화");
        }
    }

    @Override
    public void disconnectUser(UUID userId) {
        if (adminBaseUrl == null || adminBaseUrl.isBlank()) {
            return;
        }
        try {
            restClient.delete()
                    .uri(adminBaseUrl + "/admin/connections/{userId}", userId)
                    .retrieve()
                    .toBodilessEntity();
        } catch (Exception e) {
            log.warn("[RestWsRelayAdminClient] disconnectUser 실패 — userId={}", userId, e);
        }
    }
}
