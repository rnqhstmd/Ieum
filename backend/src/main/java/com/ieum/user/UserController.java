package com.ieum.user;

import com.ieum.common.security.CurrentUserService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * 현재 인증 사용자 조회. 웹 realtime가 WS join 시 trust-relay할 실 userId를 노출한다
 * (WS-AUTH-02 멤버십 인가의 전제). 미인증은 SecurityConfig가 /api/** → 401로 처리한다.
 */
@RestController
public class UserController {

    private final CurrentUserService currentUserService;
    private final UserRepository userRepository;

    public UserController(CurrentUserService currentUserService, UserRepository userRepository) {
        this.currentUserService = currentUserService;
        this.userRepository = userRepository;
    }

    @GetMapping("/api/users/me")
    public MeResponse me() {
        UUID userId = currentUserService.requireCurrentUserId();
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalStateException("인증 사용자 레코드 없음: " + userId));
        return new MeResponse(user.getId(), user.getEmail(), user.getName());
    }

    public record MeResponse(UUID id, String email, String name) {}
}
