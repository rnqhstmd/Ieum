# 설계: P8 후속② — 초대 만료 스케줄러 (INV-04)

## 설계 규모
**중형** — InvitationService 메서드 1 + Repository bulk 쿼리 1 + 신규 스케줄러 컴포넌트 + @EnableScheduling + cron 설정. 기존 lazy 만료와 공존.

## 확정 결정 (사용자 승인 + 비평 반영)
1. **now 제어**: `expirePendingInvitations(Instant now)` **메서드 파라미터**. 스케줄러가 `Instant.now()`를 전달. Clock 미주입 → InvitationService 생성자·기존 22개 단위 테스트 **무변경**. 테스트는 고정 now를 직접 전달해 AC-2 경계값 결정론 확보. (design-critic CONSIDER 반영 — architect의 Clock 주입안보다 변경 표면 최소)
2. **구현**: bulk `@Modifying UPDATE`. `clearAutomatically=true, flushAutomatically=true` 부여(test-architect/design-critic MUST-ADDRESS — 영속성 컨텍스트 stale 방지).
3. **@EnableScheduling**: 별도 `com.ieum.config.SchedulingConfig @Configuration @EnableScheduling` (기존 config 분리 패턴 일관).
4. **enum**: JPQL FQN 리터럴(`com.ieum.invitation.InvitationStatus.EXPIRED/PENDING`)로 시그니처를 `now`만 유지(상태는 고정 상수라 caller 미전달).
5. **테스트 격리**: `application-test.yml`에 `app.invitation.expiry-cron: "-"`(Spring `@Scheduled` 비활성) → 통합 테스트 컨텍스트에서 스케줄러 자동 발화 차단(test-architect MUST).

## 동시성 분석 (design-critic MUST-ADDRESS 1 해소)
스케줄러 bulk UPDATE는 `status=PENDING AND expiresAt<now`만 대상. accept의 lazy 가드도 동일 조건(`PENDING && expiresAt.isBefore(now)`)을 EXPIRED+410으로 거부 → **만료된 초대는 ACCEPTED로 갈 수 없음**. 따라서 두 경로 모두 만료-PENDING을 EXPIRED로 **수렴**(멱등, lost-update 없음). 유효 PENDING(expiresAt>now)은 스케줄러 비대상 → 정상 수락 무영향. **실질 충돌 없음**. (영속성: 스케줄러 트랜잭션은 bulk UPDATE 외 Invitation 조회 없음 + clearAutomatically로 stale 방지 — MUST-ADDRESS 2 해소)

## 변경 범위

### 수정 파일 (4)
| 파일 | 역할 |
|------|------|
| `InvitationRepository.java` | `expirePendingBefore(Instant now)` bulk @Modifying UPDATE 추가 |
| `InvitationService.java` | `expirePendingInvitations(Instant now)` @Transactional 추가 (clock/생성자 무변경) |
| `IeumBackendApplication.java` | 변경 없음 (스케줄링은 SchedulingConfig가 담당) |
| `application.yml` | `app.invitation.expiry-cron` 키 추가 |

### 신규 파일 (5)
| 파일 | 역할 |
|------|------|
| `config/SchedulingConfig.java` | `@Configuration @EnableScheduling` |
| `invitation/InvitationExpiryScheduler.java` | `@Component @Scheduled` 얇은 래퍼 + INFO 로그 |
| `resources/application-test.yml`(수정/추가) | `app.invitation.expiry-cron: "-"` 비활성 |
| `test/.../InvitationExpiryIntegrationTest.java` | 통합(testcontainers) AC-1,2,4,5 |
| `test/.../InvitationExpirySchedulerTest.java` | 스케줄러 위임+로그 단위 AC-6 |

### 수정 테스트 (1)
| 파일 | 역할 |
|------|------|
| `InvitationServiceTest.java` | expirePendingInvitations 단위 패스스루(now→repo 전달, 반환값) |

## 상세 설계

### 1. InvitationRepository.expirePendingBefore
```java
@Modifying(clearAutomatically = true, flushAutomatically = true)
@Query("UPDATE Invitation i SET i.status = com.ieum.invitation.InvitationStatus.EXPIRED " +
       "WHERE i.status = com.ieum.invitation.InvitationStatus.PENDING AND i.expiresAt < :now")
int expirePendingBefore(@Param("now") Instant now);
```
- BR-1(PENDING만)=WHERE, BR-2(strictly `<`)=`<` 연산자. 반환=영향 행수(전이 건수). 프로젝트 첫 @Modifying 도입.

### 2. InvitationService.expirePendingInvitations
```java
@Transactional
public int expirePendingInvitations(Instant now) {
    return invitationRepository.expirePendingBefore(now);
}
```
- 클래스 기본 `@Transactional(readOnly=true)` → 이 메서드는 `@Transactional`(쓰기) 오버라이드. 생성자/Clock 무변경.

