# 설계서: P1 인증·권한 기반 (Auth Foundation)

> 스택: Spring Boot 4.1.0 + Spring Security OAuth2 + JPA/Hibernate + Flyway, Java 21.
> 세션: Spring Security HTTP Session 쿠키(JSESSIONID, 서버측 세션). 프론트(Next.js :3000)는 `credentials:'include'`로 :8080 호출.
> design-critic MUST-ADDRESS 5건 + 사용자 결정 4건 반영 확정본. test-architect testability 8/10 PASS.

## 설계 개요

walking skeleton: **OAuth 로그인 → User upsert(+개인WS) → 현재 사용자 식별 → 권한 검사(멤버/OWNER) → 401/403 인가**. 서블릿/시큐리티 결합 코드는 얇은 배선만 남기고 모든 비즈니스 로직을 순수 서비스·순수함수로 추출(testability Iron Law).

## 확정된 핵심 결정 (사용자 + 엔지니어링)

| 항목 | 결정 | 근거 |
|------|------|------|
| 권한 헬퍼 배치 | **`common.security.AccessGuard` 별도 컴포넌트** | AC-PERM-02/05가 P1에서 requirePageAccess 요구. workspace→page 순환의존 회피, page/invitation 재사용 |
| callbackUrl(AC-AUTH-06) | **프론트 `?callbackUrl=` 전달** | Next.js+분리 백엔드 정합. 백엔드는 요청 파라미터만 읽어 리다이렉트 |
| 테스트 DB | **Testcontainers-postgres** (Docker 실행 확인됨) | 운영과 동일 PG 방언, Flyway V1+V2 그대로 검증. H2는 PG 전용 SQL 깨짐 |
| 개인 WS 동시 중복 방지 | **Flyway V2 partial UNIQUE 인덱스 + 앱 가드** | DB가 최종 거부 + 앱 가드 병행(read-then-write race 차단) |
| 현재 사용자 식별 | **CurrentUserService 매 요청 findByGoogleId** | 표준 OAuth2User 유지, Spring 기본 동작 미변경, 인덱스 조회 저렴 |
| 세션 timeout | **7d** | PRD 미명시, 합리적 기본값 |
| 개인 WS 기본명 | **"내 워크스페이스"** | BR-3로 이후 이름 변경 가능 |
| upsert 실패 처리 | **successHandler가 예외 시 `/login?error=true` 리다이렉트(QE-1)** | "인증됐으나 User 없음" 방지 |
| 403 단일화 | **JsonAccessDeniedHandler 제거, ApiExceptionHandler로 통일** | 서비스 레이어 AccessDeniedException은 @RestControllerAdvice가 잡음. 필터단 핸들러는 P1에서 죽은 코드(메서드 시큐리티 미사용) |

## MUST-ADDRESS 해소 (design-critic 5건)

1. **upsert 시점/실패**: User upsert는 **OAuth2SuccessHandler 내부** `UserService.loginWithOAuth(@Transactional)`에서 수행(인증 확정 후, 표준 OAuth2User principal 사용 — 커스텀 OAuth2UserService 안 씀). 첫 콜백에서 User row 생성 → 이후 요청은 `findByGoogleId`로 식별 일관. 트랜잭션 실패 시 successHandler가 catch → `/login?error=true`. CurrentUserService가 User 미발견 시(방어적) → 401.
2. **동시성**: V2 마이그레이션 partial UNIQUE 인덱스(`WHERE type='PERSONAL'`)로 DB 레벨 차단 + `existsByOwnerIdAndType` 앱 가드. `ensurePersonalWorkspace`는 INSERT 시 `DataIntegrityViolationException`을 catch하여 멱등 처리(이미 존재 = 정상).
3. **logout(CSRF disabled)**: 명시적 `POST /api/auth/logout` 매처 설정. 프론트가 `credentials:'include'` POST 호출. logoutSuccessHandler가 204 반환(SPA). 세션 무효화 + JSESSIONID 삭제.
4. **403 책임 경계**: 권한 검사는 전부 서비스 레이어 → `AccessDeniedException` throw → **ApiExceptionHandler가 403 단일 처리**. JsonAccessDeniedHandler 제거(죽은 코드). SecurityConfig.exceptionHandling은 authenticationEntryPoint(401/302)만 등록.
5. **테스트 DB**: Testcontainers-postgres 확정(위).

---

## 컴포넌트 설계

