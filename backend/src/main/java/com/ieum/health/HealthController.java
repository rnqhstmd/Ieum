package com.ieum.health;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api")
public class HealthController {

    /**
     * 서비스 헬스 체크 엔드포인트.
     * SecurityConfig에서 permitAll 처리되어 인증 없이 접근 가능.
     *
     * @return 200 OK { "ok": true }
     */
    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health() {
        return ResponseEntity.ok(Map.of("ok", true));
    }
}
