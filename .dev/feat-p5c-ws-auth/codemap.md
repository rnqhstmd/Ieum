## 코드 맵: P5 후반 WS 인가 (WS-AUTH-02 멤버십 게이트 + 03 userId 태깅)

### 핵심 파일 (변경/신규)
- `backend/.../user/` (신규 `UserController`) → `GET /api/users/me` — CurrentUserService로 userId 노출(웹이 trust-relay할 신원 획득). [Layer1]
- `backend/.../common/security/CurrentUserService.java` → 세션 OAuth2User→userId 추출(재사용).
- `backend/.../common/security/AccessGuard.java:37` → `requirePageAccess(userId,pageId)`=pageId→workspace→membership(로직 참조, Node가 SQL로 동형 구현).
- (신규) `apps/ws-relay/src/membershipStore.ts` → `MembershipStore` 포트 + `InMemoryMembershipStore`(fake) + isMember. [Layer3]
- (신규) `apps/ws-relay/src/pgMembershipStore.ts` → `PgMembershipStore`(pages⋈memberships 조회).
- `apps/ws-relay/src/server.ts` → join 비동기화: `await membershipStore.isMember(userId,pageId)` false→`close(4003)`, true→userId 소켓 보관+join. op는 joined page만 영속/broadcast(교차 room 마감). append에 userId 전달.
- `apps/ws-relay/src/protocol.ts:8` → `JoinMsg`에 `userId` 추가 + parseClientMessage 검증.
- `apps/ws-relay/src/opStore.ts`·`pgOpStore.ts` → `append(pageId,op,userId)` — created_by_id 태깅. [Layer3/WS-AUTH-03]
- `apps/web/src/lib/realtime/relayClient.ts:74` → join 메시지에 userId 실음. [Layer2]
- `apps/web/src/lib/editor/useCrdtDocument.ts` → /me에서 userId fetch→relayClient join 배선.
- (신규) `apps/web/src/lib/auth/currentUser.ts` → `/api/users/me` fetch util.

### 설정 / DDL
- (신규) `backend/.../db/migration/V4__crdt_ops_created_by.sql` → `crdt_ops`에 `created_by_id uuid REFERENCES users(id)`(nullable) 추가 — WS-AUTH-03 userId 태깅.
- `backend/.../db/migration/V1__init.sql:32` → `memberships(user_id,workspace_id,role)` UNIQUE(user_id,workspace_id) — 인가 조회 정본.
- `backend/.../db/migration/V1__init.sql:59` → `pages(id,workspace_id,...)` — pageId→workspace_id.

### 환경/결정
- 인증=**trust-relay userId**(웹이 /me로 얻은 실 userId를 join에 실음, 검증은 mock=신뢰 중계 — BR-5 연장). 멤버십은 Node가 DB로 실 검증(close 4003).
- 교차 room op 영속화 공백(슬라이스1 문서화)을 joined-page-only 영속화로 마감.
- WS-AUTH-04(멤버 제거 강제종료)=P7 의존 연기, WS-AUTH-05(64KB)=완료.
- 적층: feat/p5c-ws-auth ← feat/p5b-op-persistence(PR #14 미머지).
