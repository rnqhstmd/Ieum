# Trust Ledger — P5 후반 op 영속화

## Spec 리뷰 (spec-reviewer, 1단계)
- AC 충족 매트릭스: AC-1~8 전부 ✅
  - AC-1 유효 op append+ack+broadcast: pgOpStore.int(실행), server.test(append→broadcast), room.test(persisted)
  - AC-2 멱등: opStore.test(InMemory), pgOpStore.int(ON CONFLICT), room.test(duplicate→ack only)
  - AC-3 append-only·server_seq 단조: pgOpStore.int(3행 ORDER BY server_seq 단조). 코드에 UPDATE/DELETE 경로 없음
  - AC-4 wire opType 5종: pgOpStore.int(5행 op_type 일치) + V3 마이그레이션
  - AC-5 rejected: pgOpStore.int(FK ghost), opStore.test(non-uuid), room.test(rejected→[])
  - AC-6 영속 후 broadcast: server.test(rejected→무전파·무ack) + 어댑터 try/catch
  - AC-7 handleOp 순수성: room.test(outcome 3종, I/O 0)
  - AC-8 DB 미구성 fallback: opStore.test, server.test(opStore 미주입→InMemory)
- 설계 범위 이탈: **없음** (변경 파일 전부 design.md 변경 범위 내; index.ts export·web inMemoryRelay는 "호출부 갱신"에 명시).
- 판정: **SPEC PASS** — [Must] M1~M5 5/5, [Should] S1~S3 3/3.

## 코드 품질 (quality-reviewer, 2단계)
- **Critical: 0**
- **Important: 1**
  - [Important] `PgOpStore` 풀에 error 리스너 부재 — idle client 연결 끊김 시 pg Pool이 'error'를 emit하고 미처리 시 프로세스가 죽을 수 있음(server.ts의 socket.on('error') 방어와 동형 공백).
    - 권고: 생성자에 `pool.on('error', ...)` 무해 핸들러 추가.
    - **처리: 수정됨** (핵심 방어).
- **Minor**
  - `isUuid`가 strict v4가 아닌 일반 hex UUID 패턴 — DB가 실제 게이트(22P02)이므로 수용.
  - InMemory/Pg 양쪽의 UUID 사전검증 중복 — 의도적(불필요 round-trip 회피), 수용.

## 통합 감사 (security-auditor)
- **CRITICAL: 0 / HIGH: 0**
- **MEDIUM: 2**
  - [RISK/MEDIUM] **교차 room op 영속화 인가 공백** — 어댑터는 op의 pageId가 클라가 join한 room인지 무관하게 `opStore.append`를 호출한다. broadcast는 cross-room 가드로 차단되지만 **영속화는 차단되지 않아**, 인증 없는 클라가 UUID만 알면 임의 page의 crdt_ops에 write-only 오염을 할 수 있다.
    - 현재 containment: relay는 127.0.0.1 전용 바인딩(BR-5) — 로컬 클라만 연결.
    - **처리: 문서화** — WS 인가 슬라이스(WS-AUTH-02: pageId→Membership 검증)에서 연결/페이지 단위 인가로 닫는다. (P5가 인증을 mock으로 둔 것과 동일 연기 정책.)
  - [POLICY/MEDIUM] **폐기 Spring 엔티티 불일치** — `CrdtOp`/`OpType`(@Enumerated STRING, 대문자 INSERT/DELETE)는 V3의 소문자 CHECK와 불일치. 단 `OpService`는 throw 스텁이고 crdt_ops에 INSERT하는 백엔드 코드/테스트가 0건이라 깨질 동작 없음.
    - **처리: 문서화** — Spring collaboration 모듈은 폐기 스캐폴드(SSOT: Node 정본). 부활 시 OpType을 wire 5종으로 정렬 필요. 이 슬라이스 범위 밖.
- **LOW: 2**
  - [RISK/LOW] DB 다운 시 op가 ack 없이 조용히 드롭됨(어댑터 try/catch). AC-6(미영속 무전파)의 의도된 동작 — 클라 재시도·durability 보강은 후속.
  - [ASSUMPTION/LOW] `RELAY_DATABASE_URL`(postgres:// 형식) 미설정/오설정 시 InMemory fallback으로 비영속 동작. main.ts가 부팅 로그에 `(opStore: in-memory)`를 출력해 가시성 확보.

## 종합
- 핵심 방어(PgOpStore pool error 핸들러) 수정. 나머지(교차 room 인가·폐기 엔티티·DB 다운 드롭·env 가정)는 후속 슬라이스/문서화로 정리. CRITICAL/HIGH 0건.
