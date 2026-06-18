# 인증·권한 아키텍처

## 시스템 구조

### Google OAuth 로그인 흐름

```
Browser → GET /api/auth/signin/google
       ← 302 redirect → Google 인증 URL (state, code_challenge 포함)
Browser → Google 로그인 & 계정 선택
       ← 302 redirect → /api/auth/callback/google?code=...&state=...
Next.js → Google에 code → access_token, id_token 교환
Next.js → DB: User upsert (email, name, image, googleId 기준)
Next.js → DB: Workspace(PERSONAL) 존재 확인
        ↳ 없으면: Workspace INSERT + Membership INSERT (role=OWNER)
Next.js → Browser: Set-Cookie: session (HTTP-only) + 302 → /dashboard
```

**User upsert 기준 키:** `googleId` (Google OAuth `profile.sub`).
재로그인 시 name·image·email을 최신값으로 갱신하고 기존 레코드를 재사용한다.

**개인 워크스페이스 자동 생성:** 최초 로그인 시 1회만 생성. 계정당 `PERSONAL` 타입 워크스페이스 1개 제한 (애플리케이션 레이어 강제).

---

### JWT 세션 전략

Auth.js `strategy: 'jwt'`를 채택한다. 세션을 HTTP-only 암호화 쿠키에 저장하며 DB 조회 없이 복호화로 검증한다.

**채택 이유:**
1. MVP 단계 단순성 — DB Session 테이블 관리·TTL 청소 작업 불필요
2. 수평 확장 친화 — Next.js 서버와 WebSocket 실시간 서버가 동일한 `AUTH_SECRET`으로 JWT 검증 가능
3. 즉시 무효화(강제 로그아웃) 불필요 — MVP에서 어드민 계정 정지 등은 post-MVP

**설정 요약:**

| 항목 | 값 |
|------|----|
| 전략 | `jwt` |
| maxAge | 30일 |
| 쿠키 속성 | `HttpOnly: true`, `Secure: true`, `SameSite: lax` |
| JWT 서명 알고리즘 | `HS256` + `AUTH_SECRET` (32바이트 이상) |
| Refresh Token | 없음 (만료 시 재로그인) |
| CSRF 방어 | `SameSite=lax` + Auth.js 내장 CSRF 토큰 |

---

### 보호 라우트 미들웨어

`middleware.ts`는 Next.js Edge Runtime에서 실행된다.

- 미인증 요청 → `/login` redirect
- 제외 경로: `api/auth/*` (Auth.js 직접 처리), `_next/static`, `_next/image`, `favicon.ico`, `login`

---

### Route Handler 이중 검증

미들웨어 통과 후에도 각 Route Handler 내부에서 `auth()` 헬퍼로 세션을 재검증한다.

**검증 순서:**

```
1. 세션 확인    auth() → session?.user?.id 없으면 401
2. 소속 확인    requireWorkspaceMember(userId, workspaceId) → Membership 없으면 403
3. 역할 비교    requiredRole 전달 시 role !== 'OWNER' 이면 403
```

페이지 접근의 경우: `requirePageAccess(userId, pageId)` → `pageId → workspaceId` 조회 후 `requireWorkspaceMember` 위임.

---

### 실시간 서버(WebSocket) JWT 인가

WebSocket 연결은 HTTP 핸드셰이크 단계에서 1회 JWT 검증으로 신원을 확정하고, 이후 수신되는 op는 연결 컨텍스트의 userId로 신원을 판단한다.

**연결 시 검증 순서:**

```
1. Cookie 또는 Query(?token=) 에서 JWT 추출
2. verifyJwt(token, AUTH_SECRET) → 실패 시 ws.close(4001, 'Unauthorized')
3. URL에서 pageId 추출 → DB에서 workspaceId 조회 → 없으면 ws.close(4004)
4. Membership 조회 → 없으면 ws.close(4003, 'Forbidden')
5. 통과 시 roomMap에 (pageId, userId) 등록
```

**메시지 수신 시 처리:**

```
- 인증된 연결을 통해서만 op 수신 — 연결 시 확정된 userId가 신원의 근거
- siteId는 세션/탭별 UUID로 CRDT 편집 식별에만 사용; siteId === userId 비교 불필요
- 서버가 연결 컨텍스트의 userId를 op에 태깅하여 기록 (클라이언트 전달 siteId·userId 신뢰 금지)
- 메시지 크기 상한 설정 (64KB 초과 시 연결 종료)
```

멤버 제거 API 호출 시 해당 userId의 WebSocket 연결을 강제 종료한다 (`ws.close(4003)`).

---

### 권한 검사 순서 요약

```
요청 수신
  │
  ▼ [미들웨어] 세션 쿠키 유무 → 없으면 /login redirect
  │
  ▼ [Route Handler] auth() → session.user.id → 없으면 401
  │
  ▼ [requireWorkspaceMember] Membership 존재 확인 → 없으면 403
  │
  ▼ [역할 검사] requiredRole=OWNER 인 경우 role 비교 → 불일치 시 403
  │
  ▼ 처리 진행
```

---

## 주제 문서

| 주제 | 설명 |
|------|------|
| [인증·권한 상세](../../requirements/08-auth-and-permissions.md) | Google OAuth 흐름·JWT 세션·권한 매트릭스·초대 흐름·보안 고려사항 |
| [데이터 모델](../../requirements/05-data-model.md) | User·Account·Session·Membership·Invitation 스키마 |
| [PRD](../../requirements/02-prd.md) | 인증 사용자 스토리(US-AUTH-01~03)·수용 기준·비기능 보안 요구사항 |