### 1. `UserService` (신규) — `user/UserService.java`
```java
@Service @RequiredArgsConstructor
public class UserService {
  private final UserRepository userRepository;
  private final WorkspaceService workspaceService;

  // OAuth 성공 시 successHandler가 호출하는 단일 진입점 (BR-7 단일 트랜잭션)
  @Transactional
  public User loginWithOAuth(OAuthUserInfo info) {
    User user = upsert(info);
    workspaceService.ensurePersonalWorkspace(user.getId()); // REQUIRED 합류 → 같은 트랜잭션
    return user;
  }

  @Transactional
  public User upsert(OAuthUserInfo info) {
    return userRepository.findByGoogleId(info.googleId())
      .map(u -> { u.setName(info.name()); u.setEmail(info.email()); u.setImage(info.image()); return u; }) // BR-1: googleId/id 불변
      .orElseGet(() -> userRepository.save(User.builder()
          .googleId(info.googleId()).email(info.email()).name(info.name()).image(info.image()).build()));
  }
}
```
- `OAuthUserInfo`: `record OAuthUserInfo(String googleId, String email, String name, String image)` — `user/OAuthUserInfo.java`. OAuth2User(서블릿 의존)에서 분리한 순수 DTO. **토큰 필드 없음(BR-5/AC-SEC-03).**
- 토큰을 받지도 저장하지도 않음. User 엔티티에 토큰 컬럼 없음(확인됨).

### 2. `WorkspaceService` (수정) — `ensurePersonalWorkspace` 추가
```java
@Transactional
public Workspace ensurePersonalWorkspace(UUID userId) {
  if (workspaceRepository.existsByOwnerIdAndType(userId, WorkspaceType.PERSONAL)) {
    return workspaceRepository.findFirstByOwnerIdAndType(userId, WorkspaceType.PERSONAL).orElseThrow();
  }
  try {
    Workspace ws = workspaceRepository.save(Workspace.builder()
        .type(WorkspaceType.PERSONAL).ownerId(userId).name("내 워크스페이스").build());
    membershipRepository.save(Membership.builder()
        .userId(userId).workspaceId(ws.getId()).role(MemberRole.OWNER).build());
    return ws;
  } catch (DataIntegrityViolationException e) { // V2 UNIQUE 동시성 충돌 → 멱등
    return workspaceRepository.findFirstByOwnerIdAndType(userId, WorkspaceType.PERSONAL).orElseThrow();
  }
}
```
- 기존 package-private `requireWorkspaceMember`/`requireOwner` 본문을 **AccessGuard 위임**으로 교체(시그니처 유지 → 기존 호출부 무수정). 또는 호출부를 AccessGuard 직접 사용으로 전환(구현자 판단, 단 행위 동일).
- `@Transactional` REQUIRED → loginWithOAuth 트랜잭션에 합류(BR-7).

### 3. `WorkspaceRepository` (수정)
```java
boolean existsByOwnerIdAndType(UUID ownerId, WorkspaceType type);
Optional<Workspace> findFirstByOwnerIdAndType(UUID ownerId, WorkspaceType type);
```

### 4. `OAuth2SuccessHandler` (신규) — `config/OAuth2SuccessHandler.java`
```java
@Component @RequiredArgsConstructor
public class OAuth2SuccessHandler implements AuthenticationSuccessHandler {
  private final UserService userService;
  @Value("${app.frontend-url}") private String frontendUrl;

  public void onAuthenticationSuccess(req, res, auth) {
    try {
      OAuthUserInfo info = extract((OAuth2User) auth.getPrincipal());
      userService.loginWithOAuth(info);
      res.sendRedirect(resolveRedirect(req)); // ?callbackUrl= 있으면 그곳, 없으면 frontendUrl+"/dashboard"
    } catch (Exception e) {
      res.sendRedirect(frontendUrl + "/login?error=true"); // QE-1, MUST-ADDRESS #1
    }
  }
  static OAuthUserInfo extract(OAuth2User p) { // 순수 함수 — 단위 테스트 대상
    return new OAuthUserInfo(p.getAttribute("sub"), p.getAttribute("email"), p.getAttribute("name"), p.getAttribute("picture"));
  }
  String resolveRedirect(HttpServletRequest req) { // callbackUrl 화이트리스트 검증(상대경로만 허용) 후 사용
    String cb = req.getParameter("callbackUrl"); // 프론트가 OAuth 진입 시 전달
    return (cb != null && cb.startsWith("/")) ? frontendUrl + cb : frontendUrl + "/dashboard";
  }
}
```
- **보안 주의**: callbackUrl은 open-redirect 방지를 위해 상대경로(`/`로 시작, `//` 차단)만 허용.

