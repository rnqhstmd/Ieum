# 실시간 협업 구현 추적

## 범례

- ✅ 반영됨 / ⬜ 미반영

---

## Phase 매핑

> 이 매핑은 requirements 구현 phase 계획 기준: CRDT 코어(수렴/멱등/교환/인과버퍼·op 구조·블록 op) → **P4**, WebSocket relay·op 영속화·sync·2탭 수렴 → **P5**, Presence(US-PRES) → **P6**, 재접속 delta·Snapshot → **P8**.
>
> **P4 완료 (PR #6, `@ieum/crdt` 인라인 RGA 코어)**: 인라인 문자 RGA(createRga/localInsert/localDelete/applyOp/toText/serialize·deserialize) + 4속성(수렴·멱등·교환·인과버퍼) 구현·검증 완료.
>
> **P4b 완료 (PR #9, 2-level 블록 RGA)**: DocState(외부 블록 RGA + 블록별 내부 인라인 RGA), applyDocOp(block-insert/delete·block-set-type LWW·인라인 blockId 스코프), splitBlock/mergeBlockWithPrev/inheritType, 2단 인과버퍼, docToBlocks 도출, wire 봉투 codec(toWire/fromWire) 구현·검증 완료(crdt 51/51). rga.ts 제네릭화(createRga<V>/applyOp<V>) — 인라인 RGA 백워드 호환.

---

## 요구사항 추적

### 실시간 공동편집 (PRD §5 — US-CRDT)

| 항목 | 설명 | 수용 기준 요약 | 상태 | Phase |
|------|------|--------------|------|-------|
| US-CRDT-01 | 편집이 상대방 화면에 즉시 반영 | 2인 이상 동시 편집 시 모든 클라이언트가 동일한 최종 텍스트로 수렴 | ⬜ | P5 |
| US-CRDT-01 | 편집이 상대방 화면에 즉시 반영 | op가 WebSocket relay로 전송되고 같은 페이지의 다른 클라이언트에 broadcast됨 | ⬜ | P5 |
| US-CRDT-01 | 편집이 상대방 화면에 즉시 반영 | 동일 위치 동시 삽입이 siteId 기준 결정론적 순서로 해소됨 | ✅ | P4 |
| US-CRDT-02 | 재연결 후 편집 내용 유실 없음 | 신규 접속 클라이언트가 snapshot 또는 op 재생으로 초기화됨 | ⬜ | P8 |
| US-CRDT-02 | 재연결 후 편집 내용 유실 없음 | 모든 op가 CrdtOp 테이블에 append-only로 저장됨 | ⬜ | P5 |
| US-CRDT-03 | op 로그로 편집 이력 추적 가능 | CrdtOp 테이블 append-only 보장, 감사 추적 가능 | ⬜ | P5 |
| US-CRDT-03 | op 로그로 편집 이력 추적 가능 | wire 봉투: `{siteId, seq, opType, payload}` — payload는 아래 정본 구조 | ✅ | P4b (PR #9) |
| US-CRDT-03 | op 로그로 편집 이력 추적 가능 | 인라인 INSERT payload: `{id, originId, value, blockId}` (blockId로 블록 스코프) | ✅ | P4b (PR #9) |
| US-CRDT-03 | op 로그로 편집 이력 추적 가능 | 인라인 DELETE payload: `{targetId, blockId}` — tombstone 처리 | ✅ | P4b (PR #9) |
| US-CRDT-03 | op 로그로 편집 이력 추적 가능 | 블록 INSERT payload: `{id, originId, blockType}` — 외부 블록 RGA 삽입 | ✅ | P4b (PR #9) |
| US-CRDT-03 | op 로그로 편집 이력 추적 가능 | 블록 DELETE payload: `{targetId}` — 외부 블록 RGA tombstone | ✅ | P4b (PR #9) |
| US-CRDT-03 | op 로그로 편집 이력 추적 가능 | 블록 SET-TYPE payload: `{blockId, blockType, clock, siteId}` — LWW 타입 변경 | ✅ | P4b (PR #9) |

### Presence (PRD §6 — US-PRES)

| 항목 | 설명 | 수용 기준 요약 | 상태 | Phase |
|------|------|--------------|------|-------|
| US-PRES-01 | 같은 페이지 접속자 아바타 확인 | 현재 페이지 접속자 목록(이름, 아바타 이미지)이 에디터 상단에 표시됨 | ⬜ | P6 |
| US-PRES-01 | 같은 페이지 접속자 아바타 확인 | presence 정보는 서버에 영속 저장하지 않음(메모리 내 상태, 재연결 시 재구독) | ⬜ | P6 |
| US-PRES-02 | 협업자 커서 위치가 에디터에 표시 | 협업자 커서 위치가 에디터 내에 컬러 표시(이름 레이블 포함)됨 | ⬜ | P6 |
| US-PRES-02 | 협업자 커서 위치가 에디터에 표시 | 커서 위치가 RGA 노드 id(anchorId)로 표현되어 op 적용 후에도 올바른 위치 유지 | ⬜ | P6 |
| US-PRES-02 | 협업자 커서 위치가 에디터에 표시 | presence 업데이트는 커서 이동 이벤트 시 debounce(50ms) 후 전송 | ⬜ | P6 |
| US-PRES-03 | "이 페이지 보는 중" 표시·소멸 | 페이지 접속 시 relay 서버에 presence 참여 알림, 탭 종료·페이지 이동 시 이탈 알림 | ⬜ | P6 |
| US-PRES-03 | "이 페이지 보는 중" 표시·소멸 | 사용자가 페이지를 떠나면 커서가 즉시 사라짐(relay 서버 disconnect 처리) | ⬜ | P6 |

### TDD 검증 속성 (07-collaboration-crdt.md §7)

| 속성 | 정의 | 테스트 방식 | 상태 | Phase |
|------|------|------------|------|-------|
| 수렴성 (Convergence) | 같은 op 집합을 다른 순서로 적용해도 최종 상태 동일 | 두 사이트에서 op를 교차 적용 후 `toText()` 결과 비교; 시드 PRNG property 300회 + 순열 검증 | ✅ | P4 |
| 멱등성 (Idempotency) | 같은 op를 여러 번 적용해도 한 번 적용과 동일 | insert op 2~3회 반복 적용 후 nodeMap 크기·`toText()` 불변 확인 | ✅ | P4 |
| 교환법칙 (Commutativity) | op 적용 순서를 바꿔도 최종 상태 동일 | 독립 op 2개 순열(2가지), 3개 순열(6가지) 모두 수렴 확인 | ✅ | P4 |
| 인과 버퍼링 (Causal Buffering) | originId 없는 op는 originId 도착 후 자동 적용 | originId op보다 의존 op를 먼저 도착시켜 pendingBuffer → drainBuffer 동작 확인; 체인 역순 도착 테스트 | ✅ | P4 |

> **P4b 2-level 재검증 (PR #9)**: 위 4속성을 블록 RGA 수준에서 재검증 완료 — 동시 분할 수렴(AC-12), 인라인 선도착 인과버퍼(AC-13), 임의순서·중복 수렴=멱등·교환(AC-14, 시드 PRNG property 120회). 블록 set-type은 (clock,siteId) LWW로 수렴.

### 통합 테스트 항목 (07-collaboration-crdt.md §7-2)

| 항목 | 설명 | 상태 | Phase |
|------|------|------|-------|
| 재접속 replay | 50개 op 적용 후 Snapshot 생성 → 새 RGA에 Snapshot + 이후 op replay → 원본과 `toText()` 동일 | ⬜ | P8 |
| presence 커서 유지 | 사이트 B 커서 anchorId 지정 → 사이트 A가 앞쪽에 삽입 → B의 anchorId가 동일 노드를 가리키는지 확인 | ⬜ | P6 |
| tombstone 커서 | 커서가 앵커링된 문자를 삭제 → `resolveAnchorToIndex()` fallback 동작 확인 | ⬜ | P6 |
| e2e (Playwright) | 브라우저 2개에서 동시 편집 후 양쪽 텍스트가 동일함을 확인 | ⬜ | P5 |
