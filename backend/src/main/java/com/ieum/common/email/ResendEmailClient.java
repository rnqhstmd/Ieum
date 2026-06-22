package com.ieum.common.email;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Map;

@Component
public class ResendEmailClient {

    private static final Logger log = LoggerFactory.getLogger(ResendEmailClient.class);
    private static final String RESEND_EMAILS_URL = "https://api.resend.com/emails";

    private final RestClient restClient;
    private final String apiKey;
    private final String from;

    public ResendEmailClient(RestClient.Builder builder,
                             @Value("${app.resend.api-key}") String apiKey,
                             @Value("${app.resend.from}") String from) {
        this.restClient = builder.build();
        this.apiKey = apiKey;
        this.from = from;
    }

    /**
     * 워크스페이스 초대 이메일을 발송한다.
     *
     * @param to            수신자 이메일
     * @param inviteUrl     초대 수락 URL
     * @param workspaceName 초대 대상 워크스페이스 이름
     */
    public void sendInvitationEmail(String to, String inviteUrl, String workspaceName) {
        if (apiKey == null || apiKey.isBlank()) {
            log.info("[ResendEmailClient] API 키 미설정 — 이메일 발송 건너뜀. to={}, workspaceName={}", to, workspaceName);
            return;
        }

        String safeWorkspaceName = (workspaceName == null) ? "" : workspaceName.replaceAll("\\r\\n|[\\r\\n]", " ");

        Map<String, Object> payload = Map.of(
            "from", from,
            "to", to,
            "subject", "[Ieum] " + safeWorkspaceName + " 워크스페이스에 초대되었습니다.",
            "html", "<p><a href=\"" + inviteUrl + "\">초대 수락하기</a></p>"
        );

        try {
            ResponseEntity<ResendResponse> resp = restClient.post()
                .uri(RESEND_EMAILS_URL)
                .header("Authorization", "Bearer " + apiKey)
                .contentType(MediaType.APPLICATION_JSON)
                .body(payload)
                .retrieve()
                .toEntity(ResendResponse.class);
            ResendResponse body = resp.getBody();
            if (body != null && body.id() != null && !body.id().isBlank()) {
                log.info("[ResendEmailClient] 초대 이메일 발송 성공 — to={}, messageId={}", to, body.id());
            } else {
                log.warn("[ResendEmailClient] 발송 응답에 messageId 없음 — to={}", to);
            }
        } catch (Exception e) {
            log.warn("[ResendEmailClient] 초대 이메일 발송 실패 — to={}", to, e);
        }
    }
}