### 3. InvitationExpiryScheduler (신규)
```java
@Slf4j @Component @RequiredArgsConstructor
public class InvitationExpiryScheduler {
    private final InvitationService invitationService;

    @Scheduled(cron = "${app.invitation.expiry-cron:0 0 2 * * *}")
    public void expireInvitations() {
        log.info("초대 만료 스케줄러 실행 시작");
        int expired = invitationService.expirePendingInvitations(Instant.now());
        log.info("초대 만료 스케줄러 완료 — 전이 건수={}", expired);
    }
}
```
- 비즈니스 로직 0(얇은 위임). cron 외부화(기본 새벽 2시).

### 4. SchedulingConfig (신규)
```java
@Configuration
@EnableScheduling
public class SchedulingConfig { }
```

### 5. cron 설정
- `application.yml`: `app.invitation.expiry-cron: ${INVITATION_EXPIRY_CRON:0 0 2 * * *}`
- `application-test.yml`: `app.invitation.expiry-cron: "-"` (테스트 중 발화 차단)

## 구현 순서 (RGR)
```
T1 만료 비즈니스 — Repository bulk + Service 메서드
  R: InvitationServiceTest 단위 패스스루 + InvitationExpiryIntegrationTest(AC-1,2,4,5) → 메서드/쿼리 미존재로 RED
  G: expirePendingBefore + expirePendingInvitations(Instant) 구현
T2 스케줄러 배선 — SchedulingConfig + Scheduler + cron 설정
  R: InvitationExpirySchedulerTest(AC-6 위임+로그) → 스케줄러 미존재로 RED
  G: SchedulingConfig + InvitationExpiryScheduler + application.yml/application-test.yml cron
  — T1 완료 후. application-test.yml cron "-"는 T1 통합 테스트 전에 추가 권장(발화 차단)
```

## 테스트 전략 개요
- **단위(InvitationServiceTest)**: @Mock Repository. expirePendingInvitations(fixedNow)가 repo.expirePendingBefore(fixedNow) 호출(ArgumentCaptor 동일성) + 반환 패스스루. 필터/경계는 mock이라 검증 불가 → 통합 위임.
- **통합(InvitationExpiryIntegrationTest, testcontainers)**: 고정 `Instant fixed`를 시드 expiresAt와 호출 인자에 공유. AC-1(만료2+미래1+ACCEPTED/REVOKED/EXPIRED→2전이·나머지 불변), AC-2(expiresAt==fixed 경계→PENDING 유지·0), AC-4(만료3→첫3 둘째0·DB 전부 EXPIRED), AC-5(비PENDING만→0·불변). bulk UPDATE 영속성 우회 대비 검증부 재조회는 `clearAutomatically`로 stale 방지(또는 새 트랜잭션 재조회).
- **스케줄러 단위(InvitationExpirySchedulerTest, AC-6)**: @Mock InvitationService → expireInvitations() 호출 → verify(invitationService).expirePendingInvitations(any()) 1회 + `OutputCaptureExtension`으로 시작·완료 INFO 로그 검증. @Scheduled cron 발화 자체는 검증 안 함(타이밍 비의존).

---

## Testability 평가 (test-architect)

### Testability Score: 9/10 — ✅ PASS
DI 생성자 주입 일관, 단위/통합 경계 명확(필터=통합, 패스스루/위임=단위), 표준 도구(OutputCaptureExtension) 존재.

1점 감점(조건부, 확정 시 해소): ①bulk @Modifying 1차 캐시 stale → `clearAutomatically=true, flushAutomatically=true`(반영함) ②@EnableScheduling 컨텍스트 오염 → `application-test.yml` cron `"-"`(반영함).

### 테스트 작성 지침 (Green 단계 준수)
1. **AC-2 경계**: 통합에서 `Instant fixed`를 시드 expiresAt(==경계)와 호출 인자에 동일 공유 → `<`로 경계 비대상 결정론 검증. mock 단위로 필터 검증 금지(동어반복).
2. **bulk 검증부 stale**: 통합 검증 시 `clearAutomatically=true`로 1차 캐시 무효화 보장(또는 별도 트랜잭션/`em.clear()` 후 findById 재조회).
3. **AC-6 로그**: `@ExtendWith(OutputCaptureExtension.class)` + `CapturedOutput`으로 시작·완료 INFO 로그 검증. cron 발화 직접 트리거 금지.
4. **테스트 격리**: `application-test.yml` `app.invitation.expiry-cron: "-"` 필수(스케줄러 자동 발화 차단).

### 격리 전략 (red-writer 참조)
- 단위: Repository/InvitationService를 @Mock. 패스스루/위임만 검증.
- 통합: AbstractIntegrationTest 상속, FK 역순 deleteAll, 고정 Instant 공유. expirePendingInvitations(fixed) 직접 호출.
