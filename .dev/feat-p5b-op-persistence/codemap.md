## 코드 맵: P5 후반 — op 영속화 (Node ws-relay → Postgres crdt_ops)

### 핵심 파일 (영속화 hook · 변경 대상)
- `apps/ws-relay/src/room.ts:92` → `RoomRegistry.handleOp(client,msg)` — 현재 op-ack + broadcast 동기 반환. **영속화 outcome 파라미터 추가 지점**(순수 유지).
- `apps/ws-relay/src/server.ts:61` → ws `message` 핸들러 op 분기. **`await opStore.append()` → handleOp(outcome) → send 비동기 배선 지점**. createRelayServer에 opStore 주입.
- `apps/ws-relay/src/protocol.ts:23` → `OpMsg {type,pageId,op:WireEnvelope}`. `WireEnvelope={siteId,seq,opType,payload}`.
- `apps/ws-relay/src/main.ts:6` → 엔트리포인트. **PgOpStore 생성·주입(DATABASE_URL) 지점**.
- (신규) `apps/ws-relay/src/opStore.ts` → `OpStore` 포트 + `InMemoryOpStore`(idempotency fake).
- (신규) `apps/ws-relay/src/pgOpStore.ts` → `PgOpStore`(pg Pool, INSERT…ON CONFLICT DO NOTHING).

### 참조 파일
- `packages/crdt/src/wire.ts:7` → `WireEnvelope` + `opType: AnyOp['type']`. **opType 5종**: `insert`/`delete`/`block-insert`/`block-delete`/`block-set-type` (인라인·블록 insert/delete는 type 공유).
- `packages/crdt/src/types.ts:20,27,83,91,98` → AnyOp 정의(insert/delete/block-insert/block-delete/block-set-type).
- `apps/ws-relay/tests/room.cursor.test.ts`, `room.presence.test.ts` → handleOp 호출부(시그니처 변경 시 갱신).
- `apps/web/src/lib/realtime/__tests__/inMemoryRelay.ts:3` → web이 RoomRegistry.handleOp 호출(outcome 스레딩 갱신 필요).
- `backend/src/test/java/com/ieum/support/AbstractIntegrationTest.java` → 백엔드 Testcontainers 통합테스트 베이스(V3 마이그레이션 검증용).

### 설정 / DDL
- `backend/src/main/resources/db/migration/V1__init.sql:83` → `crdt_ops` 테이블. `op_type CHECK(IN 'INSERT','DELETE')` — **wire 5종과 불일치 → V3 마이그레이션으로 확장**. `server_seq GENERATED ALWAYS AS IDENTITY`, `UNIQUE(page_id,site_id,seq)` 멱등.
- `backend/src/main/resources/db/migration/` → 다음 버전 **V3** (V1__init, V2__personal_workspace_unique 존재).
- `backend/src/main/resources/application.yml:14` → `DATABASE_URL:jdbc:postgresql://localhost:5432/ieum` (user/pass postgres). Node도 동일 PG 사용.
- `apps/ws-relay/package.json` → `pg` 의존성 추가 필요. 테스트: 실 PG(5432 OPEN) 또는 @testcontainers/postgresql.

### 환경 사실
- Docker RUNNING, PG localhost:5432 OPEN → 실 DB 통합테스트 가능.
- DDL은 Spring/Flyway 소유, op INSERT(write)는 Node ws-relay 소유(SSOT collaboration/architecture.md 정합). Spring collaboration 모듈(OpService 스텁)은 폐기.
