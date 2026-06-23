# 인증·권한 아키텍처

> **스택 정정(2026-06-18, PR #3)**: 본 도메인은 **Spring Boot + Spring Security OAuth2 + JPA/Hibernate + Flyway**로 구현된다.
> 일부 requirements 문서(04, 08)는 초기 기획의 Auth.js + Next.js + Prisma 전제로 작성되어 있으나, 실제 백엔드(`backend/`, :8080)는 Spring이다.
> 프론트(Next.js, :3000)는 `credentials:'include'`로 세션 쿠키를 첨부해 호출한다. 이 문서는 **실제 코드 기준**이다.

## 시스템 구조

### Google OAuth 로그인 흐름 (Spring Security)

```
Browser → GET /oauth2/authorization/google           (Spring Security OAuth2 진입점)
       ← 302 redirect → Google 인증 URL (state 포함)
Browser → Google 로그인 & 계정 선택
       ← 302 redirect → /login/oauth2/code/google?code=...&state=...
Spring  → Google에 code → access_token, id_token 교환 (Spring Security 내부)
Spring  → [OAuth2SuccessHandler] OAuth2User에서 sub/email/name/picture 추출
        → UserService.loginWithOAuth (@Transactional):
            · UserService.upsert(googleId 기준) — User INSERT 또는 name/email/image 갱신
            · WorkspaceService.ensurePersonalWorkspace — PERSONAL 워크스페이스 + Membership(OWNER)
        → Set-Cookie: JSESSIONID (HttpOnly, SameSite=Lax, Secure=env)
        → 302 redirect → {frontend-url}/dashboard (또는 ?callbackUrl= 상대경로)
```

핵심 클래스: `config/OAuth2SuccessHandler`, `user/UserService`, `user/OAuthUserInfo`(record), `workspace/WorkspaceService`.

**User upsert 기준 키:** `googleId` (Google OAuth `sub`). 재로그인 시 name·image·email을 갱신하고 기존 레코드를 재사용한다. **토큰(access/refresh)은 저장하지 않는다** — `users` 테이블·`User` 엔티티에 토큰 컬럼 없음.

**개인 워크스페이스 자동 생성:** 최초 로그인 시 1회. 계정당 `PERSONAL` 1개 제한 — 애플리케이션 가드(`existsByOwnerIdAndType`) + **Flyway V2 partial UNIQUE 인덱스**(`uq_workspaces_owner_personal ON workspaces(owner_id) WHERE type='PERSONAL'`)로 동시성까지 DB 레벨 보장.

---

### 세션 전략 (서버측 HTTP 세션)

**Spring Security 기본 서버측 세션(JSESSIONID)** 을 사용한다. (초기 기획의 Auth.js JWT 전략과 다름.)

| 항목 | 값 |
|------|----|
| 방식 | 서버측 HTTP 세션 (JSESSIONID 쿠키 → 서버 세션 저장소 참조) |
| timeout | 7일 (`server.servlet.session.timeout`) |
| 쿠키 속성 | `HttpOnly: true`, `SameSite: Lax` (`SessionCookieConfig`), `Secure: ${SESSION_COOKIE_SECURE:false}` (application.yml — **운영 배포 시 true 필수**) |
| 위변조 방어 | 서버측 세션 참조 모델 — 변조 JSESSIONID는 세션 미스 → 미인증 → 401 |
| CSRF | 현재 `.csrf().disable()` (API 서버). 상태변경은 SameSite=Lax + 인증 세션에 의존. 로그아웃은 POST 전용으로 GET CSRF 차단 |

> 쿠키 설정: HttpOnly/SameSite는 `config/SessionCookieConfig`(ServletContext SessionCookieConfig)에서, Secure/timeout은 `application.yml`에서 단일 소스로 관리.

---

### 인가: 401/403 분기

`config/SecurityConfig`의 필터 체인:
- `permitAll`: `/api/health`, `/actuator/**`, `/ws/**`, `/login/**`, `/oauth2/**`
- 그 외 `anyRequest().authenticated()`

미인증 처리는 `common/security/JsonAuthenticationEntryPoint`가 **경로 기반 분기**:

```
미인증 요청
  │
  ├─ /api/** 로 시작     → 401 + application/json (ErrorResponse{code,message})
  └─ 그 외(보호 라우트)  → 302 redirect → {frontend-url}/login
```

권한 거부(403)·리소스 미존재(404)는 서비스 레이어에서 예외를 던지고 `common/ApiExceptionHandler`(`@RestControllerAdvice`)가 JSON으로 변환한다(고정 메시지로 내부정보 미노출):
- `AccessDeniedException` → 403 `{"code":"FORBIDDEN"}`
- `EntityNotFoundException` → 404 `{"code":"NOT_FOUND"}`
- `IllegalArgumentException` → 400 (사용자 입력 검증 메시지)

---

### 현재 사용자 식별

`common/security/CurrentUserService`가 매 요청 `SecurityContext`의 OAuth2User principal에서 `sub`(googleId)를 추출 → `UserRepository.findByGoogleId` → `User.id`(UUID) 반환. 미인증/미존재 시 `AuthenticationCredentialsNotFoundException` → 401.

---

### 권한 검사 (AccessGuard)

`common/security/AccessGuard` 공통 컴포넌트가 권한 검사를 일원화한다(page·invitation 등에서 재사용, workspace→page 순환의존 회피).

```
요청 (CurrentUserService.requireCurrentUserId() → userId)
  │
  ▼ requireWorkspaceMember(userId, workspaceId)         Membership 없으면 AccessDeniedException(403)
  │   └─ requiredRole=OWNER 전달 시 role 불일치 → 403
  ▼ requirePageAccess(userId, pageId)                   pageId→Page→workspaceId 위임;
  │                                                      페이지 없으면 EntityNotFoundException(404)
  ▼ 처리 진행
```

> **P1 상태**: AccessGuard 헬퍼·CurrentUserService 구현·단위검증 완료. 컨트롤러에서의 실제 호출(엔드포인트 적용)은 **P2**(페이지/워크스페이스 API 본구현)에서 연결.

---

### 멤버 관리 & WS 강제종료 (WS-AUTH-04) — P9 (PR #25)

OWNER 전용 멤버 액션(`WorkspaceService.listMembers`/`removeMember`/`updateMemberRole`)은 진입부 `AccessGuard.requireOwner`로 보호된다(비OWNER/비멤버 403 → PERM-03/04). 검증 순서:

```
removeMember:    requireOwner(403) → 자기제거 금지 BR-3(400) → 대상 존재 BR-4(404)
                 → 마지막 OWNER 방어가드 BR-2(400, 현 순서상 도달불가) → delete → disconnectUser
updateMemberRole: requireOwner(403) → role null(400) → 대상 존재(404)
                 → 마지막 OWNER 강등 금지 BR-1(대상 OWNER && OWNER count==1 → 400) → setRole
```
- **마지막 OWNER 보호**: 강등(BR-1)·제거(BR-3 자기제거 흡수)로 OWNER 0명 워크스페이스를 방지. `MembershipRepository.countByWorkspaceIdAndRole`로 판정.

**멤버 제거 시 WebSocket 강제종료 채널 (WS-AUTH-04)** — Spring과 ws-relay(Node)는 독립 프로세스이므로 HTTP admin 채널로 연동한다:

```
removeMember (delete 후, @Transactional 내부 직접 호출, best-effort)
  → WsRelayAdminClient.disconnectUser(userId)              [com.ieum.workspace, RestClient]
  → DELETE {WS_RELAY_ADMIN_URL}/admin/connections/{userId}
  → ws-relay 별도 admin http.Server (127.0.0.1:ADMIN_PORT, 기존 WebSocketServer와 분리)
  → userConnections(userId→Set<WebSocket>)의 OPEN 소켓에 close(4003,"removed")
```
- **best-effort**: 예외 흡수는 `RestWsRelayAdminClient` 구현체 내부(로깅). admin 호출 실패가 멤버 제거 트랜잭션을 롤백하지 않는다. `WS_RELAY_ADMIN_URL` 미설정 시 no-op(+경고 로그).
- **보안**: admin 엔드포인트는 `127.0.0.1` 전용 바인드. userId는 입력검증(URIError/UUID 형식 → 400). 인증 토큰은 미적용(P11급 하드닝 대상). userId 추적은 멤버십 게이트 활성 연결만(WS-AUTH 신원 일관).

핵심 클래스: `workspace/WorkspaceService`·`WorkspaceController`·`WsRelayAdminClient`/`RestWsRelayAdminClient`, `apps/ws-relay/src/{server.ts,adminServer.ts}`.

---

### 워크스페이스 수명주기 — 삭제·나가기 (US-WS-04) — P10 (PR #26)

P9의 멤버 제거 WS 강제종료를 워크스페이스 삭제(전체 멤버)·나가기(본인)로 확장한다.

```
deleteWorkspace:  requireOwner(403, 없는 WS도 403·존재 비누설) → PERSONAL 차단(400)
                  → 멤버 목록 캡처(findByWorkspaceId) → 각 멤버 disconnectUser → deleteById
                  → DB ON DELETE CASCADE(pages·memberships·invitations·crdt_ops·snapshots) 자동 정리
leaveWorkspace:   멤버십(404) → PERSONAL 차단(400) → 마지막 OWNER 차단(400) → 본인 delete → 본인 disconnectUser
                  엔드포인트 DELETE /api/workspaces/{id}/members/me
                  (기존 /{id}/members/{userId} removeMember와 Spring MVC 리터럴 세그먼트 우선 매칭으로 분리)
```
- **cascade 전략**: 자식 엔티티(Membership/Page 등)에 JPA 연관관계 매핑이 없어 `workspaceRepository.deleteById()` 단일 호출 + DB FK `ON DELETE CASCADE`(V1)에 위임. 캡처한 멤버 목록을 deleteById 이후 수정하지 않는 불변식 유지(StaleStateException 방지). 통합테스트가 활성·아카이브 페이지의 crdt_op/snapshot까지 2단계 cascade(workspace→page→crdt_op/snapshot) 실증.
- **검증 순서 비대칭**: 삭제=권한 우선(requireOwner — 없는 WS도 403·존재 비누설, P9 일관), 나가기=멤버십 우선(404). 타인 리소스 변경 vs 본인 멤버십 정리의 의미 차이를 반영.
- **마지막 OWNER 보호**: 강등(P9 BR-1)·제거(P9 BR-3 자기제거 흡수)·나가기(P10 BR-5)로 OWNER 0명 워크스페이스를 방지. `countByWorkspaceIdAndRole`로 판정. 메시지 구분(나가기 "마지막 OWNER는 워크스페이스에서 나갈 수 없습니다").
- **WS 강제종료 타이밍(한계)**: 삭제/나가기 모두 `@Transactional` 내부 best-effort 호출(P9 removeMember 일관). 커밋 전 호출이므로 삭제 롤백 시 "연결은 끊겼으나 WS 잔존" 불일치 가능(허용 손실). disconnect를 `@TransactionalEventListener(AFTER_COMMIT)`로 전환하는 것은 P11 하드닝 후보(P9 removeMember 포함 일괄).

핵심 클래스: `workspace/WorkspaceService`(deleteWorkspace·leaveWorkspace·renameWorkspace)·`WorkspaceController`(PATCH/DELETE `/{id}`, DELETE `/{id}/members/me`).

---

### callbackUrl 복귀

`OAuth2SuccessHandler.resolveRedirect`가 요청의 `callbackUrl` 파라미터를 읽어 복귀한다. **open-redirect 방어**: 동일 오리진 상대경로 화이트리스트(`/[A-Za-z0-9/_-]*`, `//` 차단)만 허용하고, 그 외는 `/dashboard`로 폴백. 프론트가 OAuth 진입 시 `callbackUrl`을 state로 전달하는 연동은 P2 프론트.

---

### 로그아웃

`POST /api/auth/logout` 전용(`SecurityConfig` 람다 매처). 세션 무효화 + JSESSIONID 삭제 + 204. CSRF 비활성 환경에서 GET 로그아웃(이미지 태그 등)은 405로 차단.

---

## 미래 Phase 설계 (미구현)

### 실시간 서버(WebSocket) 인가 — P5

별도 Java WebSocket 핸들러(`collaboration/CollaborationWebSocketHandler`, `/ws/**`)에서 연결 핸드셰이크 시 1회 인증으로 신원을 확정한다. 연결 시: pageId→workspaceId→Membership 확인, 실패 시 `ws.close(4003)`. 메시지의 신원은 연결 컨텍스트 userId로 판단(클라이언트 siteId는 CRDT 세션 식별용 UUID로만 사용). 멤버 제거 시 해당 userId의 WebSocket 강제 종료. 인증 매체(세션 쿠키 vs 단기 토큰)는 P5에서 확정 — `CurrentUserService` 재사용 예정.

### 초대 흐름 — P7
`invitation/` 패키지(엔티티/서비스 스텁 존재). OWNER 이메일 초대(256-bit 토큰, 7일 만료), 수락 시 Membership 생성. `AccessGuard.requireOwner` 재사용.

### Viewer 역할 — P8 (post-MVP)

---

## 주제 문서

| 주제 | 설명 | 비고 |
|------|------|------|
| [인증·권한 상세](../../requirements/08-auth-and-permissions.md) | OAuth 흐름·세션·권한 매트릭스·초대·보안 | ⚠️ Auth.js/Prisma 전제로 작성됨 — 권한 매트릭스·정책 의도는 유효하나 구현 기술은 본 문서(Spring) 기준 |
| [데이터 모델](../../requirements/05-data-model.md) | User·Workspace·Membership·Invitation 스키마 | 스키마는 `backend/.../db/migration/V1__init.sql`(+V2) 기준 |
| [PRD](../../requirements/02-prd.md) | 인증 사용자 스토리·수용 기준 | |
| [구현 추적](status.md) | P1 AC별 구현 상태 + PR 링크 | |
