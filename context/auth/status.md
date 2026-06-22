# 인증·권한 구현 추적

## 범례

| 마크 | 의미 |
|------|------|
| ✅ 반영됨 | 코드 구현 완료 |
| ⬜ 미반영 | 정책/설계만 확정, 구현 전 |

---

## Phase 매핑

> 이 매핑은 구현 phase 계획 기준: 로그인·User upsert·세션·권한 컨텍스트·보호 라우트 → **P1**, WebSocket 연결 인가 → **P5**, 초대 생성(INV-01/05/07) → **P7**, 초대 수락·철회·만료·실발송 → **P8**, 역할·멤버 관리·권한 매트릭스 마감 → **P9**, Viewer·WS 신원위조 방지 하드닝 → **P11**.
>
> 옛 중첩 표기(`P7-②b` 등)는 폐기하고 평면 연속 번호(P8~P11)를 쓴다. 묶음 정의는 [`../remaining-phases.md`](../remaining-phases.md) 참조.

---

## 요구사항 추적

### US-AUTH-01 ~ US-AUTH-03 수용 기준 (02-prd.md §1)

| 항목 ID | 설명 | 상태 | Phase | 비고 |
|---------|------|------|-------|------|
| AC-AUTH-01 | Google OAuth 버튼 클릭 시 Google 계정 선택 화면으로 이동 | ✅ | P1 | Spring Security `oauth2Login` (PR #3). ※실제 스택=Spring(문서의 Auth.js 아님) |
| AC-AUTH-02 | 최초 로그인 시 User 레코드 자동 생성 + 개인 워크스페이스 자동 생성 | ✅ | P1 | `OAuth2SuccessHandler`→`UserService.loginWithOAuth`(upsert) + `WorkspaceService.ensurePersonalWorkspace`(OWNER 멤버십), 단일 트랜잭션 (PR #3) |
| AC-AUTH-03 | 재로그인 시 기존 User 레코드 재사용 (googleId 기준 upsert) | ✅ | P1 | `UserService.upsert` findByGoogleId 갱신 분기 (PR #3) |
| AC-AUTH-04 | 로그아웃 후 보호된 경로 접근 시 `/login`으로 리다이렉트 | ✅ | P1 | `JsonAuthenticationEntryPoint` 비-API→302 `/login` (PR #3) |
| AC-AUTH-05 | 유효하지 않거나 만료된 세션으로 API 호출 시 401 반환 | ✅ | P1 | `JsonAuthenticationEntryPoint` `/api/**`→401 JSON (PR #3) |
| AC-AUTH-06 | 로그인 성공 후 이전에 접근하려던 페이지로 복귀 (callbackUrl 처리) | ✅ | P1 | `OAuth2SuccessHandler.resolveRedirect` `?callbackUrl=` + open-redirect 화이트리스트. state 전달은 P2 프론트 (PR #3) |

### 권한 모델 (08-auth-and-permissions.md §3~4)

| 항목 ID | 설명 | 상태 | Phase | 비고 |
|---------|------|------|-------|------|
| PERM-01 | `requireWorkspaceMember` 헬퍼 구현 (세션→소속→역할 3단계 검증) | ✅ | P1 | `common.security.AccessGuard.requireWorkspaceMember` (PR #3) |
| PERM-02 | `requirePageAccess` 헬퍼 구현 (pageId→workspaceId 조회 후 위임) | ✅ | P1 | `AccessGuard.requirePageAccess` (PR #3) |
| PERM-03 | OWNER 전용 액션(멤버 초대·제거·역할 변경·워크스페이스 삭제)에 OWNER 검증 적용 | ⬜ | P9 | `AccessGuard.requireOwner` 헬퍼·단위검증 완료(PR #3). 초대 생성엔 적용(PR #19), 나머지 액션 엔드포인트 적용은 P9 |
| PERM-04 | MEMBER가 OWNER 전용 액션 시도 시 403 반환 | ⬜ | P9 | 역할검증 로직·단위검증 완료(PR #3). 엔드포인트 적용 시 자동 충족(P9) |
| PERM-05 | 워크스페이스 비멤버의 페이지 접근 시 403 반환 | ✅ | P2 | `requireWorkspaceMember`를 `PageService.createPage`/`getPageTree`에 적용 → 비멤버 403 (PR #4). 단건 페이지 `requirePageAccess` 적용은 updatePage/archivePage 구현 시(다음 사이클) |
| PERM-06 | Viewer 역할 구현 | ⬜ | P11 | post-MVP, 현재 설계 범위 외 |

### WebSocket 인가 (08-auth-and-permissions.md §4-2)

| 항목 ID | 설명 | 상태 | Phase | 비고 |
|---------|------|------|-------|------|
| WS-AUTH-01 | WebSocket 연결 시 JWT 추출·검증 (`AUTH_SECRET` 공유) | ⬜ | P11 | **trust-relay userId 채택**(JWT 아님 — Spring은 서버측 세션). 웹이 `/api/users/me`로 userId 획득 후 join에 trust-relay (PR #15). 신원 위조 방지(서명/세션 검증) 하드닝은 P11 |
| WS-AUTH-02 | 연결 시 pageId → workspaceId → Membership 확인, 실패 시 ws.close(4003) | ✅ | P5 후반 (PR #15) | Node `MembershipStore`(pages⋈memberships DB 조회), join 게이트 비멤버 `close(4003)`. 교차 room op 영속화 공백도 connPage 게이트로 마감 |
| WS-AUTH-03 | 메시지 수신 시 서버가 연결 컨텍스트의 userId를 op에 태깅 (siteId는 세션 UUID, 신원 비교에 미사용) | ✅ | P5 후반 (PR #15) | 영속 op에 연결 userId를 `crdt_ops.created_by_id`에 태깅 (Flyway V4). siteId 미사용 |
| WS-AUTH-04 | 멤버 제거 API 호출 시 해당 userId의 WebSocket 연결 강제 종료 | ⬜ | P9 | 멤버 제거 API(P9) 의존 |
| WS-AUTH-05 | WebSocket 메시지 크기 상한 설정 (64KB 초과 시 연결 종료) | ✅ | P5 | server.ts `maxPayload=64KiB` 기구현(PR #10) |

### 초대 흐름 (08-auth-and-permissions.md §5, 02-prd.md §7)

| 항목 ID | 설명 | 상태 | Phase | 비고 |
|---------|------|------|-------|------|
| INV-01 | OWNER의 이메일 기반 초대 생성 (256-bit token, 7일 만료) | ✅ | P7 | `InvitationService.createInvitation` — OWNER 검증·SecureRandom 32B 토큰·+7일·PENDING 저장, 메일 fallback. `POST /api/workspaces/:id/invitations` 인증 배선 (PR #19) |
| INV-02 | 초대 수락: 토큰 검증 → Membership 생성 (트랜잭션, 경쟁 조건 방지) | ✅ | P8 | `acceptInvitation` 단일 트랜잭션 — 토큰404·만료우선410(EXPIRED 전이, `noRollbackFor`)·비PENDING409·멱등(ACCEPTED 전이)·role 승계. `POST /api/invitations/accept` (PR #20) |
| INV-03 | 초대 취소(REVOKE): OWNER만 가능 | ✅ | P8 | `revokeInvitation` — requireOwner→존재(404)→워크스페이스일치(404 은닉)→PENDING(409)→REVOKED 전이(@Transactional). `DELETE /api/workspaces/:id/invitations/:invId`. + 목록조회 `GET .../invitations`(OWNER, `findByWorkspaceIdOrderByCreatedAtDesc`). 단위+통합 (PR #21) |
| INV-04 | 초대 만료 처리: lazy(수락 시 expiresAt 검사) + 스케줄러(일 1회) | ✅ | P8 | lazy 만료(수락 시 EXPIRED 전이+410) PR #20. 일 1회 스케줄러 — `InvitationExpiryScheduler` `@Scheduled`(cron 새벽2시, 외부화) → `expirePendingInvitations` bulk `@Modifying` EXPIRED 전이(strictly `<`, 멱등), `@EnableScheduling`. 단위+통합 (PR #22) |
| INV-05 | 이미 멤버인 이메일로 초대 시 409 반환 | ✅ | P7 | `findByEmail`→멤버십 조회→`ConflictException`(신규)→`ApiExceptionHandler` 409 (PR #19) |
| INV-06 | 초대 이메일과 다른 계정으로 수락 시도 시 403 반환 | ✅ | P8 | `findById(userId).email` vs `invitation.email`(trim+equalsIgnoreCase) → AccessDeniedException 403. 단위+통합 검증 (PR #20) |
| INV-07 | 초대 이메일 발송 (초대 링크 포함) | ✅ | P8 | Resend API 실 HTTP POST 발송(`RestClient`, Bearer 인증, 2xx messageId 로깅). 실패(4xx/5xx/네트워크) 예외 미전파 → 초대 PENDING 유지, OWNER 링크 수동 전달(fallback). RestClient.Builder 주입+타임아웃(5s/10s), workspaceName CRLF 정제. 단위(MockRestServiceServer) (PR #23). ※생성 메일 fallback 배선은 PR #19 |

### 세션 보안 (08-auth-and-permissions.md §6-5)

| 항목 ID | 설명 | 상태 | Phase | 비고 |
|---------|------|------|-------|------|
| SEC-01 | 세션 쿠키 `HttpOnly: true`, `Secure: true`, `SameSite: lax` 설정 | ✅ | P1 | `SessionCookieConfig`(HttpOnly/SameSite=Lax) + application.yml `secure: ${SESSION_COOKIE_SECURE}`(운영 env) (PR #3) |
| SEC-02 | JWT 서명 `HS256` + `AUTH_SECRET` (32바이트 이상) | ✅ | P1 | ※실제는 Spring 서버측 세션(JSESSIONID) — JWT 아님. 변조 세션→미인증→401로 충족 (PR #3) |
| SEC-03 | Google OAuth에서 수신한 email·googleId 외 민감 정보 미저장 | ✅ | P1 | User 엔티티 토큰 컬럼 없음, `upsert`는 email/name/image/googleId 4필드만 (PR #3) |
