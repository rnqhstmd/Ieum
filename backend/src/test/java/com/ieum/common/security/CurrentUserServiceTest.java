package com.ieum.common.security;

import com.ieum.user.User;
import com.ieum.user.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.core.user.OAuth2User;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CurrentUserServiceTest {

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private CurrentUserService currentUserService;

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    // ── requireCurrentUserId: 식별 성공 ──────────────────────────────────

    @Test
    @DisplayName("식별 성공: SecurityContext에 OAuth2User(sub=G1)가 있고 User가 존재하면 UUID를 반환한다")
    void requireCurrentUserId_validPrincipalAndUserExists_returnsUserId() {
        // Given
        UUID expectedId = UUID.randomUUID();

        OAuth2User principal = mock(OAuth2User.class);
        when(principal.getAttribute("sub")).thenReturn("G1");

        Authentication auth = mock(Authentication.class);
        when(auth.getPrincipal()).thenReturn(principal);

        SecurityContextHolder.getContext().setAuthentication(auth);

        User user = mock(User.class);
        when(user.getId()).thenReturn(expectedId);
        when(userRepository.findByGoogleId("G1")).thenReturn(Optional.of(user));

        // When
        UUID result = currentUserService.requireCurrentUserId();

        // Then
        assertThat(result).isEqualTo(expectedId);
    }

    // ── requireCurrentUserId: User 미존재 → 401 신호 ─────────────────────

    @Test
    @DisplayName("User 미존재 → 401: principal sub=G1이지만 findByGoogleId 결과가 empty이면 AuthenticationCredentialsNotFoundException을 던진다")
    void requireCurrentUserId_userNotFound_throwsAuthenticationCredentialsNotFoundException() {
        // Given
        OAuth2User principal = mock(OAuth2User.class);
        when(principal.getAttribute("sub")).thenReturn("G1");

        Authentication auth = mock(Authentication.class);
        when(auth.getPrincipal()).thenReturn(principal);

        SecurityContextHolder.getContext().setAuthentication(auth);

        when(userRepository.findByGoogleId("G1")).thenReturn(Optional.empty());

        // When / Then
        assertThatThrownBy(() -> currentUserService.requireCurrentUserId())
                .isInstanceOf(AuthenticationCredentialsNotFoundException.class);
    }

    // ── extractGoogleId: 정상 ─────────────────────────────────────────────

    @Test
    @DisplayName("extractGoogleId 정상: OAuth2User principal(sub=G1) → \"G1\" 반환")
    void extractGoogleId_validOAuth2User_returnsGoogleId() {
        // Given
        OAuth2User principal = mock(OAuth2User.class);
        when(principal.getAttribute("sub")).thenReturn("G1");

        Authentication auth = mock(Authentication.class);
        when(auth.getPrincipal()).thenReturn(principal);

        // When
        String result = CurrentUserService.extractGoogleId(auth);

        // Then
        assertThat(result).isEqualTo("G1");
    }

    // ── extractGoogleId: 미인증(Authentication=null) ──────────────────────

    @Test
    @DisplayName("extractGoogleId 미인증: Authentication=null이면 AuthenticationCredentialsNotFoundException을 던진다")
    void extractGoogleId_nullAuthentication_throwsAuthenticationCredentialsNotFoundException() {
        // When / Then
        assertThatThrownBy(() -> CurrentUserService.extractGoogleId(null))
                .isInstanceOf(AuthenticationCredentialsNotFoundException.class);
    }

    // ── extractGoogleId: 비-OAuth2User principal ──────────────────────────

    @Test
    @DisplayName("extractGoogleId 비-OAuth2User: principal이 String이면 AuthenticationCredentialsNotFoundException을 던진다")
    void extractGoogleId_nonOAuth2UserPrincipal_throwsAuthenticationCredentialsNotFoundException() {
        // Given
        Authentication auth = mock(Authentication.class);
        when(auth.getPrincipal()).thenReturn("not-an-oauth2-user");

        // When / Then
        assertThatThrownBy(() -> CurrentUserService.extractGoogleId(auth))
                .isInstanceOf(AuthenticationCredentialsNotFoundException.class);
    }
}
