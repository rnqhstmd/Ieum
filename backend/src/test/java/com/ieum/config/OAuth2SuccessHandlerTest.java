package com.ieum.config;

import com.ieum.user.OAuthUserInfo;
import com.ieum.user.User;
import com.ieum.user.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.user.OAuth2User;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class OAuth2SuccessHandlerTest {

    @Mock
    private UserService userService;

    @Mock
    private HttpServletRequest request;

    @Mock
    private HttpServletResponse response;

    @Mock
    private Authentication authentication;

    // ── extract() ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("extract: OAuth2User 속성에서 OAuthUserInfo 필드가 올바르게 매핑된다")
    void extract_mapsOAuth2UserAttributesToOAuthUserInfo() {
        // Given
        OAuth2User oauth2User = mock(OAuth2User.class);
        when(oauth2User.getAttribute("sub")).thenReturn("G001");
        when(oauth2User.getAttribute("email")).thenReturn("user@example.com");
        when(oauth2User.getAttribute("name")).thenReturn("홍길동");
        when(oauth2User.getAttribute("picture")).thenReturn("http://img/avatar");

        // When
        OAuthUserInfo info = OAuth2SuccessHandler.extract(oauth2User);

        // Then
        assertThat(info.googleId()).isEqualTo("G001");
        assertThat(info.email()).isEqualTo("user@example.com");
        assertThat(info.name()).isEqualTo("홍길동");
        assertThat(info.image()).isEqualTo("http://img/avatar");
    }

    // ── onAuthenticationSuccess 성공 ─────────────────────────────────────────

    @Test
    @DisplayName("onAuthenticationSuccess 성공: userService.loginWithOAuth 호출 후 /dashboard 리다이렉트")
    void onAuthenticationSuccess_callsLoginWithOAuthAndRedirectsToDashboard() throws Exception {
        // Given
        OAuth2User oauth2User = mock(OAuth2User.class);
        when(oauth2User.getAttribute("sub")).thenReturn("G001");
        when(oauth2User.getAttribute("email")).thenReturn("user@example.com");
        when(oauth2User.getAttribute("name")).thenReturn("홍길동");
        when(oauth2User.getAttribute("picture")).thenReturn("http://img/avatar");

        when(authentication.getPrincipal()).thenReturn(oauth2User);

        User savedUser = User.builder()
                .id(UUID.randomUUID())
                .googleId("G001")
                .email("user@example.com")
                .name("홍길동")
                .image("http://img/avatar")
                .build();
        when(userService.loginWithOAuth(any(OAuthUserInfo.class))).thenReturn(savedUser);

        OAuth2SuccessHandler handler = new OAuth2SuccessHandler(userService, "http://localhost:3000");

        // When
        handler.onAuthenticationSuccess(request, response, authentication);

        // Then
        verify(userService).loginWithOAuth(any(OAuthUserInfo.class));
        verify(response).sendRedirect("http://localhost:3000/dashboard");
    }

    // ── callbackUrl 복귀 (AC-AUTH-06) ────────────────────────────────────────

    @Test
    @DisplayName("AC-AUTH-06: callbackUrl=/workspace/abc-123 → frontendUrl+callbackUrl 로 리다이렉트")
    void onAuthenticationSuccess_withValidCallbackUrl_redirectsToCallbackUrl() throws Exception {
        // Given
        OAuth2User oauth2User = mock(OAuth2User.class);
        when(oauth2User.getAttribute("sub")).thenReturn("G001");
        when(oauth2User.getAttribute("email")).thenReturn("user@example.com");
        when(oauth2User.getAttribute("name")).thenReturn("홍길동");
        when(oauth2User.getAttribute("picture")).thenReturn("http://img/avatar");

        when(authentication.getPrincipal()).thenReturn(oauth2User);

        User savedUser = User.builder()
                .id(UUID.randomUUID())
                .googleId("G001")
                .email("user@example.com")
                .name("홍길동")
                .image("http://img/avatar")
                .build();
        when(userService.loginWithOAuth(any(OAuthUserInfo.class))).thenReturn(savedUser);
        when(request.getParameter("callbackUrl")).thenReturn("/workspace/abc-123");

        OAuth2SuccessHandler handler = new OAuth2SuccessHandler(userService, "http://localhost:3000");

        // When
        handler.onAuthenticationSuccess(request, response, authentication);

        // Then
        verify(response).sendRedirect("http://localhost:3000/workspace/abc-123");
    }

    @Test
    @DisplayName("AC-AUTH-06: callbackUrl 없음(null) → frontendUrl+/dashboard 로 리다이렉트")
    void onAuthenticationSuccess_withNoCallbackUrl_redirectsToDashboard() throws Exception {
        // Given
        OAuth2User oauth2User = mock(OAuth2User.class);
        when(oauth2User.getAttribute("sub")).thenReturn("G001");
        when(oauth2User.getAttribute("email")).thenReturn("user@example.com");
        when(oauth2User.getAttribute("name")).thenReturn("홍길동");
        when(oauth2User.getAttribute("picture")).thenReturn("http://img/avatar");

        when(authentication.getPrincipal()).thenReturn(oauth2User);

        User savedUser = User.builder()
                .id(UUID.randomUUID())
                .googleId("G001")
                .email("user@example.com")
                .name("홍길동")
                .image("http://img/avatar")
                .build();
        when(userService.loginWithOAuth(any(OAuthUserInfo.class))).thenReturn(savedUser);
        // callbackUrl 파라미터 없음 → Mockito 기본값 null 반환, stub 불필요

        OAuth2SuccessHandler handler = new OAuth2SuccessHandler(userService, "http://localhost:3000");

        // When
        handler.onAuthenticationSuccess(request, response, authentication);

        // Then
        verify(response).sendRedirect("http://localhost:3000/dashboard");
    }

    @Test
    @DisplayName("AC-AUTH-06 open-redirect 방지: callbackUrl=http://evil.com → /dashboard 폴백")
    void onAuthenticationSuccess_withAbsoluteCallbackUrl_redirectsToDashboard() throws Exception {
        // Given
        OAuth2User oauth2User = mock(OAuth2User.class);
        when(oauth2User.getAttribute("sub")).thenReturn("G001");
        when(oauth2User.getAttribute("email")).thenReturn("user@example.com");
        when(oauth2User.getAttribute("name")).thenReturn("홍길동");
        when(oauth2User.getAttribute("picture")).thenReturn("http://img/avatar");

        when(authentication.getPrincipal()).thenReturn(oauth2User);

        User savedUser = User.builder()
                .id(UUID.randomUUID())
                .googleId("G001")
                .email("user@example.com")
                .name("홍길동")
                .image("http://img/avatar")
                .build();
        when(userService.loginWithOAuth(any(OAuthUserInfo.class))).thenReturn(savedUser);
        lenient().when(request.getParameter("callbackUrl")).thenReturn("http://evil.com");

        OAuth2SuccessHandler handler = new OAuth2SuccessHandler(userService, "http://localhost:3000");

        // When
        handler.onAuthenticationSuccess(request, response, authentication);

        // Then
        verify(response).sendRedirect("http://localhost:3000/dashboard");
        verify(response, never()).sendRedirect("http://evil.com");
    }

    @Test
    @DisplayName("AC-AUTH-06 open-redirect 방지: callbackUrl=//evil.com → /dashboard 폴백")
    void onAuthenticationSuccess_withProtocolRelativeCallbackUrl_redirectsToDashboard() throws Exception {
        // Given
        OAuth2User oauth2User = mock(OAuth2User.class);
        when(oauth2User.getAttribute("sub")).thenReturn("G001");
        when(oauth2User.getAttribute("email")).thenReturn("user@example.com");
        when(oauth2User.getAttribute("name")).thenReturn("홍길동");
        when(oauth2User.getAttribute("picture")).thenReturn("http://img/avatar");

        when(authentication.getPrincipal()).thenReturn(oauth2User);

        User savedUser = User.builder()
                .id(UUID.randomUUID())
                .googleId("G001")
                .email("user@example.com")
                .name("홍길동")
                .image("http://img/avatar")
                .build();
        when(userService.loginWithOAuth(any(OAuthUserInfo.class))).thenReturn(savedUser);
        lenient().when(request.getParameter("callbackUrl")).thenReturn("//evil.com");

        OAuth2SuccessHandler handler = new OAuth2SuccessHandler(userService, "http://localhost:3000");

        // When
        handler.onAuthenticationSuccess(request, response, authentication);

        // Then
        verify(response).sendRedirect("http://localhost:3000/dashboard");
        verify(response, never()).sendRedirect("//evil.com");
    }

    // ── SEC-CRITICAL: open-redirect 하드닝 (백슬래시 / 인코딩 슬래시) ──────────

    @Test
    @DisplayName("SEC-CRITICAL open-redirect: callbackUrl=/\\evil.com(백슬래시) → /dashboard 폴백")
    void onAuthenticationSuccess_withBackslashCallbackUrl_redirectsToDashboard() throws Exception {
        // Given
        OAuth2User oauth2User = mock(OAuth2User.class);
        when(oauth2User.getAttribute("sub")).thenReturn("G001");
        when(oauth2User.getAttribute("email")).thenReturn("user@example.com");
        when(oauth2User.getAttribute("name")).thenReturn("홍길동");
        when(oauth2User.getAttribute("picture")).thenReturn("http://img/avatar");

        when(authentication.getPrincipal()).thenReturn(oauth2User);

        User savedUser = User.builder()
                .id(UUID.randomUUID())
                .googleId("G001")
                .email("user@example.com")
                .name("홍길동")
                .image("http://img/avatar")
                .build();
        when(userService.loginWithOAuth(any(OAuthUserInfo.class))).thenReturn(savedUser);
        lenient().when(request.getParameter("callbackUrl")).thenReturn("/\\evil.com");

        OAuth2SuccessHandler handler = new OAuth2SuccessHandler(userService, "http://localhost:3000");

        // When
        handler.onAuthenticationSuccess(request, response, authentication);

        // Then
        verify(response).sendRedirect("http://localhost:3000/dashboard");
        verify(response, never()).sendRedirect("http://localhost:3000/\\evil.com");
    }

    @Test
    @DisplayName("SEC-CRITICAL open-redirect: callbackUrl=/%2f%2fevil.com(인코딩 슬래시) → /dashboard 폴백")
    void onAuthenticationSuccess_withEncodedSlashCallbackUrl_redirectsToDashboard() throws Exception {
        // Given
        OAuth2User oauth2User = mock(OAuth2User.class);
        when(oauth2User.getAttribute("sub")).thenReturn("G001");
        when(oauth2User.getAttribute("email")).thenReturn("user@example.com");
        when(oauth2User.getAttribute("name")).thenReturn("홍길동");
        when(oauth2User.getAttribute("picture")).thenReturn("http://img/avatar");

        when(authentication.getPrincipal()).thenReturn(oauth2User);

        User savedUser = User.builder()
                .id(UUID.randomUUID())
                .googleId("G001")
                .email("user@example.com")
                .name("홍길동")
                .image("http://img/avatar")
                .build();
        when(userService.loginWithOAuth(any(OAuthUserInfo.class))).thenReturn(savedUser);
        lenient().when(request.getParameter("callbackUrl")).thenReturn("/%2f%2fevil.com");

        OAuth2SuccessHandler handler = new OAuth2SuccessHandler(userService, "http://localhost:3000");

        // When
        handler.onAuthenticationSuccess(request, response, authentication);

        // Then
        verify(response).sendRedirect("http://localhost:3000/dashboard");
        verify(response, never()).sendRedirect("http://localhost:3000/%2f%2fevil.com");
    }

    // ── onAuthenticationSuccess 실패 ─────────────────────────────────────────

    @Test
    @DisplayName("onAuthenticationSuccess 실패: loginWithOAuth 예외 발생 시 /login?error=true 리다이렉트")
    void onAuthenticationSuccess_whenLoginWithOAuthThrows_redirectsToLoginWithError() throws Exception {
        // Given
        OAuth2User oauth2User = mock(OAuth2User.class);
        when(oauth2User.getAttribute("sub")).thenReturn("G001");
        when(oauth2User.getAttribute("email")).thenReturn("user@example.com");
        when(oauth2User.getAttribute("name")).thenReturn("홍길동");
        when(oauth2User.getAttribute("picture")).thenReturn("http://img/avatar");

        when(authentication.getPrincipal()).thenReturn(oauth2User);
        when(userService.loginWithOAuth(any(OAuthUserInfo.class)))
                .thenThrow(new RuntimeException("DB 오류"));

        OAuth2SuccessHandler handler = new OAuth2SuccessHandler(userService, "http://localhost:3000");

        // When
        handler.onAuthenticationSuccess(request, response, authentication);

        // Then
        verify(response).sendRedirect("http://localhost:3000/login?error=true");
        verify(response, never()).sendRedirect("http://localhost:3000/dashboard");
    }
}