### 5. `CurrentUserService` (신규) — `common/security/CurrentUserService.java`
```java
@Service @RequiredArgsConstructor
public class CurrentUserService {
  private final UserRepository userRepository;

  public UUID requireCurrentUserId() {
    String googleId = extractGoogleId(SecurityContextHolder.getContext().getAuthentication());
    return userRepository.findByGoogleId(googleId)
        .map(User::getId)
        .orElseThrow(() -> new AuthenticationCredentialsNotFoundException("인증 사용자 없음")); // → 401
  }
  static String extractGoogleId(Authentication auth) { // 순수 함수
    if (auth == null || !(auth.getPrincipal() instanceof OAuth2User p))
      throw new AuthenticationCredentialsNotFoundException("미인증");
    return p.getAttribute("sub");
  }
}
```

### 6. `AccessGuard` (신규) — `common/security/AccessGuard.java`
```java
@Component @RequiredArgsConstructor
public class AccessGuard {
  private final MembershipRepository membershipRepository;
  private final PageRepository pageRepository;

  public Membership requireWorkspaceMember(UUID userId, UUID workspaceId) {
    return membershipRepository.findByUserIdAndWorkspaceId(userId, workspaceId)
        .orElseThrow(() -> new AccessDeniedException("워크스페이스 멤버가 아닙니다.")); // 403
  }
  public Membership requireWorkspaceMember(UUID userId, UUID workspaceId, MemberRole requiredRole) {
    Membership m = requireWorkspaceMember(userId, workspaceId);
    if (m.getRole() != requiredRole) throw new AccessDeniedException(requiredRole + " 권한이 필요합니다."); // 403
    return m;
  }
  public Membership requireOwner(UUID userId, UUID workspaceId) {
    return requireWorkspaceMember(userId, workspaceId, MemberRole.OWNER);
  }
  public Membership requirePageAccess(UUID userId, UUID pageId) {
    Page page = pageRepository.findById(pageId)
        .orElseThrow(() -> new EntityNotFoundException("페이지를 찾을 수 없습니다.")); // 404
    return requireWorkspaceMember(userId, page.getWorkspaceId());
  }
}
```
- 예외: `org.springframework.security.access.AccessDeniedException`(403), `jakarta.persistence.EntityNotFoundException`(404).
- AC-PERM-02 순서: 존재하는 페이지 → workspaceId 추출 → requireWorkspaceMember가 비멤버에 403. (페이지 미존재만 404)

### 7. `JsonAuthenticationEntryPoint` (신규) — `common/security/JsonAuthenticationEntryPoint.java`
```java
@Component @RequiredArgsConstructor
public class JsonAuthenticationEntryPoint implements AuthenticationEntryPoint {
  private final ObjectMapper objectMapper;
  @Value("${app.frontend-url}") private String frontendUrl;

  public void commence(req, res, ex) {
    if (req.getRequestURI().startsWith("/api/")) { // 경로 기반 분기 (결정적)
      res.setStatus(401); res.setContentType("application/json;charset=UTF-8");
      objectMapper.writeValue(res.getWriter(), new ErrorResponse("UNAUTHORIZED", "인증이 필요합니다."));
    } else {
      res.sendRedirect(frontendUrl + "/login"); // AC-AUTH-04
    }
  }
}
```

### 8. `ApiExceptionHandler` (수정) — 403/404 추가
```java
@ExceptionHandler(AccessDeniedException.class)              // org.springframework.security.access
public ResponseEntity<ErrorResponse> handleAccessDenied(AccessDeniedException ex) {
  return ResponseEntity.status(HttpStatus.FORBIDDEN).body(new ErrorResponse("FORBIDDEN", ex.getMessage()));
}
@ExceptionHandler(EntityNotFoundException.class)           // jakarta.persistence
public ResponseEntity<ErrorResponse> handleNotFound(EntityNotFoundException ex) {
  return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ErrorResponse("NOT_FOUND", ex.getMessage()));
}
```
- 기존 `Exception.class`(500)보다 구체 예외가 우선 매칭됨. `ErrorResponse(code,message)` record 재사용(QE-2).

