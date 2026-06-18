package com.ieum.common.security;

import com.ieum.user.User;
import com.ieum.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class CurrentUserService {

    private final UserRepository userRepository;

    public UUID requireCurrentUserId() {
        String googleId = extractGoogleId(SecurityContextHolder.getContext().getAuthentication());
        return userRepository.findByGoogleId(googleId)
                .map(User::getId)
                .orElseThrow(() -> new AuthenticationCredentialsNotFoundException("인증된 사용자를 찾을 수 없습니다."));
    }

    public static String extractGoogleId(Authentication auth) {
        if (auth == null || !(auth.getPrincipal() instanceof OAuth2User principal)) {
            throw new AuthenticationCredentialsNotFoundException("인증이 필요합니다.");
        }
        return principal.getAttribute("sub");
    }
}
