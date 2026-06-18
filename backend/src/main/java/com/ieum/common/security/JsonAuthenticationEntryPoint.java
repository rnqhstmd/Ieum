package com.ieum.common.security;

import com.ieum.common.ErrorResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;

@Component
public class JsonAuthenticationEntryPoint implements AuthenticationEntryPoint {

    private final ObjectMapper objectMapper;
    private final String frontendUrl;

    public JsonAuthenticationEntryPoint(ObjectMapper objectMapper,
                                        @Value("${app.frontend-url}") String frontendUrl) {
        this.objectMapper = objectMapper;
        this.frontendUrl = frontendUrl;
    }

    @Override
    public void commence(HttpServletRequest req, HttpServletResponse res,
                         AuthenticationException ex) throws IOException {
        if (req.getRequestURI().startsWith("/api/")) {
            res.setStatus(401);
            res.setContentType("application/json;charset=UTF-8");
            objectMapper.writeValue(res.getWriter(), new ErrorResponse("UNAUTHORIZED", "인증이 필요합니다."));
        } else {
            res.sendRedirect(frontendUrl + "/login");
        }
    }
}
