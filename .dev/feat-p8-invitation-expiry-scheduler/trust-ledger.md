## Trust Ledger — P8 후속② 초대 만료 스케줄러

### 통합 감사 (review, security-auditor)
집계: CRITICAL 0, HIGH 2, MEDIUM 3 + quality Minor 2.

#### CRITICAL — 0건

#### HIGH (실제 개선 여지 — 수정 권장)
- **[ASSUMPTION/HIGH] cron 이중 기본값** — `application.yml`(`${INVITATION_EXPIRY_CRON:0 0 2 * * *}`)과 `@Scheduled(cron="${app.invitation.expiry-cron:0 0 2 * * *}")` 양쪽에 기본값 중복. 현재 동일해 무해하나 단일 소스 원칙 위배.
  - 처리: **수정** — `@Scheduled(cron="${app.invitation.expiry-cron}")`로 fallback 제거(application.yml 단일 소스).
- **[GAP/HIGH] 스케줄러 실패 silent** — `expireInvitations()`에 예외 처리 없음. DB 장애 시 @Scheduled 기본 핸들러가 예외 삼킴 → 조용한 실패.
  - 처리: **수정** — try-catch + `log.error` 추가, 운영 탐지 가능화. SCHED-3 테스트 동반.

#### MEDIUM
- **[ASSUMPTION/MEDIUM] 분산 환경 중복 실행** — 멱등(둘째 UPDATE 0 반환)이라 데이터 무해. PRD 명시 제외(단일 인스턴스 전제). → 코드 주석으로 인수인계 명문화(후속, 선택).
- **[GAP/MEDIUM] AC-6 cron 발화 미검증** — SchedulerTest는 expireInvitations() 직접 호출(위임+로그)만 검증, @Scheduled 트리거 자체 미검증. → **설계 의도**(QE-1 타이밍 비의존, cron 발화 직접 트리거 금지). 컨텍스트 로드로 빈 등록은 전체 통합 테스트가 자연 검증. 조치 불요(설계 확정 사항).
- **[ASSUMPTION/MEDIUM] @Transactional 오버라이드 proxy 의존** — 외부 호출(스케줄러→서비스)이라 AOP 정상 개입. @Transactional 정확 부여 확인. 조치 불요(기록).

#### Minor (quality-reviewer)
- 스케줄러 Instant.now() 직접 호출(서비스는 파라미터) — 설계 의도(진입점 실시간). 후속 Clock 통일 가능. 후속.
- expirePendingInvitations Javadoc @param/@return 부재 — 기존 스타일 동일 수준. 조치 불요.

### 교차 검증 정합 (security-auditor)
FR-1~4 / BR-1~4 코드 일치 ✓ / JPQL 인젝션 안전(:now 바인딩, 외부 입력 없음) ✓ / 민감정보(이메일·토큰) 로그 미노출 ✓ / @EnableScheduling 기존 @Scheduled 없음(InvitationExpiryScheduler 1개만) ✓ / application-test cron "-" 운영 분리 ✓.

### 처리 결과
- **HIGH-1 (cron 이중 기본값)**: `@Scheduled(cron="${app.invitation.expiry-cron}")` fallback 제거 → application.yml 단일 소스. 전체 컨텍스트 기동 검증. **해소**.
- **HIGH-2 (스케줄러 실패 silent)**: try-catch + `log.error("초대 만료 스케줄러 실패", e)` 추가, SCHED-3 테스트(예외 미전파+error로그) RGR. **해소**.
- MEDIUM/Minor: 후속/조치 불요.
