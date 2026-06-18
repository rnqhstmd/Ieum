# 06. API & 실시간 프로토콜

> **관련 문서**: [아키텍처](./04-architecture.md) · [데이터 모델](./05-data-model.md) · [CRDT 협업](./07-collaboration-crdt.md) · [인증 & 권한](./08-auth-and-permissions.md)

---

## 1. REST / Route Handler 엔드포인트

### 공통 규칙
- 모든 엔드포인트는 `Auth.js` 세션 쿠키로 인증. 미인증 시 `401 Unauthorized`.
- 에러 응답 형식: `{ "error": "메시지", "code": "ERROR_CODE" }`
- 요청/응답 `Content-Type: application/json`

---

### 1-1. 인증

| Method | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/auth/session` | 현재 세션 조회 |
| `GET` | `/api/auth/signin` | Google OAuth 리다이렉트 시작 (Auth.js 자동 처리) |
| `GET` | `/api/auth/callback/google` | OAuth 콜백 (Auth.js 자동 처리) |
| `POST` | `/api/auth/signout` | 세션 종료 |

**GET /api/auth/session 응답 예시**
```json
{
  "user": {
    "id": "usr_abc123",
    "email": "user@example.com",
    "name": "홍길동",
    "image": "https://lh3.googleusercontent.com/..."
  },
  "expires": "2026-07-18T00:00:00.000Z"
}
```

---

### 1-2. 워크스페이스

| Method | 경로 | 인증/권한 | 설명 |
|--------|------|-----------|------|
| `GET` | `/api/workspaces` | 로그인 필요 | 내 워크스페이스 목록(멤버십 포함) |
| `POST` | `/api/workspaces` | 로그인 필요 | 공유 워크스페이스 생성 (개인은 Google 로그인 시 자동 생성) |
| `GET` | `/api/workspaces/:workspaceId` | OWNER or MEMBER | 워크스페이스 상세 조회 |
| `PATCH` | `/api/workspaces/:workspaceId` | OWNER | 워크스페이스 이름 변경 |
| `DELETE` | `/api/workspaces/:workspaceId` | OWNER | 워크스페이스 삭제 |

**POST /api/workspaces 요청**
```json
{
  "name": "팀 프로젝트 워크스페이스"
}
```

**POST /api/workspaces 응답 (201 Created)**
```json
{
  "id": "ws_xyz789",
  "name": "팀 프로젝트 워크스페이스",
  "type": "SHARED",
  "ownerId": "usr_abc123",
  "createdAt": "2026-06-18T09:00:00.000Z"
}
```

**에러**
- `400 Bad Request` — `{ "error": "이름은 1~100자입니다.", "code": "INVALID_NAME" }`
- `403 Forbidden` — OWNER 전용 작업을 MEMBER가 시도

**GET /api/workspaces 응답**
```json
{
  "workspaces": [
    {
      "id": "ws_personal1",
      "name": "내 워크스페이스",
      "type": "PERSONAL",
      "role": "OWNER"
    },
    {
      "id": "ws_xyz789",
      "name": "팀 프로젝트 워크스페이스",
      "type": "SHARED",
      "role": "MEMBER"
    }
  ]
}
```

---

### 1-3. 멤버십

| Method | 경로 | 인증/권한 | 설명 |
|--------|------|-----------|------|
| `GET` | `/api/workspaces/:workspaceId/members` | OWNER or MEMBER | 멤버 목록 조회 |
| `DELETE` | `/api/workspaces/:workspaceId/members/:userId` | OWNER (자신 제외 가능) or 본인 | 멤버 제거 / 스스로 나가기 |
| `PATCH` | `/api/workspaces/:workspaceId/members/:userId` | OWNER | 역할 변경 |

**GET /api/workspaces/:workspaceId/members 응답**
```json
{
  "members": [
    {
      "userId": "usr_abc123",
      "email": "owner@example.com",
      "name": "홍길동",
      "role": "OWNER",
      "joinedAt": "2026-06-01T00:00:00.000Z"
    },
    {
      "userId": "usr_def456",
      "email": "member@example.com",
      "name": "김철수",
      "role": "MEMBER",
      "joinedAt": "2026-06-10T00:00:00.000Z"
    }
  ]
}
```

---

### 1-4. 초대

| Method | 경로 | 인증/권한 | 설명 |
|--------|------|-----------|------|
| `POST` | `/api/workspaces/:workspaceId/invitations` | OWNER | 이메일 초대 생성 |
| `GET` | `/api/invitations/:token` | 없음(공개 링크) | 초대 정보 조회 |
| `POST` | `/api/invitations/:token/accept` | 로그인 필요 | 초대 수락 |
| `DELETE` | `/api/workspaces/:workspaceId/invitations/:invitationId` | OWNER | 초대 취소 |
| `GET` | `/api/workspaces/:workspaceId/invitations` | OWNER | 대기 중 초대 목록 |

**POST /api/workspaces/:workspaceId/invitations 요청**
```json
{
  "email": "newmember@example.com",
  "role": "MEMBER"
}
```

**POST /api/workspaces/:workspaceId/invitations 응답 (201 Created)**
```json
{
  "id": "inv_qrs000",
  "workspaceId": "ws_xyz789",
  "email": "newmember@example.com",
  "role": "MEMBER",
  "token": "a1b2c3d4-e5f6-...",
  "status": "PENDING",
  "expiresAt": "2026-06-25T09:00:00.000Z"
}
```

**POST /api/invitations/:token/accept 응답 (200 OK)**
```json
{
  "workspaceId": "ws_xyz789",
  "workspaceName": "팀 프로젝트 워크스페이스",
  "role": "MEMBER"
}
```

**에러**
- `404 Not Found` — 토큰 없음 or 이미 소비됨
- `410 Gone` — 만료된 초대 `{ "error": "초대가 만료되었습니다.", "code": "INVITATION_EXPIRED" }`
- `409 Conflict` — 이미 멤버인 사용자 `{ "error": "이미 멤버입니다.", "code": "ALREADY_MEMBER" }`

---

### 1-5. 페이지

| Method | 경로 | 인증/권한 | 설명 |
|--------|------|-----------|------|
| `GET` | `/api/workspaces/:workspaceId/pages/tree` | OWNER or MEMBER | 페이지 트리 전체 조회 |
| `POST` | `/api/workspaces/:workspaceId/pages` | OWNER or MEMBER | 페이지 생성 |
| `GET` | `/api/pages/:pageId` | OWNER or MEMBER | 페이지 메타데이터 조회 |
| `PATCH` | `/api/pages/:pageId` | OWNER or MEMBER | 제목·아이콘·parentPageId·position 수정 |
| `DELETE` | `/api/pages/:pageId` | OWNER or MEMBER | 페이지 아카이브(소프트 삭제) |
| `POST` | `/api/pages/:pageId/restore` | OWNER or MEMBER | 아카이브 복원 |

**GET /api/workspaces/:workspaceId/pages/tree 응답**
```json
{
  "pages": [
    {
      "id": "pg_root01",
      "title": "프로젝트 홈",
      "icon": "🏠",
      "position": 0,
      "parentPageId": null,
      "children": [
        {
          "id": "pg_child01",
          "title": "회의록",
          "icon": null,
          "position": 0,
          "parentPageId": "pg_root01",
          "children": []
        }
      ]
    }
  ]
}
```

**POST /api/workspaces/:workspaceId/pages 요청**
```json
{
  "title": "새 페이지",
  "parentPageId": "pg_root01",
  "position": 1
}
```

**POST /api/workspaces/:workspaceId/pages 응답 (201 Created)**
```json
{
  "id": "pg_new001",
  "workspaceId": "ws_xyz789",
  "title": "새 페이지",
  "icon": null,
  "parentPageId": "pg_root01",
  "position": 1,
  "createdById": "usr_abc123",
  "archivedAt": null,
  "createdAt": "2026-06-18T10:30:00.000Z",
  "updatedAt": "2026-06-18T10:30:00.000Z"
}
```

**PATCH /api/pages/:pageId 요청 (제목 변경 예시)**
```json
{
  "title": "변경된 제목"
}
```

**PATCH /api/pages/:pageId 요청 (이동 예시)**
```json
{
  "parentPageId": "pg_root02",
  "position": 0
}
```

**에러**
- `404 Not Found` — 페이지 없음 또는 접근 권한 없음
- `400 Bad Request` — 자기 자신을 부모로 설정 `{ "error": "순환 참조 불가", "code": "CIRCULAR_REFERENCE" }`

---

## 2. WebSocket 실시간 프로토콜

### 2-1. 연결 및 인증

**엔드포인트**: `wss://realtime.mosaic.app` (또는 개발 시 `ws://localhost:3001`)

