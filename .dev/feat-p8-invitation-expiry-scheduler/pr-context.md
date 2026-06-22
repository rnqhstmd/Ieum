# PR 비즈니스 맥락 — P8 후속② 초대 만료 스케줄러 (INV-04)

## 배경
초대 만료는 지금까지 수락(acceptInvitation) 시점의 lazy 검사로만 처리됐다(PENDING+만료→EXPIRED+410). 수락 시도 없이 방치된 초대는 DB에 PENDING으로 잔류하여, 초대 목록 조회 시 실제로는 만료된 초대가 PENDING으로 오표시되는 정합성 문제가 있었다. 이 슬라이스는 일 1회 스케줄러로 방치된 만료 초대를 EXPIRED로 일괄 전이해 lazy 만료를 보완한다.

> 스택 PR: 베이스는 `feat/p8-invitation-revoke`(PR #21). PR #21·#20 머지 후 main으로 자연 정렬.

## 요구사항
- PENDING이면서 expiresAt이 경과한 초대를 매일 새벽 2시(cron, 환경별 조정 가능) 일괄 EXPIRED로 전이한다.
- lazy 만료와 멱등하게 공존하며, 경계값(expiresAt==now)은 비대상(strictly <)이다.

## 핵심 설계 판단
- **테스트 결정론**: `expirePendingInvitations(Instant now)`를 메서드 파라미터로 받아(Clock 미주입) 기존 22개 단위 테스트·생성자를 건드리지 않고 AC-2 경계값을 고정 시각으로 검증.
- **bulk @Modifying UPDATE**: 단일 SQL로 멱등·건수·성능 자연 보장. `clearAutomatically/flushAutomatically=true`로 영속성 컨텍스트 stale 방지.
- **얇은 스케줄러**: `InvitationExpiryScheduler`는 위임+로그만. 비즈니스 로직은 서비스에. cron 외부화.
- **테스트 격리**: `application-test.yml` cron `"-"`로 통합 컨텍스트에서 스케줄러 자동 발화 차단.
- **동시성**: 스케줄러는 만료-PENDING만 대상이고 accept의 lazy 가드도 동일 조건을 410으로 거부 → 둘 다 EXPIRED 수렴(lost-update 없음). 유효 PENDING 무영향.

## Audit Summary
- 총 5건 (CRITICAL: 0, HIGH: 2, MEDIUM: 3) + quality Minor 2
- [HIGH 해소] cron 이중 기본값 → `@Scheduled(cron="${app.invitation.expiry-cron}")` fallback 제거, application.yml 단일 소스화
- [HIGH 해소] 스케줄러 실패 silent → try-catch + `log.error("초대 만료 스케줄러 실패")` 추가(SCHED-3 검증)
- [MEDIUM] 분산 환경 중복 실행 — PRD 제외(단일 인스턴스, 멱등 무해) / AC-6 cron 발화 미검증 — 설계 의도(타이밍 비의존) / @Transactional proxy — 정상
- 정합 확인: FR-1~4·BR-1~4 코드 일치, JPQL :now 바인딩 안전, 민감정보 로그 미노출

## 검증
- `./gradlew clean test build` BUILD SUCCESSFUL (0 failures)
- 단위 EXP-U1~2·SCHED-1~3 + 통합 AC-1~5(testcontainers)
- product-owner 인수 ACCEPT — Must 6/6
