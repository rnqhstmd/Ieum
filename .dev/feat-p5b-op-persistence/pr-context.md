# PR 컨텍스트 — P5 후반 op 영속화

## 배경
P5 walking skeleton(PR #10)은 in-memory relay로 2탭 실시간 수렴까지만 구현했고 op 영속화가 없어, 모든 클라가 연결을 끊으면 편집 내용이 사라지고 재접속 시 복원할 op 로그가 없었다(현재 가장 큰 데이터 유실 구멍). 이 PR은 SSOT(`context/collaboration/architecture.md`)의 정본 설계대로 **Node ws-relay가 op를 Postgres `crdt_ops`에 append-only 영속화**하는 write 경로를 구현한다(US-CRDT-02/03). Spring `collaboration` 모듈(OpService 스텁)은 폐기 스캐폴드이며, DDL은 Flyway가 소유하므로 스키마 변경은 마이그레이션으로 처리했다.

## 요구사항
- [Must] 유효 op append-only INSERT / `(page,site,seq)` 멱등 / wire opType 5종 수용(Flyway V3) / 잘못된 pageId 거부·무중단 / `handleOp` 순수성 유지.
- [Should] 영속화 후 broadcast(op-ack=영속 확인) / `server_seq` 단조 / DB 미구성 시 InMemory fallback.
- 범위 제외: 재접속 replay·Snapshot 복원(P8), WS 인가(다음 슬라이스), 자동저장 클라 배선.

## Audit Summary
- 총 6건 (CRITICAL: 0, HIGH: 0, MEDIUM: 2, LOW: 2 + Quality Important 1[수정])
- [Quality/Important] PgOpStore pool error 핸들러 부재 → **수정 완료**(프로세스 보호).
- [RISK/MEDIUM] 교차 room op 영속화 인가 공백 — broadcast는 차단되나 영속화는 미차단. 127.0.0.1 바인딩으로 containment, **WS 인가 슬라이스(WS-AUTH-02)로 연기**.
- [POLICY/MEDIUM] 폐기 Spring `CrdtOp`/`OpType`(대문자)가 V3 소문자 CHECK와 불일치 — INSERT 코드 0건이라 무해, 폐기 모듈 범위 밖.
- [RISK/LOW] DB 다운 시 op 무-ack 드롭(AC-6 의도). [ASSUMPTION/LOW] `RELAY_DATABASE_URL` 미설정 시 InMemory fallback(부팅 로그로 가시화).
- 검증: ws-relay 61 · web 135 · backend gradle BUILD SUCCESSFUL(V3 Flyway), tsc 0(×2), web build ✓.
