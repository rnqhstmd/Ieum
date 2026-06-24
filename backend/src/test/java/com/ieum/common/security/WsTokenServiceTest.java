package com.ieum.common.security;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * WS-AUTH-01 — WsTokenService 단위 테스트 (RED).
 *
 * 골든벡터:
 *   SECRET  = "test-secret-key-32-bytes-long!!"
 *   USERID  = "11111111-1111-1111-1111-111111111111"
 *   clock   = Instant.ofEpochSecond(1700000000) UTC → exp = 1700000300
 *   TOKEN   = eyJ1c2VySWQiOiIxMTExMTExMS0xMTExLTExMTEtMTExMS0xMTExMTExMTExMTEiLCJleHAiOjE3MDAwMDAzMDB9
 *             .sdCpy_TTmL271ycglxyEpQmvxuMVgKSthO61r7UWRBs
 */
class WsTokenServiceTest {

    private static final String SECRET  = "test-secret-key-32-bytes-long!!";
    private static final String USER_ID = "11111111-1111-1111-1111-111111111111";
    private static final String EXPECTED_TOKEN =
            "eyJ1c2VySWQiOiIxMTExMTExMS0xMTExLTExMTEtMTExMS0xMTExMTExMTExMTEiLCJleHAiOjE3MDAwMDAzMDB9" +
            ".sdCpy_TTmL271ycglxyEpQmvxuMVgKSthO61r7UWRBs";

    private static Clock fixedClock() {
        return Clock.fixed(Instant.ofEpochSecond(1700000000L), ZoneOffset.UTC);
    }

    @Test
    @DisplayName("골든벡터: 고정 clock + known secret → 기대 HMAC 토큰 리터럴과 일치")
    void goldenVector_matchesExpectedToken() {
        WsTokenService sut = new WsTokenService(SECRET, fixedClock());

        String token = sut.issue(UUID.fromString(USER_ID));

        assertThat(token).isEqualTo(EXPECTED_TOKEN);
    }

    @Test
    @DisplayName("secret 빈 문자열 → issue() == null")
    void blankSecret_emptyString_returnsNull() {
        WsTokenService sut = new WsTokenService("", fixedClock());

        String token = sut.issue(UUID.fromString(USER_ID));

        assertThat(token).isNull();
    }

    @Test
    @DisplayName("secret 공백 문자열 → issue() == null")
    void blankSecret_whitespace_returnsNull() {
        WsTokenService sut = new WsTokenService("   ", fixedClock());

        String token = sut.issue(UUID.fromString(USER_ID));

        assertThat(token).isNull();
    }

    @Test
    @DisplayName("enabled여도 userId == null → issue() == null (오토큰 방지)")
    void nullUserId_returnsNull() {
        WsTokenService sut = new WsTokenService(SECRET, fixedClock());

        String token = sut.issue(null);

        assertThat(token).isNull();
    }
}
