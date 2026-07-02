# PRD: CRDT op_type 표기 정렬 (Java ↔ wire 소문자 5종)

## 배경
- CRDT 연산(op)은 5종(insert, delete, block-insert, block-delete, block-set-type)이며 wire 표기(소문자·하이픈)는 `@ieum/crdt`가 정본으로 정의한다(`packages/crdt/src/wire.ts` WireEnvelope.opType = AnyOp['type']).
- DB `crdt_ops.op_type` CHECK 제약(V3 마이그레이션)은 이미 이 5종 소문자만 허용한다. 정본 writer인 Node ws-relay(`apps/ws-relay/src/pgOpStore.ts`)는 소문자를 그대로 저장해 일치한다(라이브 운영 중).
- 그러나 Java `OpType`은 INSERT/DELETE 2종뿐이고 `CrdtOp`가 `@Enumerated(EnumType.STRING)`이라 저장 시 enum 이름(대문자 "INSERT"/"DELETE")을 쓴다 → **V3 제약 위반 + block-* 3종 표현 불가**.
- 이 불일치는 가정이 아니라 **이미 실제 코드에서 우회 처리 중**이다: `WorkspaceDeleteLeaveIntegrationTest`가 "V3 op_type CHECK는 소문자를 요구하므로 JPA enum 우회" 주석과 함께 native SQL로 crdt_ops 행을 직접 삽입한다.
- 현재 Java `OpService.handleOp`는 `TODO(Phase 2)` 스텁이라 서비스 장애로 이어지진 않았으나, `CrdtOp`/`OpType`은 이미 실행되는 프로덕션 코드다. 협업 아키텍처 문서상 ws-relay가 영속화 정본이며 Java 쓰기 역할은 폐기됨 — 이번 작업은 `OpService` 쓰기 재활성화가 아니라, **이미 살아있는 `CrdtOp`/`OpType` 표현과 cascade 테스트 우회 현실을 바로잡는 것**이 목적이다.
- DB(V3)는 이미 정확한 정본이므로 **새 마이그레이션 없이 Java 쪽 표현만 정렬**한다(승인된 결정).

## 요구사항

### 기능 요구사항
- [Must] FR-1: `OpType`이 wire 5종(insert, delete, block-insert, block-delete, block-set-type) 각각에 대응하는 5개 상태를 표현한다.
- [Must] FR-2: `CrdtOp`가 op_type을 저장/조회할 때 wire 소문자·하이픈 문자열을 사용한다(enum 이름 대문자 저장 금지).
- [Must] FR-3: `WsMessages.OpMessage.opType` 필드의 문서화된 계약이 "INSERT"|"DELETE" 2종이 아니라 wire 5종을 명시하도록 정렬된다.
- [Must] FR-4: crdt_ops에 매핑표 밖 문자열이 있는 상태로 Java가 읽으면, 조용히 무시/임의 대체되지 않고 **원인을 알 수 있는 예외로 실패**한다. (사용자 결정)
- [Must] FR-5: 기존 `WorkspaceDeleteLeaveIntegrationTest`의 native SQL op_type 삽입 우회를 **JPA(CrdtOp) 정상 저장 경로로 되돌린다** — 정렬 효과를 기존 cascade 테스트로 실증하고 우회 주석/코드를 제거한다. (사용자 결정)
- [Must] FR-6: `OpType`의 JSON 직렬화/역직렬화도 wire 형식을 사용한다(`@JsonValue`/`@JsonCreator`) — @Convert가 JPA만 정렬하는 비대칭을 닫아, Phase 2에서 CrdtOp를 JSON으로 내보낼 때(SyncResponse 등) opType이 wire 소문자로 나가도록. (사용자 결정: Jackson 정렬 포함)

### 비즈니스 규칙
- [Must] BR-1: enum↔wire 문자열 매핑은 다음이 유일한 정본이다.

| OpType 상태 | wire 문자열(DB 저장값) |
|---|---|
| INSERT | `insert` |
| DELETE | `delete` |
| BLOCK_INSERT | `block-insert` |
| BLOCK_DELETE | `block-delete` |
| BLOCK_SET_TYPE | `block-set-type` |

- [Must] BR-2: crdt_ops.op_type에 Java가 쓰는 값은 항상 위 5종 소문자 문자열 중 하나여야 한다(V3와 100% 일치, 예외 없음).
- [Must] BR-3: 매핑표에 없는 문자열을 읽으면 데이터 이상으로 간주해 명확한 예외를 던진다(무음 무시·null 대체 금지).

