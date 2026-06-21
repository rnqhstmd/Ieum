# 설계: P5 후반 WS 인가 (WS-AUTH-02 멤버십 게이트 + 03 userId 태깅)

## 설계 규모: 대형 (3계층)
백엔드(엔드포인트+V4) + Node(포트+게이트+태깅) + 웹(신원 fetch+배선).

## 핵심 설계 결정

### D1. 백엔드 `GET /api/users/me` (Layer1)
- 신규 `UserController`(`com.ieum.user`): `CurrentUserService`로 인증 userId 추출 → `UserRepository`로 `{id,email,name}` 반환.
- 미인증은 Spring Security(`/api/**`→`JsonAuthenticationEntryPoint`)가 자동 401(기존 동작) → 별도 코드 불요(AC-2).
- 인증 사용자는 OAuth2 로그인 세션의 principal에서 식별(`CurrentUserService` 재사용, 기존 컨트롤러와 동형).

### D2. Flyway V4 — crdt_ops.created_by_id (Layer1/WS-AUTH-03)
```sql
-- V4__crdt_ops_created_by.sql
ALTER TABLE crdt_ops ADD COLUMN created_by_id uuid REFERENCES users (id);
```
- nullable — 기존 행·userId 없는 경로(InMemory)는 null. 인가 합류 연결의 op는 연결 userId로 채워진다(AC-6).

### D3. MembershipStore 포트 (Layer3, OpStore와 동형 격리)
```ts
// membershipStore.ts
export interface MembershipStore {
  isMember(userId: string, pageId: string): Promise<boolean>;
  close?(): Promise<void>;
}
class InMemoryMembershipStore { // fake: 허용 (userId,pageId) 쌍 집합
  allow(userId, pageId); async isMember(...) { return set.has(`${userId}|${pageId}`); }
}
```
- `PgMembershipStore`: `SELECT 1 FROM pages p JOIN memberships m ON m.workspace_id = p.workspace_id WHERE p.id = $1 AND m.user_id = $2 LIMIT 1`. 행 있으면 true. invalid uuid(22P02)→false(catch).

### D4. server 어댑터 join 비동기 멤버십 게이트 (Layer3, WS-AUTH-02)
```ts
// 소켓별 상태
let connUserId: string | null = null;
let connPage: string | null = null;   // 인가 합류한 page (교차 room 마감 기준)
// join 분기 (async)
const ok = await membershipStore.isMember(msg.userId, msg.pageId);
if (!ok) { socket.close(4003, 'forbidden'); return; }   // AC-4 비멤버
connUserId = msg.userId; connPage = msg.pageId;
sendAll(registry.join(handle, msg.pageId, msg.presence)); // AC-3 멤버
```
- join도 비동기화 → 소켓별 promise 체인에 포함(op와 동일 직렬화).

### D5. op 인가·태깅 (Layer3, WS-AUTH-03 + S1)
```ts
// op 분기: 인가 합류 page로만 영속/전파 (교차 room 마감, AC-7)
if (connPage === null || opMsg.pageId !== connPage) return; // 미영속·무전파·무ack
const outcome = await opStore.append(opMsg.pageId, opMsg.op, connUserId); // userId 태깅
sendAll(registry.handleOp(handle, opMsg, outcome));
```
- `OpStore.append(pageId, op, userId?)` — 시그니처 확장(userId 옵셔널). InMemory 무시, PgOpStore는 `created_by_id`에 저장. 기존 slice1 호출부(테스트)는 userId 생략 → null(nullable 컬럼).

### D6. 웹 신원 배선 (Layer2)
- 신규 `apps/web/src/lib/auth/currentUser.ts`: `fetchCurrentUserId(): Promise<string|null>` — `GET /api/users/me`(credentials include), 401→null.
- `relayClient`: 생성 opts에 `userId?` 추가 → join 메시지에 `{type:'join', pageId, userId, presence}`.
- `useCrdtDocument`: 마운트 시 `fetchCurrentUserId()` → relayClient에 userId 전달.

### D7. protocol JoinMsg.userId (Layer3)
- `JoinMsg`에 `userId: string` 추가. `parseClientMessage` join 분기: `typeof o.userId === 'string'` 필수(없으면 join 거부 → 서버는 close 4003 또는 무시, S3). 길이 상한(MAX_SITE_ID 동형) 가드.

## 변경 범위
### 신규
- `apps/ws-relay/src/membershipStore.ts`, `apps/ws-relay/src/pgMembershipStore.ts`
- `backend/.../user/UserController.java` (+ MeResponse)
- `backend/.../db/migration/V4__crdt_ops_created_by.sql`
- `apps/web/src/lib/auth/currentUser.ts`
### 수정
- `apps/ws-relay/src/protocol.ts`(JoinMsg.userId+parse), `server.ts`(async join 게이트+op 인가/태깅), `opStore.ts`·`pgOpStore.ts`(append userId), `index.ts`(MembershipStore export), `main.ts`(PgMembershipStore 주입)
- `apps/web/src/lib/realtime/relayClient.ts`, `apps/web/src/lib/editor/useCrdtDocument.ts`
- 테스트: server.test/room/pgOpStore.int(userId), web relayClient/useCrdtDocument

## 구현 순서 (RGR)
- **T1** 백엔드 `/api/users/me` + V4 마이그레이션. [AC-1,2 / V4 for AC-6]
- **T2** MembershipStore 포트 + InMemory + Pg. [AC-5]
- **T3** protocol userId + server join 비동기 멤버십 게이트(close 4003). [AC-3,4]
- **T4** op 인가(교차 room 마감) + userId 태깅(append userId→created_by_id). [AC-6,7]
- **T5** 웹 /me fetch + relayClient/useCrdtDocument join userId. [AC-8]

## 신뢰 경계
- trust-relay: userId는 클라가 주장(검증 안 함, BR-5) — 멤버십은 DB 실검증. 신원 위조는 후속(127.0.0.1 바인딩 containment 유지).
- 멤버십은 DB가 정본. join마다 1회 조회(연결 수명 캐시 — 본 슬라이스는 매 join 조회, 멤버 제거 반영(WS-AUTH-04)은 P7 연기).

---

## Testability 평가 (test-architect)

### 컴포넌트별 전략
#### /api/users/me (백엔드)
- 통합: 기존 AbstractIntegrationTest(testcontainers) 기반 — 인증 요청→200+id, 미인증→401. 모의: 인증 principal(기존 테스트 헬퍼). AC-1,2.
#### MembershipStore
- InMemory: 순수 단위(allow 후 isMember true/false). Pg: testcontainers(V1~V4 + user/workspace/membership/page 픽스처). AC-5.
#### server join 게이트
- 통합(ws + fake MembershipStore): false→`close(4003)` 코드·미합류 단언, true→join-ack. 모의: MembershipStore(fake). DI 격리. AC-3,4.
#### op 인가·태깅
- 통합: fake OpStore로 교차 room(connPage≠pageId)→append 미호출 단언(AC-7). pgOpStore.int에 userId 케이스 추가→created_by_id 단언(AC-6).
#### 웹 신원
- 단위: fetch mock으로 fetchCurrentUserId(401→null), relayClient join 메시지 userId 포함 단언. AC-8.

### Testability Score: 9/10
### 판정
- ✅ **TESTABILITY PASS** — MembershipStore/OpStore 포트 DI로 핵심 로직 격리, join 게이트·태깅은 fake 주입으로 단위/통합. 유일 I/O(Pg·HTTP)는 testcontainers/fetch mock. -1: 백엔드 인증 principal 셋업이 환경 의존(기존 harness로 해소).
