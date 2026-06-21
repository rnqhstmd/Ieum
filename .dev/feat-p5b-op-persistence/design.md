# 설계: P5 후반 — op 영속화 (Node ws-relay → Postgres `crdt_ops`)

## 설계 규모: 중형
신규 2 + 수정 5 파일. 순수 포트 + 1개 I/O 어댑터(PgOpStore) + DDL 마이그레이션 1.

## 핵심 설계 결정

### D1. `OpStore` 포트로 영속화 격리 (순수성 보존의 핵심)
relay의 순수 라우팅(`RoomRegistry`)과 DB I/O를 포트로 분리한다. `RoomRegistry.handleOp`는 I/O를 직접 하지 않고, **영속화 결과(outcome)** 를 파라미터로 받아 Dispatch[]만 결정한다(AC-7). 비동기 I/O는 서버 어댑터(`server.ts`)가 담당한다.

```ts
// 신규 apps/ws-relay/src/opStore.ts
import type { WireEnvelope } from '@ieum/crdt';
export type AppendOutcome = 'persisted' | 'duplicate' | 'rejected';
export interface OpStore {
  append(pageId: string, op: WireEnvelope): Promise<AppendOutcome>;
  close?(): Promise<void>;
}
```
- `persisted`: 새 행 INSERT 성공.
- `duplicate`: `(page_id, site_id, seq)` 이미 존재 → INSERT 0행.
- `rejected`: pageId가 UUID 아님 / `pages` FK 위반 / 기타 제약 위반.

### D2. `InMemoryOpStore` (테스트 fake + DB 미구성 fallback)
```ts
class InMemoryOpStore implements OpStore {
  private seen = new Set<string>(); // `${pageId}|${siteId}|${seq}`
  async append(pageId, op) {
    if (!isUuid(pageId)) return 'rejected';        // AC-5(형식)
    const k = `${pageId}|${op.siteId}|${op.seq}`;
    if (this.seen.has(k)) return 'duplicate';      // AC-2
    this.seen.add(k); return 'persisted';
  }
}
```
- FK(페이지 존재)는 메모리에 없으므로 검증 불가 — UUID 형식만 거부. 실제 FK 거부는 `PgOpStore` 통합테스트로 검증.
- `DATABASE_URL` 미설정 시 이 store로 부팅(AC-8/S3) → 기존 walking skeleton 2탭 broadcast 회귀 0.

### D3. `PgOpStore` (실 DB, 유일한 I/O 컴포넌트)
```ts
// 신규 apps/ws-relay/src/pgOpStore.ts (pg Pool)
const SQL = `
  INSERT INTO crdt_ops (id, page_id, site_id, seq, op_type, payload)
  VALUES ($1, $2, $3, $4, $5, $6::jsonb)
  ON CONFLICT (page_id, site_id, seq) DO NOTHING
  RETURNING server_seq`;
async append(pageId, op) {
  try {
    const r = await pool.query(SQL, [randomUUID(), pageId, op.siteId, op.seq, op.opType, JSON.stringify(op.payload)]);
    return r.rowCount === 1 ? 'persisted' : 'duplicate';   // ON CONFLICT → 0행
  } catch (e) {
    if (isUuidSyntax(e) || isFkViolation(e)) return 'rejected'; // 22P02 / 23503 → AC-5
    throw e;  // 그 외(연결 끊김 등)는 어댑터 try/catch가 흡수(AC-6: 미영속 → 무전파)
  }
}
```
- `id`는 Node `crypto.randomUUID()`로 앱에서 생성(pgcrypto 의존 회피). `payload` 컬럼(jsonb)에는 `op.payload`(AnyOp)만 저장(데이터 모델 §5 정합: site_id/seq/op_type은 컬럼).
- `server_seq`(IDENTITY)는 DB가 단조 부여(AC-3/S2). append-only — UPDATE/DELETE 경로 없음(M1/US-CRDT-03).