**연결 흐름**:
1. 클라이언트는 WebSocket 연결 시 URL 쿼리 파라미터 또는 첫 메시지로 인증 토큰 전달.
2. 서버는 Auth.js 세션 쿠키(Upgrade 요청의 Cookie 헤더) 또는 단기 서명 토큰을 검증.
3. 검증 실패 시 `4001` 코드로 WebSocket 연결 닫기.

```
wss://realtime.mosaic.app?token=<signed-short-lived-token>
```

> 단기 토큰은 `/api/realtime/token` Route Handler에서 발급 (로그인 세션 검증 후 서명, TTL 60초).

---

### 2-2. Room 참여 / 퇴장

연결 후 첫 메시지로 room(페이지) 참여 선언.

**C → S: join**
```json
{
  "type": "join",
  "pageId": "pg_new001"
}
```

**S → C: join-ack**
```json
{
  "type": "join-ack",
  "pageId": "pg_new001",
  "connectedClients": 3
}
```

퇴장은 WebSocket 연결 종료로 자동 처리. 서버는 room 내 다른 클라이언트에게 `presence-leave` 브로드캐스트.

---

### 2-3. 메시지 타입 전체 목록

| 타입 | 방향 | 설명 |
|------|------|------|
| `join` | C→S | room 참여 선언 |
| `join-ack` | S→C | 참여 확인 |
| `sync-request` | C→S | 초기/재접속 동기화 요청 |
| `sync-response` | S→C | snapshot + op 로그 응답 |
| `op` | C→S, S→C | CRDT op 전송 및 브로드캐스트 |
| `op-ack` | S→C | op 영속화 확인 응답 |
| `awareness` | C→S | presence(커서·선택) 업데이트 |
| `presence-update` | S→C | 다른 클라이언트 presence 브로드캐스트 |
| `presence-leave` | S→C | 클라이언트 퇴장 알림 |
| `error` | S→C | 서버 에러 알림 |

