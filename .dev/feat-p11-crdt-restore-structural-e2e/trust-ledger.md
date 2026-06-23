# Trust Ledger — P11 (CRDT 재접속 복원·구조편집·e2e)

> security-auditor 통합 감사(phase-review) 결과 + 트리아지. 브랜치 feat/p11-crdt-restore-structural-e2e.

## 통합 감사 (review) — 12건 (CRITICAL 1 · HIGH 5 · MEDIUM 6)

### 수정 대상 (저비용·P11 신규 — RGR 수정 권장)
- **[RISK/HIGH] restoringRef 예외 시 true 고착** — `useCrdtDocument.ts` onOpBatch에서 applyDocOp/fromWire 예외 시 `restoringRef=false` 미도달 → onRemoteOp의 bump가 영구 억제되어 에디터 freeze.
  - 근거: `restoringRef.current=true; for(...) applyDocOp; restoringRef.current=false; bump()` — 중간 throw 시 false 미설정.
  - 권고: try/finally로 `restoringRef.current=false` 보장. **(P11 신규, 수정)**
- **[품질/Important] room.ts op-batch 죽은 코드** — `RoomRegistry.join(...,ops?)` op-batch Dispatch가 server.ts에서 미사용(server는 socketChain 밖 별도 송신). room.test만 커버하는 비활성 경로 + op-batch 생성 로직 중복.
  - 권고: room.ts ops 파라미터·op-batch 분기 제거 + 해당 room.test 정리(server.test가 op-batch 송신 커버). **(수정)**
- **[품질/Important] Editor.tsx Backspace fallback=0** — `getCaretOffset(el, 0)` → Selection 미확정 시 offset 0으로 평가되어 무조건 병합 시도. Enter(fallback=text.length)와 비대칭.
  - 권고: Backspace fallback을 `block.text.length`로(Enter와 대칭) — 미확정 시 비병합, 빈 블록만 병합. Editor.test는 getSelection 모킹 또는 빈 블록 케이스로 조정. **(수정)**

### 저비용 하드닝 (방어적 — 수정 권장)
- **[RISK/HIGH] isWireEnvelope payload proto-pollution 가드 누락** — op-batch 봉투 검증이 payload 객체의 dangerous key(`__proto__` 등) 미검사. JSON.parse는 own 프로퍼티라 즉시 오염은 아니나 fromWire/applyDocOp 처리에 따라 위험. ws-relay·web 양쪽 isWireEnvelope 동일.
  - 권고: isWireEnvelope에 `hasDangerousKey(payload)` 추가(양쪽). **(기존 op 경로 공유, 저비용 하드닝 — 수정)**
- **[ASSUMPTION/MEDIUM] op-batch pageId 미검증** — relayClient/onOpBatch가 msg.pageId 무시. key={pageId} remount로 레이스 낮으나 방어적 검증 부재.
  - 권고: onOpBatch에서 `msg.pageId === pageId` 가드. **(저비용 — 수정)**
- **[GAP/MEDIUM] loadByPage 실패 → 조용한 빈 batch** — DB 장애 시 ops:[] 전송이 빈 문서(AC-A4)와 구분 불가. 설계 수용(재join 복구)이나 서버 로깅 부재.
  - 권고: 서버 측 error 로깅 추가(관측성). **(저비용 — 수정 시 동반)**

