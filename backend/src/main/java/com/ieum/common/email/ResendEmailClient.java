package com.ieum.common.email;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Map;

@Component
public class ResendEmailClient {

    private static final Logger log = LoggerFactory.getLogger(ResendEmailClient.class);
    private static final String RESEND_EMAILS_URL = "https://api.resend.com/emails";

    @Value("${app.resend.api-key}")
    private String apiKey;

    @Value("${app.resend.from}")
    private String from;

    private final RestClient restClient;

    public ResendEmailClient() {
        this.restClient = RestClient.create();
    }

    /**
     * 워크스페이스 초대 이메일을 발송한다.
     *
     * @param to            수신자 이메일
     * @param inviteUrl     초대 수락 URL
     * @param workspaceName 초대 대상 워크스페이스 이름
     */
    public void sendInvitationEmail(String to, String inviteUrl, String workspaceName) {
        // API 키가 없으면 로그만 남기고 반환 (로컬 개발 환경 대응)
        if (apiKey == null || apiKey.isBlank()) {
            log.info("[ResendEmailClient] API 키 미설정 — 이메일 발송 건너뜀. to={}, workspaceName={}, inviteUrl={}",
                to, workspaceName, inviteUrl);
            return;
        }

        // TODO(Phase 4): 아래 본문을 실제 Resend API 호출로 교체
        //   - HTML 템플릿 적용 (Thymeleaf 또는 정적 템플릿)
        //   - 발송 결과(messageId) 로깅
        //   - 실패 시 재시도 전략(Retry) 또는 DLQ 연동 검토
        Map<String, Object> payload = Map.of(
            "from", from,
            "to", to,
            "subject", "[Ieum] " + workspaceName + " 워크스페이스에 초대되었습니다.",
            "html", "<p><a href=\"" + inviteUrl + "\">초대 수락하기</a></p>"
        );

        log.debug("[ResendEmailClient] 이메일 발송 준비 완료 — payload: {}", payload);

        // TODO(Phase 4): 실제 HTTP 호출
        // restClient.post()
        //     .uri(RESEND_EMAILS_URL)
        //     .header("Authorization", "Bearer " + apiKey)
        //     .contentType(MediaType.APPLICATION_JSON)
        //     .body(payload)
        //     .retrieve()
        //     .toBodilessEntity();
    }
}