---

### 2-4. 동기화: sync-request / sync-response

**C → S: sync-request**
```json
{
  "type": "sync-request",
  "pageId": "pg_new001",
  "knownVersion": 42
}
```
- `knownVersion`: 클라이언트가 마지막으로 적용한 op의 seq 번호. 최초 접속 시 `0` 또는 생략.

**S → C: sync-response**
```json
{
  "type": "sync-response",
  "pageId": "pg_new001",
  "snapshot": {
    "state": { "elements": [...] },
    "version": 40
  },
  "ops": [
    {
      "siteId": "site_abc",
      "seq": 41,
      "opType": "INSERT",
      "payload": {
        "afterId": { "counter": 5, "siteId": "site_abc" },
        "newId": { "counter": 6, "siteId": "site_abc" },
        "value": "안"
      },
      "createdAt": "2026-06-18T10:31:00.000Z"
    },
    {
      "siteId": "site_def",
      "seq": 42,
      "opType": "DELETE",
      "payload": {
        "targetId": { "counter": 3, "siteId": "site_xyz" }
      },
      "createdAt": "2026-06-18T10:31:05.000Z"
    }
  ]
}
```
- `snapshot`이 `null`이면 seq 0부터 op만 존재.
- 클라이언트는 `snapshot`으로 RGA 초기화 후 `ops`를 순서대로 replay.

---

### 2-5. CRDT op 전송 및 브로드캐스트

**C → S: op (Insert)**
```json
{
  "type": "op",
  "pageId": "pg_new001",
  "op": {
    "opType": "INSERT",
    "siteId": "site_abc",
    "seq": 43,
    "payload": {
      "afterId": { "counter": 6, "siteId": "site_abc" },
      "newId": { "counter": 7, "siteId": "site_abc" },
      "value": "녕"
    }
  }
}
```

**C → S: op (Delete)**
```json
{
  "type": "op",
  "pageId": "pg_new001",
  "op": {
    "opType": "DELETE",
    "siteId": "site_abc",
    "seq": 44,
    "payload": {
      "targetId": { "counter": 4, "siteId": "site_xyz" }
    }
  }
}
```

**S → C: op-ack** (op 발신자에게만)
```json
{
  "type": "op-ack",
  "siteId": "site_abc",
  "seq": 43
}
```

**S → C: op** (같은 room의 다른 클라이언트에게 브로드캐스트, 발신자 제외)
```json
{
  "type": "op",
  "pageId": "pg_new001",
  "op": {
    "opType": "INSERT",
    "siteId": "site_abc",
    "seq": 43,
    "payload": {
      "afterId": { "counter": 6, "siteId": "site_abc" },
      "newId": { "counter": 7, "siteId": "site_abc" },
      "value": "녕"
    }
  }
}
```

---

### 2-6. Presence / Awareness

**C → S: awareness** (커서 위치 업데이트)

