package com.ieum.config;

import com.ieum.user.OAuthUserInfo;
import com.ieum.user.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;

@Component
public class OAuth2SuccessHandler implements AuthenticationSuccessHandler {

    private static final Logger log = LoggerFactory.getLogger(OAuth2SuccessHandler.class);

    private final UserService userService;
    private final String frontendUrl;

    public OAuth2SuccessHandler(UserService userService,
                                @Value("${app.frontend-url}") String frontendUrl) {
        this.userService = userService;
        this.frontendUrl = frontendUrl;
    }

    @Override
    public void onAuthenticationSuccess(HttpServletRequest req, HttpServletResponse res,
                                        Authentication auth) throws IOException {
        try {
            userService.loginWithOAuth(extract((OAuth2User) auth.getPrincipal()));
            res.sendRedirect(resolveRedirect(req));
        } catch (Exception e) {
            log.warn("OAuth 로그인 후처리 실패", e);
            res.sendRedirect(frontendUrl + "/login?error=true");
        }
    }

    /**
     * callbackUrl 검증 — 동일 오리진 상대경로만 허용(open-redirect 방지).
     * frontendUrl(절대 URL)을 prefix하므로 목적지 호스트는 항상 고정되지만,
     * 방어심층화로 경로 문자를 엄격 화이트리스트(영숫자·/·_·-)로 제한하여
     * 백슬래시·퍼센트인코딩(%2f/%5c)·탭(%09)·유니코드 슬래시(∕) 등 모든 우회 벡터를 차단한다.
     */
    private static final java.util.regex.Pattern SAFE_PATH = java.util.regex.Pattern.compile("/[A-Za-z0-9/_-]*");

    String resolveRedirect(HttpServletRequest req) {
        String cb = req.getParameter("callbackUrl");
        if (cb != null && !cb.startsWith("//") && SAFE_PATH.matcher(cb).matches()) {
            return frontendUrl + cb;
        }
        return frontendUrl + "/dashboard";
    }

    public static OAuthUserInfo extract(OAuth2User p) {
        return new OAuthUserInfo(
                p.getAttribute("sub"),
                p.getAttribute("email"),
                p.getAttribute("name"),
                p.getAttribute("picture")
        );
    }
}
