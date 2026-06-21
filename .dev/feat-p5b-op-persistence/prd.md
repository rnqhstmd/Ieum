# PRD: P5 후반 — op 영속화 (Node ws-relay → Postgres `crdt_ops`)

## 배경

P5 walking skeleton(PR #10)은 in-memory relay로 2탭 실시간 수렴까지만 구현했고 **op 영속화가 없다**. 따라서 모든 클라이언트가 연결을 끊으면 편집 내용이 사라지고, 재접속 시 복원할 소스(op 로그)가 없다 — 이것이 현재 가장 큰 데이터 유실 구멍이다.

SSOT(`context/collaboration/architecture.md`)는 **"relay 서버(Node.js+ws) = op 수신 → DB 영속화 → broadcast"**를 정본 설계로 명시한다. Spring `collaboration` 모듈(`OpService.handleOp`가 `UnsupportedOperationException` 스텁)은 골격 이후 미배선된 폐기 스캐폴드이며, 웹 클라는 Node relay(`ws://localhost:3001`)에만 접속한다. 따라서 **Node ws-relay가 op 영속화를 직접 소유**한다(사용자 확정). DDL(`crdt_ops` 스키마)은 Spring/Flyway가 소유하므로 스키마 변경은 Flyway 마이그레이션으로 처리한다.

대상 요구사항: **US-CRDT-02**("모든 op가 CrdtOp 테이블에 append-only로 저장"), **US-CRDT-03**("CrdtOp append-only 보장, 감사 추적"). 재접속 replay/Snapshot 복원(US-CRDT-02 읽기 경로)은 P8로 분리한다 — 이 슬라이스는 **write(append) 경로**만 닫는다.

## 범위

### In-Scope
- Node ws-relay가 수신한 모든 유효 op를 Postgres `crdt_ops`에 append-only INSERT.
- `(page_id, site_id, seq)` 유니크 제약 기반 멱등 처리(중복 op 무시 + ack 재전송).
- wire `opType` 5종(`insert`/`delete`/`block-insert`/`block-delete`/`block-set-type`) 수용 — Flyway **V3** 마이그레이션으로 `crdt_ops.op_type` CHECK 확장.
- 영속화 포트(`OpStore`) 추상화 + `InMemoryOpStore`(fake/fallback) + `PgOpStore`(실 DB).
- `RoomRegistry.handleOp` 순수성 유지(영속화 outcome 주입), 비동기 I/O는 서버 어댑터가 담당.
- DB 미구성 시 `InMemoryOpStore` fallback(기존 walking skeleton/테스트 회귀 0).

### Out-of-Scope (후속 슬라이스/Phase)
- 재접속 시 op replay·Snapshot 복원(US-CRDT-02 읽기) → **P8**.
- WS 연결 인가(WS-AUTH-01~05) → 다음 슬라이스.
- 자동저장 클라 배선(US-EDIT-02) → 다음 슬라이스.
- presence/cursor 영속화(설계상 비영속 유지).
- Snapshot 생성/압축.

## 요구사항

### [Must]
- **M1**: relay가 수신한 유효 op를 `crdt_ops`에 1행 append(append-only — 기존 행 UPDATE/DELETE 금지).
- **M2**: 동일 `(page_id, site_id, seq)` 중복 op는 추가 INSERT 없이 멱등 처리하고, 발신자에 op-ack를 재전송한다.
- **M3**: wire `opType` 5종을 모두 `crdt_ops.op_type`에 저장 가능(CHECK 위반 0) — Flyway V3 마이그레이션.
- **M4**: 존재하지 않거나 형식이 잘못된 `pageId` op는 INSERT/broadcast/ack 없이 거부하며 서버를 중단시키지 않는다.
- **M5**: `RoomRegistry.handleOp`는 I/O 없는 순수 함수로 유지하고, 영속화 결과(`persisted`|`duplicate`|`rejected`)에 따라 Dispatch[]를 결정한다.

### [Should]
- **S1**: op는 영속화 성공 후에만 broadcast된다(미영속 op 전파 금지). op-ack는 영속화 확인 응답이다.
- **S2**: `server_seq`(DB IDENTITY)는 삽입 순서대로 단조 증가하여 후속 replay 정렬의 기준이 된다.
- **S3**: `DATABASE_URL` 미설정 시 `InMemoryOpStore`로 동작하여 기존 2탭 broadcast 동작에 회귀가 없다.

### [Could]
- **C1**: 거부된 op(rejected) 발생 시 진단 로그를 남긴다(원인: invalid UUID / FK 위반).

## 수용 기준 (Given-When-Then)

### AC-1 — 유효 op append-only 영속화 + ack + broadcast `[Must M1]`
- **Given**: `pages`에 존재하는 pageId `P`, 비어있는 `crdt_ops`, room에 발신자 외 peer 1명 접속
- **When**: relay가 `{type:'op', pageId:P, op:{siteId:'s1', seq:1, opType:'insert', payload:{...}}}`를 수신한다
- **Then**: `crdt_ops`에 `(page_id=P, site_id='s1', seq=1, op_type='insert', payload=수신 op, server_seq 부여됨)` 1행이 INSERT되고, 발신자에 `op-ack{siteId:'s1', seq:1}` 1건 + peer에 동일 op broadcast 1건이 dispatch된다

### AC-2 — 멱등(중복 op) `[Must M2]`
- **Given**: `(P,'s1',1)` op가 이미 `crdt_ops`에 1행 영속화되어 있다
- **When**: 동일 `(P,'s1',1)` op가 다시 수신된다
- **Then**: `crdt_ops` 행 수가 그대로 1(중복 INSERT 0)이고, 발신자에 `op-ack{siteId:'s1',seq:1}` 1건이 재전송되며, peer broadcast는 0건이다

### AC-3 — append-only & server_seq 단조 `[Must M1 / Should S2]`
- **Given**: 비어있는 `crdt_ops`, `pages`에 `P` 존재
- **When**: `(P,'s1',1)`, `(P,'s2',1)`, `(P,'s1',2)` 3개 op를 순차 영속화한다
- **Then**: `crdt_ops`에 3행이 존재하고 각 행의 `server_seq`가 삽입 순서대로 단조 증가(`s1.1 < s2.1 < s1.2`)하며, 영속화 과정에서 어떤 기존 행도 UPDATE/DELETE되지 않는다

### AC-4 — wire opType 5종 수용 `[Must M3]`
- **Given**: V3 마이그레이션이 적용된 DB, `pages`에 `P` 존재
- **When**: `opType`이 각각 `'insert'`, `'delete'`, `'block-insert'`, `'block-delete'`, `'block-set-type'`인 op 5개를 영속화한다
- **Then**: 5행 모두 INSERT에 성공(op_type CHECK 위반 0건)하고, 각 행의 `op_type` 값이 대응하는 wire `opType` 문자열과 동일하다

### AC-5 — rejected(잘못된 pageId) `[Must M4]`
- **Given**: `pages`에 존재하지 않는 UUID `Q`(또는 UUID 형식이 아닌 문자열)
- **When**: relay가 `pageId=Q`인 유효 형식의 op를 수신한다
- **Then**: `crdt_ops` INSERT 0행, peer broadcast 0건, 발신자 op-ack 0건이며, 서버 프로세스는 예외 전파 없이 계속 동작한다(이후 정상 op는 정상 처리)

### AC-6 — 영속화 선행 후 broadcast `[Should S1]`
- **Given**: `opStore.append`가 거부/실패(`rejected`)를 반환하도록 강제된 상태
- **When**: 형식상 유효한 op를 수신한다
- **Then**: peer broadcast 0건, 발신자 op-ack 0건이다(미영속 op는 전파·확인되지 않는다)

### AC-7 — RoomRegistry.handleOp 순수성 `[Must M5]`
- **Given**: `RoomRegistry.handleOp(client, msg, outcome)` (outcome ∈ {`persisted`,`duplicate`,`rejected`})
- **When**: 각 outcome으로 호출한다
- **Then**: handleOp는 DB·네트워크 I/O 없이 outcome에 따른 Dispatch[]를 반환한다 — `persisted` → `[op-ack, ...broadcast]`, `duplicate` → `[op-ack]`, `rejected` → `[]`

### AC-8 — DB 미구성 fallback `[Should S3]`
- **Given**: `DATABASE_URL`이 설정되지 않은 환경
- **When**: relay 서버를 부팅하고 2탭이 op를 주고받는다
- **Then**: 서버는 크래시 없이 `InMemoryOpStore`로 부팅되고, op는 메모리 멱등 추적으로 처리되며, 기존 2탭 broadcast 수렴 동작에 회귀가 0건이다

---

## 확인이 필요한 사항

추가 확인 사항 없음. (영속화 정본 서버=Node 직접, 범위=op 영속화 write 경로는 선행 AskUserQuestion에서 확정. 테스트 인프라 — 실 PG vs testcontainers — 는 설계 단계의 testability 평가에서 결정.)
