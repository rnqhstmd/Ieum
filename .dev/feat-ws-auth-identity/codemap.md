## 코드 맵: WS-AUTH-01 — WebSocket 신원위조 방지

> 목표: relay가 클라가 주장한 `joinMsg.userId`를 신뢰하지 않고 서명/세션으로 검증. base=main(cd1661e).

### 핵심 파일
- `apps/ws-relay/src/server.ts:89-118` → join 게이트. `joinMsg.userId`(클라 주장)로 `membershipStore.isMember` 호출, `connUserId = joinMsg.userId` 저장(L113), op 태깅(L135). **신뢰 지점 = userId 진위 미검증** [핵심 수정 대상]
- `apps/ws-relay/src/protocol.ts:8-16,135-152` → JoinMsg 정의 + parseClientMessage. userId 길이만 검증(MAX 64), 신원 검증 없음. 주석에 "신원 위조 방지는 후속" [수정: token 필드/검증]
- `apps/web/src/lib/realtime/relayClient.ts:81-91` → join 조립. `opts.getUserId()` → userId를 메시지에 실어 송신(서명 없음) [수정: token 동반]
- `apps/web/src/lib/editor/useCrdtDocument.ts:76-103,122` → userIdRef 보관 + `fetchCurrentUserId()` ready Promise로 join 지연 + `getUserId` 주입 [수정: token 획득·주입]
- `apps/web/src/lib/auth/currentUser.ts:7-16` → `/api/users/me`(JSESSIONID)에서 실 userId fetch. 401/오류 시 null [수정 후보: ws-token도 여기서]
- `backend/.../user/UserController.java:24-30` → `GET /api/users/me` → `CurrentUserService.requireCurrentUserId()` → 실 UUID(MeResponse) [참조: 토큰 발급 endpoint 추가 위치 후보]
- `backend/.../common/security/CurrentUserService.java:20-25` → SecurityContext(OAuth2 principal.sub)→User.id(UUID). 인증 신뢰 원천 [토큰 payload userId 원천]
- `apps/ws-relay/src/membershipStore.ts:5-9` / `pgMembershipStore.ts:25-34` → `isMember(userId,pageId)` (pages⋈memberships). userId 진위 미검증, 멤버십만 [검증된 userId로 호출하도록]

### 참조 파일
- `backend/.../workspace/RestWsRelayAdminClient.java:29-41` → backend→relay HTTP(`DELETE /admin/connections/{userId}`, `app.ws-relay.admin-url`). **기존은 backend→relay 단방향** — 후보 B(relay→backend)는 역방향 신규 경로 필요
- `apps/ws-relay/src/adminServer.ts:16-40` → relay admin http.Server(WS-AUTH-04 disconnect). relay가 HTTP **서버**는 있으나 backend로의 **클라이언트** 호출 경로는 없음
- `backend/.../common/security/AccessGuard.java:37-41` → REST `requirePageAccess`(인증 userId 기반). relay와 대비되는 정상 검증 경로
- `apps/ws-relay/src/main.ts:6-16` → relay 엔트리. `RELAY_DATABASE_URL` 미설정 시 InMemory+게이트 off
- `apps/web/src/lib/realtime/protocol.ts` → web JoinMsg(userId 필드)

### 설정/환경
- `backend/.../application.yml:40-48` → `WS_RELAY_ADMIN_URL`(backend→relay). **AUTH_SECRET 없음**
- `backend/build.gradle.kts:20-43` → Spring Security/OAuth2 O. **JWT/HMAC 라이브러리 없음** (단 HMAC-SHA256은 JDK `javax.crypto.Mac` 내장 → 라이브러리 불필요)
- `.env.example` / `apps/web/.env.local.example` / `apps/ws-relay/.env` → AUTH_SECRET 미정의(신규 추가 대상). web `NEXT_PUBLIC_WS_URL`/`NEXT_PUBLIC_API_URL`
- 세션: `application.yml` JSESSIONID, SEC-01 **HttpOnly:true** → JS가 세션쿠키 못 읽음

### 현재 신원 신뢰 흐름
web `/api/users/me`(JSESSIONID)→실 UUID → userIdRef → WS join `{type,pageId,userId}` 송신 → relay가 userId **그대로 신뢰** → membershipStore.isMember(멤버십만) → connUserId 저장 → op 태깅. **사칭 시나리오**: 클라가 `userId=타인(멤버)`로 join → 멤버십 통과 → 타인 이름으로 op 저장.

### WS-AUTH-01 갭 + 메커니즘 후보 (design 결정)
- **후보 A/C — backend 서명 토큰(HMAC-SHA256 + 공유 AUTH_SECRET, 짧은 만료)**: backend가 `{userId,exp}` 서명 토큰 발급(신규 endpoint 또는 /me 확장) → web가 join에 token 동반 → relay가 AUTH_SECRET로 서명·만료 검증 후 **토큰에서 userId 도출**(클라 주장 무시). HMAC은 JDK `Mac`/Node `crypto` 내장(무라이브러리). stateless·무왕복. **AUTH_SECRET env 신규** 필요. ← spec 노트("JWT 추출·검증 AUTH_SECRET 공유")와 정합, HttpOnly 무관(명시 토큰).
- **후보 B — relay→backend 세션 검증 호출**: relay가 backend에 세션 검증 HTTP 호출. **제약**: ① JSESSIONID가 HttpOnly라 web JS가 쿠키를 읽어 relay에 못 넘김 ② WS 핸드셰이크 쿠키 자동전송은 cross-host/SameSite·포트에 의존(취약) ③ relay→backend 클라이언트 경로 신규 + 연결당 왕복 latency. 세션 revoke 감지는 장점.
- **권고(설계 결정 후보)**: 후보 A/C(HMAC 토큰). HttpOnly·역방향 경로 문제 회피 + 무라이브러리. 만료(짧은 TTL)로 replay 완화, 재연결 시 토큰 재획득.