### D4. `RoomRegistry.handleOp` 시그니처 변경 (순수 유지)
```ts
handleOp(client: ClientHandle, msg: OpMsg, outcome: AppendOutcome): Dispatch[]
```
| outcome | 반환 Dispatch[] | 근거 |
|---------|----------------|------|
| `persisted` | `[op-ack, ...broadcast(peer 제외)]` | AC-1 |
| `duplicate` | `[op-ack]` (재전송, broadcast 0) | AC-2 (이미 전파됨) |
| `rejected` | `[]` (ack·broadcast 0) | AC-5/AC-6 |
- 기존 cross-room 가드(`clientRoom.get(client.id) === msg.pageId`)는 broadcast 경로에 그대로 유지(교차 room 주입 차단).
- op-ack는 이제 "영속화 확인 응답"(S1, 06-api §308).

### D5. 서버 어댑터 — 비동기 op 처리 + opStore 주입
```ts
// server.ts: createRelayServer(opts: { ..., opStore?: OpStore })
const opStore = opts.opStore ?? new InMemoryOpStore();
socket.on('message', async (raw) => {
  const msg = parseClientMessage(raw.toString());
  if (!msg) return;
  if (msg.type === 'join') sendAll(registry.join(handle, msg.pageId, msg.presence));
  else if (msg.type === 'cursor') sendAll(registry.handleCursor(handle, msg));
  else { // op — 영속화 선행 후 dispatch (S1)
    try {
      const outcome = await opStore.append(msg.pageId, msg.op);
      sendAll(registry.handleOp(handle, msg, outcome));
    } catch { /* 영속화 실패: 무전파·무ack (AC-6). close에서 정리 */ }
  }
});
```
- `main.ts`: `DATABASE_URL` 있으면 `new PgOpStore(url)`, 없으면 `InMemoryOpStore`(S3). 서버 close 시 `opStore.close?.()`.
- **소켓 내 순서 보존**: `await append`로 op 처리가 비동기가 되므로, 한 소켓에서 연속 도착한 op가 reorder되지 않도록 **소켓별 promise 체인**으로 직렬화한다(`chain = chain.then(() => handleOpAsync())`). CRDT 수렴은 순서 무관(RGA)하지만 `server_seq`가 도착 순서를 반영하도록 보존. 소켓 간은 병렬 유지.

### D6. Flyway V3 마이그레이션 (DDL은 Spring/Flyway 소유)
```sql
-- backend/src/main/resources/db/migration/V3__crdt_ops_optype_wire.sql
ALTER TABLE crdt_ops DROP CONSTRAINT crdt_ops_op_type_check;
ALTER TABLE crdt_ops ADD CONSTRAINT crdt_ops_op_type_check
  CHECK (op_type IN ('insert','delete','block-insert','block-delete','block-set-type'));
```
- wire `opType`(소문자 5종)을 그대로 저장 → 봉투 충실 영속화(M3/AC-4). `crdt_ops`는 현재 비어있어 데이터 마이그레이션 불요. 제약 이름은 V1 인라인 CHECK의 Postgres 자동명 `crdt_ops_op_type_check`(구현 시 실 DB로 확정).

## 변경 범위

### 신규
- `apps/ws-relay/src/opStore.ts` — `OpStore` 포트 + `InMemoryOpStore` + `isUuid`.
- `apps/ws-relay/src/pgOpStore.ts` — `PgOpStore`(pg Pool).
- `backend/src/main/resources/db/migration/V3__crdt_ops_optype_wire.sql` — op_type CHECK 확장.

### 수정
- `apps/ws-relay/src/room.ts` — `handleOp(client,msg,outcome)`.
- `apps/ws-relay/src/server.ts` — async op 분기 + `opStore` 주입.
- `apps/ws-relay/src/main.ts` — DATABASE_URL 분기(PgOpStore/InMemory).
- `apps/ws-relay/src/index.ts` — `OpStore`/`AppendOutcome`/`InMemoryOpStore` export(web inMemoryRelay·테스트용).
- `apps/ws-relay/package.json` — `pg` 의존성 + `@testcontainers/postgresql`·`@types/pg` devDeps.
- 호출부 갱신: `apps/web/src/lib/realtime/__tests__/inMemoryRelay.ts`(handleOp에 `'persisted'` 전달), 기존 ws-relay op 테스트.

