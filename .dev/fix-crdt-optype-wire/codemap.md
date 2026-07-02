## 코드 맵: CRDT op_type Java↔wire 정렬 (latent 불일치 수정)

### 핵심 파일 (수정 대상)
- backend/src/main/java/com/ieum/collaboration/OpType.java → Java enum(현재 INSERT, DELETE 대문자 2종). wire 5종으로 정렬 대상.
- backend/src/main/java/com/ieum/collaboration/CrdtOp.java:45-47 → `@Enumerated(EnumType.STRING) opType` (enum 이름=대문자 저장 → V3 제약 위반 소지). AttributeConverter 등으로 wire 소문자 매핑 대상.
- backend/src/main/java/com/ieum/collaboration/dto/WsMessages.java:32,39 → OpMessage.opType 계약(주석/값 "INSERT"|"DELETE"). wire 5종으로 정렬.

### 불변 (이미 정확 — 건드리지 않음)
- backend/src/main/resources/db/migration/V3__crdt_ops_optype_wire.sql → DB CHECK SSOT: `op_type IN ('insert','delete','block-insert','block-delete','block-set-type')`. **정본**. 새 마이그레이션 불필요.
- backend/src/main/resources/db/migration/V1__init.sql:89 → 원래 op_type CHECK(대문자 2종) — V3가 덮음. 히스토리, 불변.
- apps/ws-relay/src/pgOpStore.ts → 실제 crdt_ops writer(wire 소문자 저장). 정렬 목표 형식(참조).

### 참조 파일
- packages/crdt/src/wire.ts:12 → `WireEnvelope.opType = AnyOp['type']`. wire opType SSOT(insert/delete/block-insert/block-delete/block-set-type; insert/delete는 인라인·블록 공유, payload.blockId로 구분).
- backend/.../OpService.java:42 → handleOp `TODO(Phase 2)` 미구현. **이번 범위는 enum/매핑 정렬이지 save 구현이 아님**.
- backend/.../CrdtOpRepository.java → JpaRepository(read query findByPageIdAndServerSeqGreaterThan...). 매핑 변경 시 읽기 경로 영향.
- backend/.../CollaborationWebSocketHandler.java:118 → opType 필드 기준 라우팅.
- backend/src/test/java/com/ieum/support/AbstractIntegrationTest.java → Testcontainers Postgres 통합 테스트 베이스(정렬을 실제 V3 제약에 대해 검증할 통로).
- context/collaboration/{architecture.md,glossary.md,status.md} → 도메인 컨텍스트(DOMAIN_CONTEXT).

### 설정
- backend Gradle: Spring Boot, JPA/Hibernate, Flyway, Testcontainers. 테스트: `./gradlew test` (Docker 필요, 로컬 가용 확인됨).
