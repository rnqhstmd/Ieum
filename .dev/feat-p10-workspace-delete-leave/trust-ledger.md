# Trust Ledger — P10 워크스페이스 삭제·나가기 (US-WS-04)

## 통합 감사 (review, 2026-06-23 · security-auditor)

합산: CRITICAL 0 / HIGH 1 / MEDIUM 5. quality-reviewer: QUALITY PASS(Critical 0·Important 0·Minor 3).

### HIGH

- **[GAP/HIGH] WS 강제종료(disconnectUser)가 @Transactional 커밋 전 호출 → 삭제 롤백 시 "끊겼는데 WS 잔존" 불일치 가능** — `WorkspaceService.deleteWorkspace`(139-143)·`leaveWorkspace`(216).
  - 근거: disconnectUser가 deleteById/delete 이전(또는 커밋 전)에 실행. 이후 롤백 시 연결만 끊기고 WS/멤버십은 잔존하는 반대 방향 불일치 가능.
  - **처리: 수용(accepted risk) + 문서화.** ① 설계가 best-effort 허용(연결 끊김은 허용 손실)으로 명시. ② **P9 `removeMember`도 동일하게 트랜잭션 내부 호출** — AFTER_COMMIT 전환 시 코드베이스 disconnect 타이밍이 두 갈래로 분열(P9와 분기). ③ deleteById는 단일 DELETE라 롤백 확률 낮음. ④ 사용자 결정(2026-06-23): "핵심 수정 + 문서화" — 동작 변경(AFTER_COMMIT) 미채택.
  - **후속(P11 하드닝 후보)**: disconnect를 `@TransactionalEventListener(AFTER_COMMIT)`로 전환(P9 removeMember 포함 일괄). 현재는 비차단 수용.

### MEDIUM — 처리 결과

- **[GAP/MEDIUM] renameWorkspace request null 방어 미구현 → NPE→500** — ✅ **수정.** `WorkspaceService.renameWorkspace`에 `if (request == null) throw IllegalArgumentException`(createSharedWorkspace 패턴) 추가. 단위 테스트 `renameWorkspace_nullRequest_throwsIllegalArgumentException` 추가(RGR). 컨트롤러 경로는 Spring @RequestBody non-null 보장이라 비도달이나 설계 §1 충실성 + 직접 호출 방어.
- **[GAP/MEDIUM] cascade 검증이 archived 페이지 제외** — ✅ **수정.** T4 통합테스트에 archived 페이지(+crdt_op/snapshot) 픽스처 추가, 삭제 후 `pageRepository.findAll().filter(workspaceId)` 전수 + 활성·아카이브 page 양쪽 crdt_op/snapshot cascade 단언.
- **[ASSUMPTION/MEDIUM] deleteWorkspace 단위테스트 requireOwner 반환 stub 생략** — ✅ **수정.** `when(accessGuard.requireOwner(...)).thenReturn(...)` 명시화.
- **[GAP/MEDIUM] T4 snapshotCountBefore dead var** — ✅ **수정.** 미사용 변수 제거.
- **[ASSUMPTION/MEDIUM] AccessGuard enum 비교 `!=`** — ⏭️ **범위 밖.** `AccessGuard.java:29`는 P1 기존 코드(P10 무변경). enum `!=`는 참조동일성으로 안전. P10 변경 아니므로 미조치.

### quality-reviewer Minor (3건) — 처리

- ObjectMapper `new` 직접 생성(통합테스트) — ⏭️ 비차단(기존 통합테스트 다수 동일 패턴). 미조치.
- snapshotCountBefore dead var — ✅ 위에서 제거.
- JdbcTemplate FQN 인라인 — ⏭️ 비차단(native SQL 우회 주석 명확). 미조치.

## 신규 발견 (P10 외 도메인 — 기록용)

- **[NOTE] V3 마이그레이션 op_type 제약 vs Java enum 불일치 (collaboration 도메인)** — `V3__crdt_ops_optype_wire.sql`의 `crdt_ops_op_type_check`는 소문자 5종(`insert`/`delete`/`block-insert`/`block-delete`/`block-set-type`)이나 Java `OpType` enum은 대문자. JPA `@Enumerated(STRING)`로 crdt_op 저장 시 제약 위반 가능성(잠재 이슈). **P10 범위 밖**(workspace 도메인 무관) — T4 테스트는 native SQL(`'insert'`)로 우회. **collaboration 도메인(US-CRDT 슬라이스)에서 OpType enum↔DB wire 값 정합성 확인 필요.**

## 기존 위험 (P9 trust-ledger 계승 — 중복 보고 아님, 참조)

- ws-relay admin 채널 인증토큰 미적용(127.0.0.1 전용 바인드로 완화) — P11 하드닝.
- 마지막 OWNER 보호의 동시성(두 OWNER 동시 leave/강등) 락 부재 — P9 동일 한계, P11 하드닝.
- 멱등 write skip(updateMemberRole 동일역할 재설정) — 백로그.
