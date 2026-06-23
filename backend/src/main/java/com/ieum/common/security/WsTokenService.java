package com.ieum.common.security;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.util.Base64;
import java.util.UUID;

@Service
public class WsTokenService {

    private static final Logger log = LoggerFactory.getLogger(WsTokenService.class);

    private final String secret;
    private final boolean enabled;
    private final Clock clock;

    public WsTokenService(
            @Value("${app.auth.secret:}") String secret,
            Clock clock) {
        this.secret = secret;
        this.enabled = secret != null && !secret.isBlank();
        this.clock = clock;
        if (!this.enabled) {
            log.warn("app.auth.secret 미설정 — WsTokenService 비활성화(token=null)");
        }
    }

    public String issue(UUID userId) {
        if (!enabled) {
            return null;
        }
        long exp = clock.instant().getEpochSecond() + 300;
        String payload = "{\"userId\":\"" + userId + "\",\"exp\":" + exp + "}";

        String p = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(payload.getBytes(StandardCharsets.UTF_8));

        byte[] sig = hmacSha256(p.getBytes(StandardCharsets.UTF_8),
                secret.getBytes(StandardCharsets.UTF_8));
        String s = Base64.getUrlEncoder().withoutPadding().encodeToString(sig);

        return p + "." + s;
    }

    private static byte[] hmacSha256(byte[] data, byte[] key) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return mac.doFinal(data);
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            throw new IllegalStateException("HmacSHA256 실패", e);
        }
    }
}