### 9. `SecurityConfig` (수정)
```java
.csrf(csrf -> csrf.disable())
.authorizeHttpRequests(a -> a.requestMatchers("/api/health","/actuator/**","/ws/**","/login/**","/oauth2/**").permitAll()
    .anyRequest().authenticated())
.exceptionHandling(e -> e.authenticationEntryPoint(jsonAuthenticationEntryPoint)) // accessDeniedHandler 미등록(403=advice)
.oauth2Login(o -> o.successHandler(oAuth2SuccessHandler).failureUrl(frontendUrl + "/login?error=true"))
.logout(l -> l.logoutRequestMatcher(new AntPathRequestMatcher("/api/auth/logout","POST"))
    .invalidateHttpSession(true).deleteCookies("JSESSIONID")
    .logoutSuccessHandler((req,res,auth) -> res.setStatus(204)));
```
- 익명 successHandler/스텁 빈 제거 → `OAuth2SuccessHandler` 주입.

### 10. `application.yml` (수정) — 세션 보안
```yaml
server:
  servlet:
    session:
      timeout: 7d
      cookie:
        http-only: true
        same-site: lax
        secure: ${SESSION_COOKIE_SECURE:false}   # 로컬 HTTP=false, 운영 HTTPS=true
```

### 11. Flyway `V2__personal_workspace_unique.sql` (신규)
```sql
-- 개인 워크스페이스는 사용자당 1개 (동시 중복생성 차단)
CREATE UNIQUE INDEX uq_workspaces_owner_personal
    ON workspaces (owner_id) WHERE type = 'PERSONAL';
```

### 12. `build.gradle.kts` (수정) — Testcontainers
```kotlin
testImplementation("org.springframework.boot:spring-boot-testcontainers")
testImplementation("org.testcontainers:junit-jupiter")
testImplementation("org.testcontainers:postgresql")
```
- 테스트 베이스: `@SpringBootTest` + `@Testcontainers` + `@Container PostgreSQLContainer` + `@ServiceConnection`(또는 `@DynamicPropertySource`). Flyway가 컨테이너에 V1+V2 적용. `application-test.yml`은 `ddl-auto: validate` 유지(운영과 동일).

### 13. 컨트롤러 연결 (최소)
- `WorkspaceController`의 `currentUserId = null` 1건을 `currentUserService.requireCurrentUserId()`로 연결(식별 인프라 통합 검증용). 나머지 컨트롤러 본문/페이지 API 연결은 P2.

---

## 현재 사용자 식별 전략
표준 `OAuth2User` principal 유지(커스텀 미생성). 매 요청: JSESSIONID → 세션 → SecurityContext 복원 → `CurrentUserService.extractGoogleId(sub)` → `findByGoogleId` → User.id. User 미존재 시 `AuthenticationCredentialsNotFoundException` → entryPoint 401.

## 401/403 분기
| 상황 | 처리 | 응답 |
|------|------|------|
| 미인증 + `/api/**` | JsonAuthenticationEntryPoint | 401 JSON (AC-AUTH-05) |
| 미인증 + 비-API | JsonAuthenticationEntryPoint | 302 /login (AC-AUTH-04) |
| 인증+권한부족(서비스 throw) | ApiExceptionHandler.handleAccessDenied | 403 JSON (AC-PERM 전건) |
| 페이지 미존재 | ApiExceptionHandler.handleNotFound | 404 |

## 변경 범위
- **신규 8**: user/UserService.java, user/OAuthUserInfo.java, config/OAuth2SuccessHandler.java, common/security/CurrentUserService.java, common/security/AccessGuard.java, common/security/JsonAuthenticationEntryPoint.java, resources/db/migration/V2__personal_workspace_unique.sql, resources/application-test.yml
- **수정 6**: config/SecurityConfig.java, workspace/WorkspaceService.java, workspace/WorkspaceRepository.java, common/ApiExceptionHandler.java, resources/application.yml, build.gradle.kts (+ WorkspaceController 1건 연결)

