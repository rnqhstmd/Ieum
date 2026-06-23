## 코드 맵: P11 — CRDT 재접속 복원 + 구조편집 수렴 + e2e

> 슬라이스: US-CRDT-02(재접속 복원) + page US-EDIT(구조편집 수렴) + e2e Playwright. base=main(cd1661e, P10 PR#26 머지 반영).

### 핵심 파일
- `apps/ws-relay/src/room.ts:47-121` → RoomRegistry.join/handleOp (순수 라우팅: presence/op broadcast). **GAP: join 시 기존 op 재전송 없음** [재접속복원]
- `apps/ws-relay/src/pgOpStore.ts:30-51` → PgOpStore.append (op→crdt_ops append-only, wire 소문자 그대로 저장). **GAP: 기존 op 조회·재전송 메서드 없음** [재접속복원]
- `apps/ws-relay/src/server.ts:54-158` → createRelayServer (ws 어댑터: 메시지 해석→registry→Dispatch). **GAP: join 후 snapshot/op-batch 송신 경로 없음** [재접속복원]
- `apps/web/src/lib/editor/useCrdtDocument.ts:63-176` → useCrdtDocument 훅 (DocState 진실원천 + relay 배선). **GAP: snapshot 로드/join-ack 후 op 요청 없음** [재접속복원]
- `apps/web/components/editor/Editor.tsx:147-156` → handleKeyDown (Enter/Backspace 감지). **GAP: preventDefault만, 블록 op 생성 없음** [구조편집]
- `apps/web/src/lib/editor/crdtDocument.ts:19-74` → createCollaborativeDocument + diffBlockText (인라인 diff→op). **GAP: 블록 split/merge/set-type diff 없음** [구조편집]
- `packages/crdt/src/block.ts:76-99` → applyDocOp (block-insert/delete/set-type 적용, LWW·인과버퍼). op 재생 엔진 준비됨 [재접속복원·구조편집 기초]
- `backend/.../collaboration/CrdtOpRepository.java` → findByPageId...ServerSeqGreaterThan...OrderByServerSeqAsc (serverSeq 이후 op 조회). **GAP: 호출 API/endpoint 없음** [재접속복원]

### 참조 파일
- `packages/crdt/src/index.ts:1-80` → export: serializeRga/deserializeRga/applyDocOp/docToBlocks/블록 op 생성자 (snapshot 직렬화·op 재생 공개 API)
- `apps/web/src/lib/realtime/relayClient.ts:31-78` → relay 세션(순수, Transport 주입): join/sendOp/sendCursor. **GAP: 과거 op 요청 메서드 없음**
- `apps/web/src/lib/realtime/protocol.ts:1-78` → 메시지 계약(Join/Op/JoinAck/OpAck/Presence/Cursor). **GAP: snapshot/op-batch 메시지 타입 없음**
- `backend/.../collaboration/Snapshot.java:22-42` → 엔티티(pageId,state jsonb,version,createdAt) + findTopByPageIdOrderByVersionDesc. **GAP: 생성 API·클라 로드 경로 없음**
- `backend/.../collaboration/OpType.java:6-9` → enum {INSERT, DELETE}(대문자 2종). **현재 write 경로 미사용(관찰용)** — wire/DB는 소문자 5종
- `apps/ws-relay/src/membershipStore.ts:2-22` → MembershipStore.isMember 포트(join 게이트). OpStore와 동형 포트 패턴 → restore 포트 동형 설계 가능
- `apps/ws-relay/src/opStore.ts` → OpStore 포트 인터페이스(InMemory fake + Pg 구현)

### 설정/마이그레이션
- `backend/.../db/migration/V1__init.sql` → crdt_ops(id,page_id,site_id,seq,op_type CHECK,payload jsonb,created_by_id,server_seq BIGINT IDENTITY) + snapshots(id,page_id,state jsonb,version,created_at)
- `backend/.../db/migration/V3__crdt_ops_optype_wire.sql:14-15` → op_type CHECK 소문자 5종 (PgOpStore 저장값과 정합)
- `apps/ws-relay/vitest.config.ts` + `vitest.int.config.ts` → unit + testcontainers 통합
- `apps/web/vitest.config.ts` + package.json → vitest + @testing-library/react. **Playwright 미설정** [e2e]

### 현재 갭 요약
- **재접속복원**: protocol 메시지타입↔relayClient 요청↔server/room 핸들러↔OpStore 조회메서드↔클라 snapshot로드+op재생, backend snapshot 생성/조회 API — 전 구간 0%
- **구조편집**: Editor.tsx Enter/Backspace op 생성 + crdtDocument 블록 diff(split/merge/set-type) + 블록 op sendOp — 15%(엔진은 있음, 배선 없음)
- **e2e**: Playwright 설치·config·e2e 디렉토리·풀스택 구동(DB/relay/web) — 0%

### OpType↔DB wire 정합성 (메모리 crdt-optype-v3-mismatch 검증 결과)
- PgOpStore(`pgOpStore.ts:39`)가 wire envelope의 opType(소문자)을 **그대로 INSERT** → V3 CHECK 제약과 정합 ✓
- Java `OpType` enum(대문자 2종)은 OpService/handler에서 **미사용**(관찰용) → 이 슬라이스 write 경로 충돌 없음
- **리스크**: backend가 op를 읽어 snapshot 생성(재접속복원 GAP)할 경우 enum 확장/소문자 매핑 필요 가능 → 설계 단계 결정사항
