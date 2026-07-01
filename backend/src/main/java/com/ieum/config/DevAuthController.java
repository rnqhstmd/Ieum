package com.ieum.config;

import com.ieum.user.OAuthUserInfo;
import com.ieum.user.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * ⚠️ 개발 전용 로그인 우회 — {@code dev} 프로파일에서만 빈으로 등록된다(@Profile("dev")).
 *
 * <p>실제 Google OAuth credential 없이 로컬에서 전 기능을 수동 테스트하기 위한 엔드포인트다.
 * 실제 OAuth2 로그인 성공 경로({@link OAuth2SuccessHandler})와 동일하게
 * {@link UserService#loginWithOAuth}(User upsert + 개인 워크스페이스 보장)를 호출한 뒤,
 * {@link OAuth2User}(attribute {@code sub}=googleId) principal을 담은 인증을 HTTP 세션에 저장한다.
 * 이렇게 하면 {@code CurrentUserService.requireCurrentUserId()}가 실제 로그인과 동일하게 동작한다.
 *
 * <p>프로덕션(기본/prod 프로파일)에서는 이 빈이 생성되지 않아 경로가 404이며,
 * {@code SecurityConfig}도 dev 프로파일일 때만 {@code /api/dev/**}를 permitAll 한다.
 */
@Profile("dev")
@RestController
public class DevAuthController {

    private final UserService userService;
    private final String frontendUrl;

    public DevAuthController(UserService userService,
                             @Value("${app.frontend-url}") String frontendUrl) {
        this.userService = userService;
        this.frontendUrl = frontendUrl;
    }

    @GetMapping("/api/dev/login")
    public void devLogin(@RequestParam(defaultValue = "alice@dev.local") String email,
                         HttpServletRequest req, HttpServletResponse res) throws IOException {
        String googleId = "dev-" + email;
        String name = email.contains("@") ? email.substring(0, email.indexOf('@')) : email;

        // 실제 OAuth 성공 핸들러와 동일: upsert + 개인 워크스페이스 보장
        userService.loginWithOAuth(new OAuthUserInfo(googleId, email, name, ""));

        OAuth2User principal = new DefaultOAuth2User(
                List.of(new SimpleGrantedAuthority("ROLE_USER")),
                Map.of("sub", googleId, "email", email, "name", name, "picture", ""),
                "sub");
        OAuth2AuthenticationToken auth =
                new OAuth2AuthenticationToken(principal, principal.getAuthorities(), "google");

        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(auth);
        // SecurityContextHolderFilter가 다음 요청에서 세션의 이 컨텍스트를 복원한다.
        req.getSession(true).setAttribute(
                HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY, context);

        res.sendRedirect(frontendUrl + "/dashboard");
    }
}
