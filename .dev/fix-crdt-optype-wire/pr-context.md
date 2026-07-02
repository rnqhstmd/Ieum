# PR Context — CRDT op_type Java↔wire 정렬

## 배경
CRDT 연산(op)의 wire opType 정본은 `@ieum/crdt`(소문자 5종: insert/delete/block-insert/block-delete/block-set-type)이고, DB `crdt_ops.op_type` CHECK 제약(V3 마이그레이션)과 정본 writer인 Node ws-relay는 이미 이 소문자 형식으로 정렬되어 라이브 운영 중이다. 반면 Java의 `OpType` enum은 INSERT/DELETE 2종뿐이고 `CrdtOp`가 `@Enumerated(EnumType.STRING)`이라 저장 시 대문자 enum 이름을 써 DB 제약과 어긋난다. 이 불일치는 가정이 아니라 이미 `WorkspaceDeleteLeaveIntegrationTest`가 "V3 op_type CHECK는 소문자를 요구하므로 JPA enum 우회"라는 주석과 함께 native SQL로 우회하고 있던 실제 문제다. 현재 Java의 op 영속화(`OpService.handleOp`)는 Phase 2 스텁이라 서비스 장애로 이어지진 않았으나, Phase 2에서 Java 영속화/sync를 켜는 순간 ①대문자가 소문자 CHECK 위반 ②block-* 3종 표현 불가로 터진다.

## 요구사항
DB(V3, 정본)를 건드리지 않고 Java 측 표현만 wire 소문자 5종에 정렬한다. OpType enum 5종 확장 + toWire/fromWire 매핑, CrdtOp의 op_type을 @Convert로 wire 소문자 저장/조회, WsMessages 계약 문서 정렬, 미지 문자열 방어(IllegalArgumentException), JSON 직렬화까지 정렬(@JsonValue/@JsonCreator), 그리고 cascade 테스트의 native SQL 우회를 JPA 정상 경로로 복원한다.

## Audit Summary
- 총 6건 (CRITICAL: 0, HIGH: 0, MEDIUM: 3 · 코드 품질 Critical 0 / Important 0)
- Spec 리뷰 PASS (Must AC-1~8 전건 충족, 설계 범위 이탈 없음 — 새 마이그레이션 없음, OpService 스텁 유지)
- 데이터 무결성: op_type이 DB V3 소문자 5종과 정확히 정렬(대문자 잔존 경로 없음), 미지값 즉시 예외로 조용한 오분류 차단
- 리뷰 중 조치: AC-8을 실 프로덕션 Jackson 3(tools.jackson)로도 왕복 검증 추가(@JsonValue/@JsonCreator가 Jackson 3에서도 정상 동작 실증)
- 후속 인계(비차단, latent): convertToEntityAttribute IAE의 Hibernate 래핑 root cause 실증(#1), 3자(V3/Java OpType/@ieum/crdt) SSOT 정합 자동 크로스가드(#3) — 둘 다 Phase 2 실 read 경로 활성화 시점 검증 권고

## 검증
- 전체 backend `./gradlew test` + `./gradlew build` BUILD SUCCESSFUL (0 fail, verify 게이트 통과)
- 단위(OpType/Converter, Jackson 2+3) + Testcontainers 영속화 통합(5종 저장 원문 소문자·enum 복원) + cascade 테스트 JPA 복원 통과
