## 코드 맵: P1 인증·권한 기반 (Spring Boot 실제 스택)

> ⚠️ 아키텍처 불일치: requirements 04/08 문서는 Auth.js+Next.js+Prisma로 기술되어 있으나,
> 실제 scaffold는 **Spring Boot + Spring Security OAuth2 + JPA/Hibernate + Flyway + Java WebSocket**.
> P1 구현은 **실제 코드 스택(Spring Boot)** 기준으로 진행한다. 문서의 Auth.js 코드는 "달성할 AC"의
> 개념적 참조로만 사용한다.

### 핵심 파일
- backend/src/main/java/com/ieum/config/SecurityConfig.java → Spring Security OAuth2 설정. `oauth2SuccessHandler()`에 **TODO(Phase 0/1)**: User upsert + 개인 워크스페이스 자동생성 (P1 핵심 구현 지점). 현재 `/dashboard` 리다이렉트 스텁만 존재.
- backend/src/main/java/com/ieum/user/User.java → User 엔티티 (email, googleId 등)
- backend/src/main/java/com/ieum/user/UserRepository.java → User JPA 리포지토리 (upsert 기반)
- backend/src/main/java/com/ieum/workspace/WorkspaceService.java → 워크스페이스 서비스 (개인 WS 생성 `createPersonalWorkspace` 위치 추정)
- backend/src/main/java/com/ieum/workspace/MembershipRepository.java → 멤버십 조회 (권한 검사 기반: userId+workspaceId)

### 참조 파일
- backend/src/main/java/com/ieum/workspace/Membership.java → 멤버십 엔티티 (role: OWNER/MEMBER)
- backend/src/main/java/com/ieum/workspace/MemberRole.java → OWNER/MEMBER enum
- backend/src/main/java/com/ieum/workspace/Workspace.java / WorkspaceType.java → 워크스페이스 + PERSONAL/SHARED
- backend/src/main/java/com/ieum/common/ApiExceptionHandler.java → 예외 → HTTP 상태(401/403/404) 매핑
- backend/src/main/java/com/ieum/config/CorsConfig.java → CORS (frontend-url 허용)
- apps/web/src/lib/api.ts → 프론트 fetch 래퍼 (`credentials:'include'`로 Spring 세션 쿠키 첨부, BASE_URL :8080)
- apps/web/app/(auth)/login/page.tsx → 로그인 페이지 UI

### 설정
- backend/src/main/resources/application.yml → OAuth2 google client(profile,email), DB(Postgres/Flyway/JPA validate), app.frontend-url
- backend/src/main/resources/db/migration/V1__init.sql → 초기 스키마 (User/Workspace/Membership/...)
- backend/build.gradle.kts → Spring Boot 4.1.0 의존성 / 테스트 = `(cd backend && ./gradlew test)`. T0에서 Testcontainers + 표준 spring-boot-starter-test 추가.

### T0 발견/규약 (이후 태스크 필수 인지)
- **Jackson 3.x**: Spring Boot 4.1.0 → `ObjectMapper`/`JsonNode`는 `tools.jackson.databind.*` import (NOT com.fasterxml). 단 `@JsonIgnoreProperties` 등 어노테이션은 `com.fasterxml.jackson.annotation` 유지.
- 통합 테스트 베이스: `backend/src/test/java/com/ieum/support/AbstractIntegrationTest.java` (@SpringBootTest + @ActiveProfiles("test") + @Testcontainers + @ServiceConnection PostgreSQLContainer postgres:16-alpine). 통합 테스트는 이걸 extends.
- 테스트 프로파일: `backend/src/test/resources/application-test.yml` (더미 google client-id/secret, flyway enabled, ddl-auto validate).
- V2 마이그레이션: `backend/src/main/resources/db/migration/V2__personal_workspace_unique.sql` (PERSONAL partial UNIQUE).
- **Testcontainers 싱글톤(중요)**: AbstractIntegrationTest는 `@Testcontainers`/`@Container`/`@ServiceConnection`을 쓰지 않고 static 초기화로 컨테이너 1회 start + `@DynamicPropertySource`로 datasource 주입. 이유: 여러 통합 테스트 클래스가 Spring 컨텍스트 캐시를 공유할 때 `@Testcontainers`가 클래스 afterAll마다 컨테이너를 stop → 캐시된 컨텍스트가 죽은 포트를 가리켜 "Connection refused". (전체 회귀에서만 노출된 격리 버그, 수정됨.)