cursor의 `anchorId`는 RGA 요소의 id(문자 id)를 앵커로 사용. DOM 오프셋이 아닌 CRDT id 기반이므로 동시 편집 중에도 커서 위치가 정확하게 유지된다.

```json
{
  "type": "awareness",
  "pageId": "pg_new001",
  "presence": {
    "userId": "usr_abc123",
    "name": "홍길동",
    "color": "#FF5733",
    "cursor": {
      "anchorId": { "counter": 7, "siteId": "site_abc" },
      "anchorOffset": 0,
      "focusId": { "counter": 7, "siteId": "site_abc" },
      "focusOffset": 0
    },
    "selection": null
  }
}
```

선택 영역이 있는 경우 `selection`:
```json
{
  "type": "awareness",
  "pageId": "pg_new001",
  "presence": {
    "userId": "usr_abc123",
    "name": "홍길동",
    "color": "#FF5733",
    "cursor": null,
    "selection": {
      "anchorId": { "counter": 5, "siteId": "site_abc" },
      "anchorOffset": 0,
      "focusId": { "counter": 9, "siteId": "site_abc" },
      "focusOffset": 0
    }
  }
}
```

**S → C: presence-update** (같은 room의 모든 클라이언트에게 브로드캐스트, 발신자 포함)
```json
{
  "type": "presence-update",
  "pageId": "pg_new001",
  "presence": {
    "userId": "usr_abc123",
    "name": "홍길동",
    "color": "#FF5733",
    "cursor": {
      "anchorId": { "counter": 7, "siteId": "site_abc" },
      "anchorOffset": 0,
      "focusId": { "counter": 7, "siteId": "site_abc" },
      "focusOffset": 0
    },
    "selection": null
  }
}
```

**S → C: presence-leave** (클라이언트 퇴장 시 room 내 전체 브로드캐스트)
```json
{
  "type": "presence-leave",
  "pageId": "pg_new001",
  "userId": "usr_abc123"
}
```

> **비영속 원칙**: presence 데이터는 DB에 저장하지 않는다. 서버 메모리에만 유지하며, 클라이언트 재접속 시 `awareness` 메시지로 재전송하여 복원.

---

### 2-7. 에러

**S → C: error**
```json
{
  "type": "error",
  "code": "UNAUTHORIZED",
  "message": "인증이 필요합니다."
}
```

| code | 설명 |
|------|------|
| `UNAUTHORIZED` | 토큰 없음 또는 만료 |
| `FORBIDDEN` | 페이지 접근 권한 없음 |
| `DUPLICATE_OP` | 이미 처리된 (siteId, seq) |
| `INVALID_MESSAGE` | 메시지 파싱 실패 |

---

## 3. 순서 보장 · 중복 · 재접속 처리 규칙

### 순서 보장
- 각 `siteId`(클라이언트 식별자)는 자신의 op에 대해 **단조 증가 seq**를 부여.
- 서버는 `(siteId, seq)` 쌍으로 DB에 저장. 동일 쌍이 이미 존재하면 `DUPLICATE_OP` 에러 반환.
- 서버가 op를 DB에 append하는 순서가 **브로드캐스트 순서**가 되며, 다른 클라이언트는 이 순서로 op를 수신·적용한다.
- RGA 알고리즘의 tie-break은 `id(counter, siteId)` 비교로 결정론적 처리 — 서버 순서와 무관하게 모든 클라이언트에서 동일 결과 보장.

### 중복 처리
- 클라이언트는 `op-ack` 타임아웃 시 동일 op를 재전송할 수 있다.
- 서버는 `(siteId, seq)` 중복 체크로 이미 영속화된 op를 조용히 무시(ack 재전송).

### 재접속 동기화
1. 클라이언트는 `lastKnownVersion`(마지막 적용 seq)을 로컬에 보관.
2. 재접속 후 `sync-request { knownVersion: N }` 전송.
3. 서버는 `seq > N`인 op를 최신 Snapshot 기준으로 응답.
4. 클라이언트는 delta를 replay하여 상태 복원.
5. 로컬 상태를 완전히 신뢰할 수 없는 경우(첫 접속 또는 로컬 스토리지 없음): `knownVersion: 0` 전송 → 서버가 최신 Snapshot + 이후 op 전체 응답.

---

> 다음: [07-collaboration-crdt.md](./07-collaboration-crdt.md) — RGA CRDT 알고리즘 상세 / [08-auth-and-permissions.md](./08-auth-and-permissions.md) — 인증 및 권한 상세