## 구현 순서 (RGR 사이클 — AC 매핑)
1. **[Must] OAuthUserInfo + OAuth2SuccessHandler.extract()** (순수 매핑) — AC-AUTH-01(검증), 추출. 의존: 없음
2. **[Must] WorkspaceRepository.existsByOwnerIdAndType/findFirst + ensurePersonalWorkspace** — AC-AUTH-02(WS/Membership), BR-2. 의존: 없음
3. **[Must] UserService.upsert + loginWithOAuth** — AC-AUTH-02/03, BR-1/5/7, AC-SEC-03(captor). 의존: 2
4. **[Must] V2 마이그레이션 + ensurePersonalWorkspace 동시성 catch** — AC-AUTH-03 동시성. 의존: 2
5. **[Must] CurrentUserService(extractGoogleId 순수 + findByGoogleId)** — 식별 인프라. 의존: 없음
6. **[Must] AccessGuard(require* 3종) + WorkspaceService 위임** — FR-7/8, AC-PERM-01~05, BR-4. 의존: 없음
7. **[Must] JsonAuthenticationEntryPoint + ApiExceptionHandler 403/404 + SecurityConfig.exceptionHandling/successHandler 통합** — AC-AUTH-04/05, AC-PERM HTTP, QE-2. 의존: 3,6
8. **[Must] application.yml 세션 쿠키 + AC-SEC-01/02 검증** — AC-SEC-01/02, BR-6. 의존: 없음
9. **[Should] callbackUrl resolveRedirect** — AC-AUTH-06, FR-4. 의존: 7
10. **[Should] logout 설정** — FR-9. 의존: 7

병렬 가능(상호 무의존): {1, 2, 5, 6, 8}. 3은 2 이후, 4는 2 이후, 7은 3·6 이후.

---

## Testability 평가 (test-architect)

### Score: 8/10 → ✅ TESTABILITY PASS

### 컴포넌트별 테스트 전략 (격리)
- **UserService.upsert/loginWithOAuth**: UserRepository·WorkspaceService **Mockito mock**. findByGoogleId empty→INSERT / present→갱신 분기. `ArgumentCaptor<User>`로 google_id/email/name 검증 + 토큰 setter 미호출 검증. → AC-AUTH-02/03, BR-1, AC-SEC-03
- **OAuth2SuccessHandler.extract()**: 순수 static, OAuth2User stub(attributes)만. mock 불필요. → AC-AUTH-02/03 매핑, SEC-03
- **WorkspaceService.ensurePersonalWorkspace**: WorkspaceRepository·MembershipRepository mock. exists true→never save / false→Workspace+Membership(OWNER). captor로 type=PERSONAL/role=OWNER. → AC-AUTH-02, BR-2
- **CurrentUserService.extractGoogleId**: 순수 static + UserRepository mock. → 식별 인프라
- **AccessGuard**: MembershipRepository·PageRepository mock → 403 분기 전수. → AC-PERM-01~05, BR-4
- **JsonAuthenticationEntryPoint**: MockHttpServletRequest/Response 단위 + `@WebMvcTest`+security-test 슬라이스(미인증 /api/**→401 JSON, 비-API→302). → AC-AUTH-04/05, QE-2
- **ApiExceptionHandler**: 핸들러 메서드에 예외 직접 주입 → status/body 단위. → 403/404, QE-2
- **SecurityConfig**: `@SpringBootTest`+MockMvc+`spring-security-test`(`oauth2Login()` post-processor)로 successHandler→리다이렉트, 미인증 분기, logout. → AC-AUTH-01/04/05/06, FR-9
- **세션 쿠키**: `@SpringBootTest` Set-Cookie 헤더 단언(HttpOnly/SameSite) + Secure는 `secure` 프로퍼티 단언(MockMvc/HTTP는 Secure 직접 관찰 불가). AC-SEC-02는 변조 쿠키 통합 테스트. → AC-SEC-01/02

### 비차단 보강 (구현 시 반영)
1. Testcontainers-postgres 추가(Docker 실행 확인) → `@DataJpaTest`/통합 DB 부팅. AC-AUTH-02/03 실DB end-to-end 1~2건.
2. AC-SEC-03: 3중 검증(V1 스키마 토큰 컬럼 부재 + User 엔티티 토큰 필드 부재 + upsert captor 토큰 미전달).
3. AC-SEC-01 Secure: 프로퍼티 단언으로 우회, HttpOnly/SameSite는 실 Set-Cookie 헤더 단언.

### AC ↔ 테스트 레이어
| AC | 레이어 |
|----|--------|
| AUTH-01 | @SpringBootTest MockMvc(302 Location) |
| AUTH-02/03 | UserService 단위(mock+captor) + Testcontainers end-to-end 1건 |
| AUTH-04/05 | @WebMvcTest+security-test 슬라이스 |
| AUTH-06 | @SpringBootTest MockMvc(?callbackUrl=) |
| PERM-01~05 | AccessGuard 순수 단위(mock) + @WebMvcTest HTTP 1건 |
| SEC-01/02 | @SpringBootTest Set-Cookie/프로퍼티 단언 + 변조세션 |
| SEC-03 | UserService captor + 스키마/엔티티 검사 |
