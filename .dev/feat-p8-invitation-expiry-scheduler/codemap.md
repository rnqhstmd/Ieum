## 코드 맵: P8 후속② 초대 만료 스케줄러 (INV-04)

### 핵심 파일 (수정/신규 대상)
- backend/src/main/java/com/ieum/IeumBackendApplication.java → `@SpringBootApplication`만. `@EnableScheduling` 추가 필요(또는 별도 @Configuration)
- backend/src/main/java/com/ieum/invitation/InvitationService.java → 만료 일괄 처리 메서드(`expirePendingInvitations()`) 추가 대상. 기존 acceptInvitation에 lazy 만료(PENDING+만료→EXPIRED) 이미 존재
- backend/src/main/java/com/ieum/invitation/InvitationRepository.java → 만료 대상 조회/일괄 갱신 쿼리 추가(findByStatusAndExpiresAtBefore 또는 @Modifying bulk update)
- (신규 가능) InvitationExpiryScheduler 컴포넌트 → @Scheduled 트리거(얇게), 비즈니스 로직은 서비스에 위임(테스트 격리)

### 참조 파일
- backend/src/main/java/com/ieum/invitation/Invitation.java → status, expiresAt(Instant), @CreationTimestamp createdAt
- backend/src/main/java/com/ieum/invitation/InvitationStatus.java → PENDING/ACCEPTED/REVOKED/EXPIRED
- backend/src/test/java/com/ieum/invitation/InvitationServiceTest.java → 단위 스타일(@InjectMocks, ArgumentCaptor)
- backend/src/test/java/com/ieum/invitation/InvitationAcceptIntegrationTest.java → 통합 스타일(testcontainers). acceptInvitation의 lazy 만료(EXPIRED 전이) 레퍼런스

### 설정
- backend/build.gradle.kts → java-spring (spring-boot, @Scheduled은 spring-context 기본 포함)
- .claude/config.json → vcs=git / projectTypes
