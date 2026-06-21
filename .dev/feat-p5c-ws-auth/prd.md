# PRD: P5 후반 WS 인가 (WS-AUTH-02 멤버십 게이트 + WS-AUTH-03 userId 태깅)

## 배경
P5/P6 realtime는 BR-5 mock 인증(siteId 기반 mock 신원)으로 동작해, **누구나 연결해 임의 page에 op를 영속/중계**할 수 있다(슬라이스1에서 문서화한 교차 room 영속화 인가 공백). 이 슬라이스는 mock→실 신원으로 한 걸음 나아가, **실 userId 기반 멤버십 인가**를 도입한다(WS-AUTH-02) 그리고 **서버가 op에 인증 userId를 태깅**한다(WS-AUTH-03).

전제 격차: 웹 realtime는 실 userId가 없다(백엔드에 `/me` 엔드포인트 부재, dashboard 스텁). 따라서 3계층으로 구현한다 — ① 백엔드 `/api/users/me`(인증 userId 노출, `CurrentUserService` 재사용) ② 웹이 userId를 fetch해 join에 trust-relay ③ Node가 `memberships` DB 조회로 인가(비멤버 `close(4003)`) + op에 userId 태깅(`crdt_ops.created_by_id`, Flyway V4).

인증 모델: **trust-relay userId**(웹이 보낸 userId를 신뢰 중계 — displayName과 동형, BR-5 연장). 멤버십은 Node가 DB로 실 검증한다. 신원 위조 방지(서명·세션 검증)는 후속 강화.

## 범위
### In-Scope
- `GET /api/users/me` — 인증된 사용자의 `{id,email,name}` 반환(미인증 401).
- 웹: `/api/users/me`로 userId 획득 → WS join 메시지에 `userId` 실음.
- Node: `MembershipStore` 포트(InMemory + Pg). join 시 `isMember(userId,pageId)` 검증 — 비멤버 `close(4003)`, 멤버만 합류.
- op 영속화/broadcast는 **연결이 인가 합류한 page로만**(교차 room 영속화 공백 마감).
- WS-AUTH-03: 영속 op에 연결 userId 태깅 — `crdt_ops.created_by_id`(Flyway V4).

### Out-of-Scope
- 신원 위조 방지(세션/서명 검증) — trust-relay 유지, 후속.
- WS-AUTH-04(멤버 제거→WS 강제종료) — 멤버 제거 API(P7) 의존, 연기.
- WS-AUTH-05(64KB 상한) — 이미 구현(maxPayload).
- 자동저장 클라 배선(US-EDIT-02), e2e — 별도 슬라이스.

## 요구사항
### [Must]
- **M1**: `GET /api/users/me`가 인증 사용자의 id를 반환한다(미인증 401).
- **M2**: 멤버는 해당 page에 join 인가되고, 비멤버는 `close(4003)`로 거부되어 room에 합류하지 못한다.
- **M3**: Node가 `memberships`(pageId→workspace→user) DB 조회로 멤버십을 판정한다.
- **M4**: 영속 op에 서버가 연결의 인증 userId를 `crdt_ops.created_by_id`로 태깅한다(op payload siteId 아님).
### [Should]
- **S1**: 연결이 인가 합류한 page와 다른 pageId op는 영속·broadcast되지 않는다(교차 room 마감).
- **S2**: 웹이 `/api/users/me`로 userId를 얻어 join에 실어 보낸다.
- **S3**: userId 없는/형식 위반 join은 거부된다(`close(4003)` 또는 무시).

## 수용 기준 (Given-When-Then)

### AC-1 — /api/users/me 인증 사용자 id 반환 `[Must M1]`
- **Given**: 사용자 U가 로그인된(인증된) 세션을 가진다
- **When**: `GET /api/users/me`를 호출한다
- **Then**: 200 응답 + body의 `id`가 U의 `users.id`와 같다(`email`,`name` 포함)

### AC-2 — 미인증 401 `[Should S?]`
- **Given**: 인증 세션이 없다
- **When**: `GET /api/users/me`를 호출한다
- **Then**: 401 응답이 반환된다

### AC-3 — 멤버 join 인가 `[Must M2]`
- **Given**: 사용자 U가 page P의 워크스페이스 멤버이다(`isMember(U,P)`=true로 구성)
- **When**: U가 `{type:'join', pageId:P, userId:U}`로 접속한다
- **Then**: join-ack가 반환되고 U가 room P에 합류한다(`roomSize(P)`가 1 증가)

### AC-4 — 비멤버 close(4003) `[Must M2]`
- **Given**: 사용자 X가 page P 워크스페이스의 비멤버이다(`isMember(X,P)`=false)
- **When**: X가 `{type:'join', pageId:P, userId:X}`로 접속한다
- **Then**: 연결이 code **4003**으로 닫히고, join-ack가 없으며, `roomSize(P)`가 증가하지 않는다

### AC-5 — 멤버십 DB 조회 `[Must M3]`
- **Given**: page P가 workspace W에 속하고 U는 W 멤버, X는 비멤버(testcontainers 픽스처)
- **When**: `PgMembershipStore.isMember(U,P)`와 `isMember(X,P)`를 호출한다
- **Then**: 각각 `true`, `false`를 반환한다

### AC-6 — op userId 서버 태깅 `[Must M4]`
- **Given**: U가 page P에 인가 합류한 연결, V4 적용 DB
- **When**: U의 연결이 P에 유효 op를 전송해 영속된다
- **Then**: 해당 `crdt_ops` 행의 `created_by_id`가 연결의 인증 userId U와 같다(op의 siteId가 아님)

### AC-7 — 교차 room op 미영속/미전파 `[Should S1]`
- **Given**: U가 page P에 인가 합류
- **When**: U의 연결이 `pageId=Q`(Q≠P)인 op를 전송한다
- **Then**: 그 op는 `crdt_ops`에 영속되지 않고 broadcast되지 않으며 op-ack도 없다

### AC-8 — 웹 join에 userId 실음 `[Should S2]`
- **Given**: 웹이 `/api/users/me`에서 userId U를 획득한다
- **When**: relayClient가 join을 송신한다
- **Then**: 전송된 join 메시지에 `userId:U`가 포함된다

---

## 확인이 필요한 사항
추가 확인 사항 없음. (인증 메커니즘=trust-relay userId+membership, 범위=02+03/04연기, 3계층 전체 구현은 선행 AskUserQuestion에서 확정.)
