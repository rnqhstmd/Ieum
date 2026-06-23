# PR Context — WS-AUTH-01

## Background
이음의 실시간 협업은 멤버십 인가(WS-AUTH-02)·op userId 태깅(WS-AUTH-03)·멤버 강제종료(WS-AUTH-04)까지 구축됐으나, **relay가 join 메시지의 `userId`를 클라이언트가 보낸 그대로 신뢰**(trust-relay, PR #15)하는 한계가 있었다. WS-AUTH-02는 멤버십만 검증하고 userId 진위는 확인하지 않아, **같은 워크스페이스 다른 멤버 userId를 사칭**하면 그 사람 이름으로 op가 영속화된다(`crdt_ops.created_by_id` 오염, 감사추적 위조, WS-AUTH-04 오조준). 이 PR은 그 앞단 — userId 진위 확인 — 을 막는다(WS-AUTH-01, 마지막 WS 보안 갭).

## Requirements (요약)
- **[Must]** relay가 클라 주장 userId를 신뢰하지 않고 **backend HMAC 서명 토큰**으로 신원 확정, 사칭 차단. 토큰 부재·위조·만료 시 close(4001).
- **[Must]** backend가 `GET /api/users/me`로 서명 토큰 발급, web이 join에 동반.
- **[Must]** AUTH_SECRET 미설정 시 기존 trust-relay 유지(walking skeleton 호환).
- **[Should]** 재연결 시 토큰 재획득, 토큰 획득 실패 시 재로그인 유도.

## 범위 결정
- 메커니즘 = **HMAC-SHA256 서명 토큰**(공유 `AUTH_SECRET`, JDK `Mac`/Node `crypto` 내장 — 무라이브러리). 후보 B(세션 검증 호출)는 HttpOnly·역방향 경로 제약으로 제외.
- 토큰 전송 = join `token` 필드. 발급 = `/api/users/me` 확장. TTL = 5분. clock skew leeway 없음.
- **packages/crdt 무변경**.

## Audit Summary
- 총 12건 (CRITICAL 0 · HIGH 5 · MEDIUM 5). 핵심 6건 수정(G1 userConnections 공통화=WS-AUTH-04 정합 · R1 HMAC 원시바이트 timingSafeEqual · R5 exp 정수검증 · R3 JoinMsg 타입 · P10 인증실패 로깅 · R2 .env.example AUTH_SECRET).
- 수용·문서화: 비대칭 배포 방어(설계 결정: 배포순서·동시주입 가이드) · wss 미강제(인프라) · fetchCurrentUser 401/500 미구분(범위 확대) 등.
- 상세: `.dev/feat-ws-auth-identity/trust-ledger.md`.

## 검증
- verify 게이트 PASS(신선): node test(crdt+ws-relay 95+web 152) + node build(web next build) + backend `./gradlew test --rerun-tasks`(testcontainers, 0 fail).
- Spec PASS([Must] 8/8·[Should] 2/2) · Quality PASS(Critical/Important 0) · 인수 ACCEPT.
- 골든벡터(구현 독립 산출) backend·relay 양측 박제 → Java↔Node 토큰 바이트 정합.

## 운영 가이드 (배포)
**backend·ws-relay에 동일 `AUTH_SECRET`을 동시 주입**해야 한다. 한쪽만 설정 시(예: relay만 on + backend token=null) 전면 close(4001) 장애가 발생한다. 미설정 시 양측 모두 trust-relay로 동작(기존 호환).
