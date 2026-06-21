# PRD: P5 WebSocket Relay Walking Skeleton

## 배경

P4b(PR #9)에서 2-level 블록 RGA CRDT 코어(`@ieum/crdt`)와 wire 봉투 codec(`toWire`/`fromWire`)이 완성되었다. 그러나 현재 에디터(`EditorContainer`)는 CRDT 상태와 연결되지 않은 순수 로컬 상태로 동작하며, WebSocket 인프라가 존재하지 않는다. 같은 페이지를 두 탭에서 열어도 편집 내용이 상대 탭에 전달되지 않는다.

이번 슬라이스 목표는 "단일 op → WebSocket 전송 → 서버 broadcast → 수신 탭 적용 → 화면 반영"의 전 구간을 최소로 동작시키는 walking skeleton을 완성하는 것이다. DB 영속화, 재접속 복원, presence 등은 후속 슬라이스에서 구현한다.

현재 제품 상태 요약:
- `@ieum/crdt`: `applyDocOp`, `docToBlocks`, `toWire`/`fromWire` 등 공개 API 완비 (P4b 완료)
- `apps/web`: 에디터는 `EditorDoc` 순수 로컬 상태로 동작, CRDT 미연결
- relay 서버: 존재하지 않음 (신규 생성 필요)
- WebSocket 클라이언트 훅: 존재하지 않음

## 목표

- 두 브라우저 탭에서 같은 pageId 페이지를 열었을 때, 한 탭의 인라인 텍스트 편집이 상대 탭 화면에 실시간 반영된다.
- 성공 지표: 탭 A에서 문자 1개 입력 시 탭 B 화면에 해당 문자가 나타날 때까지 걸리는 체감 지연이 로컬 네트워크에서 인지되지 않는 수준 (walking skeleton 기준, 성능 최적화 제외).

## 범위

**이번 슬라이스에 포함:**

1. **relay 서버** (`apps/ws-relay`): room(pageId 단위) 관리, `join` / `join-ack` / `op`(C→S 수신 후 broadcast, 발신자 제외) / `op-ack`(발신자에게) 처리
2. **클라이언트 송신**: 로컬 편집 발생 시 `@ieum/crdt`의 op를 wire 봉투로 직렬화하여 WebSocket으로 전송
3. **클라이언트 수신**: 서버에서 broadcast된 op 메시지를 수신하여 `applyDocOp`로 CRDT 상태에 적용 후 화면 재렌더링
4. **에디터 CRDT 연결**: `EditorContainer`를 `@ieum/crdt` `DocState`를 진실 원천으로 사용하도록 연결 (현재 순수 로컬 `EditorDoc` 상태 대체)
5. **2탭 라이브 수렴**: 같은 pageId room의 두 탭이 편집 결과를 실시간으로 수렴

## 범위 밖 (Out of Scope)

다음은 이번 슬라이스에 포함하지 않는다. 후속 슬라이스(P5 후반 / P6 / P8)에서 구현한다.

| 항목 | 후속 슬라이스 |
|------|-------------|
| CrdtOp DB 영속화 (PostgreSQL append-only) | P5 후반 |
| `sync-request` / `sync-response` (snapshot 초기로드) | P8 |
| 재접속 시 missing-op 재전송 | P8 |
| presence / awareness / 커서 표시 | P6 |
| 인증 토큰 정식 검증 (Auth.js 세션 / 서명 토큰) | 후속 슬라이스 — walking skeleton에서는 최소/목 처리 허용. 인증 강화는 후속 슬라이스에서 완성함을 명시 |
| 블록 단위 op (block-insert / block-delete / block-set-type) 실시간 전송 | 후속 구현 (walking skeleton은 인라인 INSERT/DELETE로 충분) |
| `error` 메시지 처리 UI | 후속 구현 |

## 요구사항

### 기능 요구사항

- [Must] FR-1: relay 서버가 `ws://localhost:3001` 에서 WebSocket 연결을 수락한다.
- [Must] FR-2: 클라이언트가 연결 후 `join` 메시지(pageId 포함)를 전송하면 서버는 해당 pageId room에 클라이언트를 등록하고 `join-ack`(pageId, connectedClients 포함)를 반환한다.
- [Must] FR-3: 클라이언트가 `op` 메시지(C→S 형식)를 전송하면 서버는 같은 pageId room의 다른 클라이언트에게 동일한 `op` 메시지를 broadcast하고(발신자 제외), 발신자에게 `op-ack`(siteId, seq 포함)를 반환한다.
- [Must] FR-4: 에디터에서 인라인 텍스트 변경이 발생하면 `@ieum/crdt`의 op를 생성하고, `toWire`로 wire 봉투로 직렬화하여 WebSocket `op` 메시지로 전송한다.
- [Must] FR-5: WebSocket으로 수신한 `op` 메시지(S→C broadcast)를 `fromWire`로 역직렬화하고 `applyDocOp`로 로컬 CRDT 상태에 적용하여 화면을 재렌더링한다.
- [Must] FR-6: 에디터는 `@ieum/crdt` `DocState`를 진실 원천으로 사용하여 `docToBlocks`로 렌더링한다.
- [Should] FR-7: WebSocket 연결이 끊기면 클라이언트는 재연결을 시도한다(walking skeleton 수준의 단순 retry — 재접속 후 missing-op 복원은 P8 범위).

### 비즈니스 규칙

- [Must] BR-1: 메시지 타입·필드명은 `requirements/06-api-and-realtime.md` §2 규격을 정확히 따른다. (`type: "join"`, `type: "join-ack"`, `type: "op"`, `type: "op-ack"`, `pageId`, `connectedClients`, `siteId`, `seq`, `opType`, `payload` 필드명 준수)
- [Must] BR-2: broadcast 시 op 발신자(sender) 자신에게는 op를 재전송하지 않는다.
- [Must] BR-3: op 메시지의 `op` 객체 구조는 wire 봉투 규격(`WireEnvelope { siteId, seq, opType, payload }`)을 따른다.
- [Must] BR-4: 수신한 op는 `applyDocOp`(인과 버퍼 포함)를 통해 적용되어야 한다. 클라이언트는 op를 직접 CRDT 구조에 삽입하지 않는다.
- [Must] BR-5: 인증은 이번 슬라이스에서 최소/목 처리(연결 허용)로 구현하며, 정식 검증은 후속 슬라이스에서 강화한다.
- [Should] BR-6: room에 클라이언트가 혼자 접속한 경우(`connectedClients: 1`), `join-ack`는 정상 반환하고 broadcast 대상이 없어도 오류 없이 동작한다.
- [Should] BR-7: 동일한 op(`siteId` + `seq` 동일)를 중복 수신한 경우, `applyDocOp`의 멱등성에 의해 CRDT 상태는 변경되지 않는다(이미 P4 검증 완료, relay 서버의 중복 필터링은 이번 범위 밖).

## 사용자 시나리오

**정상 흐름 — 2탭 실시간 수렴**

1. 사용자가 브라우저 탭 A와 탭 B에서 같은 pageId 페이지를 연다.
2. 탭 A, 탭 B 각각 WebSocket 연결 후 `join { pageId }` 전송 → 서버로부터 `join-ack` 수신.
3. 탭 A에서 인라인 텍스트에 "안" 입력 → 로컬 CRDT에 즉시 적용(화면 반영) → `op` 메시지 서버 전송.
4. 서버는 탭 B에게 동일한 `op` broadcast → 탭 A에게 `op-ack` 반환.
5. 탭 B는 `op` 수신 → `applyDocOp` → 화면에 "안" 표시.

**엣지 케이스 — 혼자 접속**: 탭이 1개만 room에 있을 때 편집 시 `op` 전송 → 서버가 broadcast 대상 없음을 조용히 처리 → `op-ack` 정상 반환. 사용자에게 오류 없음.

**엣지 케이스 — 발신자 자기 op 미수신**: 탭 A가 전송한 `op`는 탭 A 자신에게 broadcast되지 않는다. 탭 A는 이미 로컬 CRDT에 적용했으므로 중복 적용 없음.

**엣지 케이스 — 인과 순서 역전**: 네트워크 지연으로 op B가 op A보다 먼저 도착한 경우, `applyDocOp`의 인과 버퍼가 op A 도착을 대기 후 순서대로 적용(P4 검증 완료 기능).

## 영향 범위

- **영향받는 기존 기능**: `EditorContainer` — 순수 로컬 `EditorDoc` 상태가 `@ieum/crdt` `DocState`로 교체됨. 기존 블록 편집 UX(타이핑, Enter, Backspace, 마크다운 단축키)는 동일하게 동작해야 한다.
- **기존 사용자 영향**: 에디터 로컬 편집 동작은 변경 없음. 초기 로드 시 CRDT 초기 상태(빈 문서)에서 시작(sync-request 구현 전이므로 reload 시 내용 유실 — walking skeleton 범위 내 허용).
- **신규 의존**: relay 서버(`apps/ws-relay`) 추가. 클라이언트는 `NEXT_PUBLIC_WS_URL`(기본: `ws://localhost:3001`) 환경변수로 연결.

## 수용 기준

**AC-1: relay 서버 WebSocket 수락**
```
Given: relay 서버가 ws://localhost:3001 에서 실행 중
When: 클라이언트가 WebSocket 연결을 시도
Then: 연결이 수립되고(open 이벤트 발생) 서버가 연결을 거부하지 않음 → [FR-1]
```

**AC-2: join → join-ack**
```
Given: 클라이언트가 WebSocket 연결된 상태
When: {"type":"join","pageId":"pg_test001"} 메시지를 전송
Then: 서버가 {"type":"join-ack","pageId":"pg_test001","connectedClients": N} 형식의 메시지를 해당 클라이언트에게 반환 (N ≥ 1) → [FR-2, BR-1]
```

**AC-3: op broadcast — 발신자 제외**
```
Given: 클라이언트 A, B가 모두 pageId="pg_test001" room에 join된 상태
When: 클라이언트 A가 {"type":"op","pageId":"pg_test001","op":{"opType":"INSERT","siteId":"site_a","seq":1,"payload":{...}}} 전송
Then: 클라이언트 B가 동일한 op 메시지를 수신하고, 클라이언트 A는 해당 op를 재수신하지 않음 → [FR-3, BR-2]
```

**AC-4: op-ack 발신자 반환**
```
Given: 클라이언트 A가 pageId room에 join된 상태
When: 클라이언트 A가 op 메시지(siteId:"site_a", seq:1)를 전송
Then: 클라이언트 A가 {"type":"op-ack","siteId":"site_a","seq":1} 메시지를 수신 → [FR-3, BR-1]
```

**AC-5: 클라이언트 송신 — wire 봉투 직렬화**
```
Given: 에디터가 WebSocket으로 서버와 연결되고 join-ack를 받은 상태
When: 사용자가 인라인 텍스트에 문자 1개를 입력하여 INSERT op가 생성됨
Then: WebSocket으로 전송된 메시지가 {"type":"op","pageId":"<pageId>","op":{"opType":"INSERT","siteId":"<siteId>","seq":<n>,"payload":{...}}} 형식이고, op.payload가 toWire 결과의 payload 필드와 일치 → [FR-4, BR-1, BR-3]
```

**AC-6: 클라이언트 수신 — CRDT 적용 후 화면 반영**
```
Given: 탭 B가 pageId room에 join된 상태이고, 로컬 CRDT DocState가 초기화됨
When: 서버로부터 {"type":"op","pageId":"<pageId>","op":{...INSERT op...}} 메시지를 수신
Then: 탭 B 화면의 해당 블록 텍스트에 INSERT op의 value가 반영되고, applyDocOp가 호출됨(docToBlocks 결과가 변경됨) → [FR-5, BR-4]
```

**AC-7: 에디터 CRDT 진실 원천**
```
Given: EditorContainer가 @ieum/crdt DocState를 상태로 보유
When: 로컬 편집(타이핑)이 발생
Then: docToBlocks(DocState)의 결과가 화면에 렌더링되며, 기존 EditorDoc 배열이 아닌 DocState가 진실 원천으로 동작 → [FR-6]
```

**AC-8: 2탭 라이브 수렴**
```
Given: 탭 A, 탭 B가 같은 pageId로 join 완료된 상태
When: 탭 A에서 인라인 블록에 문자 "안"을 입력
Then: 탭 B 화면의 같은 위치에 "안"이 표시되고, 두 탭의 docToBlocks 결과가 동일 (로컬 네트워크 기준, Playwright e2e 검증) → [FR-4, FR-5, FR-6, US-CRDT-01]
```

**AC-9: 혼자 접속 시 오류 없음**
```
Given: pageId room에 클라이언트가 1개만 접속한 상태
When: 해당 클라이언트가 op 메시지를 전송
Then: 서버가 op-ack를 반환하고, broadcast 대상이 없어도 서버 프로세스가 비정상 종료되지 않음(이후 메시지도 계속 처리) → [FR-3, BR-6]
```

**AC-10: 발신자 자기 op 미중복 적용**
```
Given: 탭 A가 로컬에서 INSERT op를 생성하고 CRDT에 즉시 적용한 상태
When: 탭 A가 해당 op를 서버에 전송하고 op-ack를 수신
Then: 탭 A의 CRDT 상태가 변경되지 않음 (동일 op 재수신 없음, docToBlocks 결과 불변) → [FR-3, BR-2, BR-7]
```

## 리스크

| 리스크 | 영향 | 완화 |
|--------|------|------|
| EditorContainer CRDT 연결 시 기존 로컬 편집 UX 회귀 | 타이핑 / Enter / Backspace / 마크다운 단축키가 깨질 수 있음 | AC-7을 기준으로 기존 편집 동작을 unit 테스트로 선보호 후 교체 |
| walking skeleton 인증 미적용으로 인한 임시 보안 노출 | relay 서버 개발 환경에서 인증 없이 연결 수락 | 개발 환경(`localhost`)에서만 동작, BR-5 명시, 후속 슬라이스 인증 강화 일정 확인 필요 |
| reload 시 편집 내용 유실 | 사용자 경험 저하 (walking skeleton 범위 내 허용) | 범위 밖 명시. P8 sync-request에서 해결 |

---
*작성: product-owner (gx-tdd phase-requirements). G-W-T 게이트 PASS (AC-1~10). 사용자 승인 2026-06-20.*