## 구현 순서 (RGR 태스크)
- **T1**: `OpStore` 포트 + `InMemoryOpStore`(멱등·UUID 거부) — 순수 단위. [AC-2, AC-5(형식), AC-8]
- **T2**: `RoomRegistry.handleOp(outcome)` 리팩토링 — outcome→Dispatch[]. 호출부(server/web/테스트) 갱신. [AC-1, AC-2, AC-6, AC-7]
- **T3**: 서버 어댑터 비동기 배선 + opStore 주입 + main 분기. [AC-1, AC-6, AC-8]
- **T4**: Flyway V3 마이그레이션. [AC-4]
- **T5**: `PgOpStore` + testcontainers 통합테스트(V1+V3 스키마 + user/workspace/page 픽스처). [AC-1, AC-3, AC-4, AC-5(FK)]

## 신뢰 경계 / 에러 처리
- 영속화 실패(DB 연결 끊김 등 비-제약 예외)는 어댑터 try/catch가 흡수 → 무전파·무ack(AC-6). 프로세스 미중단.
- rejected op는 조용히 폐기(C1 진단 로그 선택). 클라 재시도는 walking skeleton 범위 밖(정상 흐름에선 pageId 유효).
- 두-writer 없음: op INSERT는 Node 단독, DDL은 Flyway 단독. 충돌 경로 없음.
- 멱등은 DB 유니크 제약(`uq_crdt_ops_page_site_seq`)이 정본 — 앱 레이어 race에도 ON CONFLICT가 단일 진실.

---

## Testability 평가 (test-architect)

### 컴포넌트별 테스트 전략

#### OpStore 포트 + InMemoryOpStore
- 단위 테스트: `Set` 기반 멱등(같은 key 2회 → persisted→duplicate), UUID 형식 거부(비-UUID → rejected). 순수, I/O 0.
- 모의 대상: 없음(자체가 fake).
- 격리 전략: 인메모리.
- AC 매핑: AC-2, AC-5(형식), AC-8.

#### RoomRegistry.handleOp(outcome)
- 단위 테스트: fake `ClientHandle` + outcome 3종 주입 → Dispatch[] 형태 단언(persisted=[ack,broadcast], duplicate=[ack], rejected=[]). peer 제외·cross-room 가드 회귀.
- 모의 대상: 없음(outcome은 평범한 enum 인자).
- 격리 전략: 순수 함수 — DB 미접근 단언(I/O import 부재).
- AC 매핑: AC-1, AC-2, AC-6, AC-7.

#### 서버 어댑터(server.ts)
- 통합 테스트: fake `OpStore`(append 호출 기록 + 반환 제어)를 주입해 "append 선행 → outcome으로 dispatch" 순서·AC-6(append 실패 시 무전파) 단언. 기존 in-memory relay 하니스 재사용.
- 모의 대상: `OpStore`(fake), ws 소켓(기존 FakeTransport 패턴).
- 격리 전략: DI로 OpStore 주입.
- AC 매핑: AC-1, AC-6, AC-8.

#### PgOpStore
- 통합 테스트: `@testcontainers/postgresql`로 throwaway PG 기동 → 실 `V1__init.sql` + `V3` 적용 → user→workspace→page 픽스처 시드 → append 호출. 실 INSERT/ON CONFLICT/server_seq/FK 거부 단언.
- 모의 대상: 없음(실 DB가 검증 대상).
- 격리 전략: 컨테이너별 격리 + 테스트 후 컨테이너 폐기. Docker 가용(확인됨).
- AC 매핑: AC-1, AC-3, AC-4, AC-5(FK).

#### Flyway V3
- 검증: PgOpStore 통합테스트가 V1+V3 적용 후 5종 op_type INSERT 성공으로 직접 검증(AC-4). 추가로 백엔드 기존 Testcontainers 통합테스트가 부팅 시 Flyway로 V3를 적용하므로 마이그레이션 형식 오류는 백엔드 테스트가 자동 포착.
- AC 매핑: AC-4.

### Testability Score: 9/10

### 판정
- ✅ **TESTABILITY PASS** (≥ 7)
- 근거: 영속화가 단일 포트(OpStore) 뒤로 격리되어 핵심 로직(멱등·outcome→dispatch·fallback)이 전부 순수 단위 테스트 가능. 유일한 I/O(PgOpStore)는 DI로 주입되고 Docker(가용 확인)로 격리 통합 테스트. 전역 상태·static 의존·강결합 없음.
- -1 사유: PgOpStore/Flyway 검증이 Docker/PG 환경에 의존(가용하나 환경 결합). 핵심 로직은 환경 무관하게 검증 가능하여 게이트 영향 없음.