### 수용·문서화 (범위 밖 / PRD 결정 / 기존 구조)
- **[RISK/CRITICAL→수용] membershipStore 미주입 시 op-batch 무인가** — 인가된 경로(membership 주입)는 비멤버 join 시 `return`으로 op-batch 미전송(안전). 위험은 membershipStore **미주입** 시 게이트 off인데, 이는 **P5부터의 walking-skeleton 설계**(기존 op broadcast도 동일 게이트). op-batch는 동일 게이트 뒤에 위치 → **P11 신규 취약점 아님**. WS-AUTH 하드닝은 PRD 명시 제외(별도 슬라이스). **수용, [[crdt-optype-v3-mismatch]] 인접 collaboration 하드닝과 함께 후속.**
- **[RISK/HIGH→수용] op-batch 크기 무제한** — maxPayload(64KiB)는 수신 한도, 송신 미적용. 대형 문서 op 전량 단일 프레임. **PRD가 청크 분할을 Snapshot 슬라이스로 명시 연기**(설계 위험 1). MVP(50 op) 충족. **수용.**
- **[GAP/HIGH→수용] splitBlock op 시퀀스 부분 적용(원자성 없음)** — 개별 op 전송 중 끊김 시 부분 영속. **PRD 제외 범위("블록 op 원자 전송")**. 인과버퍼·멱등이 영속된 op는 보장, 미전송 op 복구는 후속 기술부채. **수용.**
- **[RISK/MEDIUM→수용] PgOpStore opType 신뢰 캐스팅** — V3 CHECK 제약이 DB 레벨 보호. 런타임 필터는 비용 대비 낮음. **수용(문서화).**
- **[RISK/MEDIUM→수용] socketChain reject 후 connPage 미설정** — connPage===null 가드가 op 처리 차단. 실질 영향 제한적. **수용.**
- **[RISK/MEDIUM→수용] payload depth 무제한** — maxPayload 64KiB가 1차 완화. **수용.**
- **[POLICY/HIGH→수용] e2e CI 제외 + waitForTimeout flaky** — PRD FR-C2 명시 결정(로컬 수동). 회귀 방어는 vitest 통합(ws-relay testcontainers + web inMemoryRelay)이 담당. e2e 견고화(expect.poll·세션 분리)는 후속. **수용(문서화).**
- **[GAP/MEDIUM→수용] convergence.e2e contains 단언 느슨 / storageState 공유** — e2e 수동. 동일 세션 2탭도 siteId 상이라 수렴 검증 유효. **수용(README 보강 후속).**

## 처리 결과 (2026-06-23, 사용자: 핵심 수정 + 문서화)
- ✅ **수정(RGR)**: ① restoringRef try/finally(freeze 방지) ② room.ts op-batch 죽은코드 제거(+room.test 3건 정리, server.test가 커버) ③ Editor.tsx Backspace fallback `0`→`block.text.length`(+Editor.test AC-B2를 빈 블록으로 결정론화) ④ isWireEnvelope payload proto-pollution 가드(web+ws-relay 양쪽) ⑤ op-batch pageId 검증(relayClient onOpBatch(ops,pageId)+useCrdtDocument 가드) ⑥ loadByPage 실패 console.warn 로깅.
- 재리뷰: spec PASS 유지(AC 무변경), **quality PASS**(Important 0/Critical 0), 검증 web 179 + ws-relay 85 + typecheck 0.
- 📄 **수용·문서화**: membership 게이트 미주입(P5 기존, WS-AUTH 별도 슬라이스)·op-batch 크기 무제한(PRD Snapshot 연기)·splitBlock 원자성(PRD 제외)·pgOpStore opType 캐스팅/payload depth/socketChain(완화 존재)·e2e CI 제외·flaky·storageState(PRD 결정, 수동) — 모두 위 분류대로 trust-ledger에 수용 기록.

### 교차 검증 정합 (참고)
- BR-1(serverSeq ASC) ✓ · BR-3(개별 op 전송) ✓ · BR-4(genesis 무동작) ✓ · BR-5(crdt 무변경) ✓
- 문서-구현 표현 차이: server.ts가 sendAll 대신 sockets.get 직접 사용(기능 동일) · PRD FR-A3 "인과버퍼로 적용" 표현 vs 구현(restoring=렌더배칭, 유실방지=crdt 인과버퍼) — 설계서 결정 4가 정정. 코드 동작 정상.

## Cross-Review 추가 (2026-06-23, claude advisor + PR #27 gemini)
- ✅ 수정: W1 IME 조합 가드(handleKeyDown)·I3 seq `Number.isInteger`(양쪽 protocol)·I4 convergence.e2e 양방향 단언·I5 미사용 import·I6 restore.e2e networkidle·I7 sendOps 주석. (gemini 인라인 3건 전부 해소)
- ⛔ 수용: **W2 server.ts op-batch fire-and-forget(socketChain 밖)** — 설계 결정 3이 AC-A3(replay 중 실시간 op 비블록)을 위해 의도. await 직렬화 시 AC-A3 회귀, 재연결은 신규 소켓(stale batch 무해). 견고화(join-epoch) 후속.
- 상세: `cross-review.md`. 검증 web 186 + ws-relay 87 + typecheck 0.