## 수용 기준

- AC-1: enum → wire 문자열 변환 완전성
  Given `OpType`의 5개 상태(INSERT, DELETE, BLOCK_INSERT, BLOCK_DELETE, BLOCK_SET_TYPE) 각각을
  When wire 문자열로 변환하면
  Then 각각 정확히 `"insert"`,`"delete"`,`"block-insert"`,`"block-delete"`,`"block-set-type"`이 반환된다.
  → [FR-1/BR-1]

- AC-2: wire 문자열 → enum 역변환 및 왕복 일치
  Given wire 문자열 5종 각각을
  When `OpType`으로 변환하면
  Then 각각 INSERT, DELETE, BLOCK_INSERT, BLOCK_DELETE, BLOCK_SET_TYPE으로 복원되고, AC-1 변환 결과와 왕복 시 원래 값과 일치한다.
  → [FR-1/BR-1]

- AC-3: CrdtOp 저장 시 DB 제약 통과 (통합, 실제 Postgres/Testcontainers)
  Given 5종 opType 각각으로 생성한 `CrdtOp`를
  When 리포지토리로 저장하면
  Then 제약 위반 예외 없이 저장되고, DB에 실제 기록된 op_type이 대응 wire 소문자 문자열(예: `"block-set-type"`)이다.
  → [FR-2/BR-2]

- AC-4: CrdtOp 조회 시 올바른 enum 복원 (통합)
  Given crdt_ops에 wire 소문자 문자열(5종 각각)로 저장된 행이 있을 때
  When 리포지토리로 조회하면
  Then `CrdtOp.opType`이 대응 `OpType`으로 정확히 복원된다(예: `"block-insert"` → BLOCK_INSERT).
  → [FR-2/BR-2]

- AC-5: 알 수 없는 문자열 방어
  Given crdt_ops.op_type에 매핑표 5종에 없는 문자열(예: `"unknown-op"`, 테스트용 직접 삽입)이 있을 때
  When Java가 해당 행을 조회/매핑하면
  Then null·임의 기본값 대체 없이 원인을 알 수 있는 예외가 발생한다.
  → [FR-4/BR-3]

- AC-6: WsMessages 계약 문서 정렬
  Given `WsMessages.OpMessage.opType` 필드의 문서를
  When 검토하면
  Then `"INSERT" | "DELETE"` 2종 표기는 남지 않고 wire 5종(`"insert"|"delete"|"block-insert"|"block-delete"|"block-set-type"`) 표기로 대체되어 있다.
  → [FR-3]

- AC-8: OpType Jackson 왕복 정렬
  Given OpType 5종을
  When Jackson ObjectMapper로 직렬화하면
  Then 각각 대응 wire 소문자 문자열이 되고, 그 wire 문자열을 OpType으로 역직렬화하면 원래 값으로 복원되며, 미지 문자열 역직렬화는 예외가 발생한다.
  → [FR-6/BR-1/BR-3]

- AC-7: cascade 테스트 우회 제거 (통합)
  Given `WorkspaceDeleteLeaveIntegrationTest`가 crdt_ops 준비 데이터를 삽입할 때
  When native SQL 대신 JPA(`CrdtOpRepository.save(CrdtOp)`) 정상 경로를 사용하도록 되돌리면
  Then op_type이 wire 소문자로 저장되어 V3 제약 위반 없이 저장되고, 기존 cascade 삭제 검증(assertion)이 그대로 통과하며, "JPA enum 우회" 주석/native SQL op_type 삽입이 파일에서 제거된다.
  → [FR-5]

## 비고 (범위 밖)
- `OpService.handleOp` 실제 저장/브로드캐스트 구현 — Phase 2 TODO 유지.
- `CollaborationWebSocketHandler` sync_request 실제 구현.
- ws-relay / `@ieum/crdt` / 프론트엔드 변경.
- 새 DB 마이그레이션(V3가 정본).
- block op payload 필드 처리/검증 로직(opType 표기만 정렬, payload 구조 불변).
- `WsMessages.OpMessage` 클래스 상단 payload 예시 Javadoc 전면 개정(AC-6은 opType 필드 문서에 한정).
- `CrdtOp`의 `created_by_id`(V4 컬럼) 매핑 누락 — op_type과 무관한 별도 갭, 이번 범위 아님.
- op_type null 케이스(제약상 값 필수) 별도 처리.
