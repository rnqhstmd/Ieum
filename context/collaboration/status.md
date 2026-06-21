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
>
> **P5 walking skeleton 완료 (PR #10, WebSocket relay)**: 신규 relay 서버(`apps/ws-relay`, room=pageId, join/op broadcast 발신자 제외/op-ack) + 클라 realtime 레이어(Transport 추상화·relayClient·diff→인라인 op) + 에디터 CRDT(DocState) 연결로 2탭 인라인 타이핑 라이브 수렴 구현. in-memory relay 통합 테스트로 검증(ws-relay 19 + web 94 통과). **후속(이 row 외 ⬜ 유지)**: CrdtOp DB 영속화(US-CRDT-02/03 P5 후반), 실 브라우저 Playwright e2e(TDD 검증 표), sync/snapshot·재접속 복원(P8), presence(P6). 구조 편집(Enter/Backspace) 수렴은 블록 op 전송 후속 슬라이스. 인증은 BR-5 목 처리(localhost, 후속 강화).
>
> **P6 presence walking skeleton 완료 (PR #11, 아바타 목록)**: relay `RoomRegistry`에 presence 상태/색상 슬롯 확장(join 메시지에 displayName 운반, self+roster+broadcast Dispatch, leave→presence-leave), 신규 메시지 `presence-update`/`presence-leave`, 클라 `usePresence` 훅(순수 reducer)·`PresenceAvatars`(색 배지+이니셜)로 2탭 접속자 목록 실시간 수렴/이탈 구현. in-memory relay 통합 테스트로 검증(ws-relay 33 + web 116). displayName은 siteId 자동생성, 색상 8색 팔레트 서버 할당. **후속(이 row 외 ⬜ 유지)**: 라이브 커서(US-PRES-02, anchorId·debounce), presence 영속화, 실 인증, half-open heartbeat. 인증은 BR-5 연장(displayName 신뢰 중계).
>
> **P6 라이브 커서 완료 (PR #12, feat/p6-cursor — feat/p6-presence 위 적층)**: `@ieum/crdt`에 `resolveAnchorToIndex`(tombstone fallback)·`indexToAnchorId`(caret 직전 문자) 순수 함수 추가. relay `cursor`/`cursor-update` 메시지 + `handleCursor`(발신자 제외 broadcast, 비영속) + join-ack `clientId`(자기 식별). 클라 `useCursor` 훅·Editor 50ms debounce 전송·원격 커서 오버레이(색막대+이름). **US-PRES-01/02/03 전부 ✅ — presence 슬라이스 완결.** anchorId↔index·2탭 수렴은 crdt 순수 단위 + in-memory relay 통합으로 검증(crdt 64 + ws-relay 43 + web 134). **후속**: 선택영역 커서, 서버 cursor rate-limit, FR-7 이름 자동숨김, presence/cursor 영속화·실 인증.
>
> **P5 후반 op 영속화 완료 (PR #14, feat/p5b-op-persistence — main 위 단독)**: SSOT 정본대로 **Node ws-relay가 op를 Postgres `crdt_ops`에 append-only 영속화**(US-CRDT-02/03)한다. 영속화를 `OpStore` 포트(InMemoryOpStore fake/fallback + PgOpStore 실DB)로 격리해 `RoomRegistry.handleOp(outcome)`는 순수 유지(`persisted`→[ack,broadcast]/`duplicate`→[ack]/`rejected`→[]). 멱등은 `(page_id,site_id,seq)` 유니크 + `ON CONFLICT DO NOTHING`. 서버 어댑터는 영속화 선행 후 dispatch(미영속 무전파) + 소켓별 직렬화로 `server_seq` 도착순서 보존. **Flyway V3**로 `op_type` CHECK를 wire opType 5종(소문자)으로 확장(Spring `collaboration` 스텁은 폐기 — INSERT 코드 0건). 검증: 단위 + testcontainers 통합(V1~V3·user→workspace→page 픽스처)로 ws-relay 61 + web 135 + backend gradle BUILD SUCCESSFUL. **후속**: 재접속 op replay·Snapshot(P8), WS 연결/페이지 인가(WS-AUTH, 교차 room 영속화 인가 공백 마감), 자동저장 클라 save-port 배선(US-EDIT-02), 실 e2e.

---

## 요구사항 추적

### 실시간 공동편집 (PRD §5 — US-CRDT)

| 항목 | 설명 | 수용 기준 요약 | 상태 | Phase |
|------|------|--------------|------|-------|
| US-CRDT-01 | 편집이 상대방 화면에 즉시 반영 | 2인 이상 동시 편집 시 모든 클라이언트가 동일한 최종 텍스트로 수렴 | ✅ | P5 (PR #10) |
| US-CRDT-01 | 편집이 상대방 화면에 즉시 반영 | op가 WebSocket relay로 전송되고 같은 페이지의 다른 클라이언트에 broadcast됨 | ✅ | P5 (PR #10) |
| US-CRDT-01 | 편집이 상대방 화면에 즉시 반영 | 동일 위치 동시 삽입이 siteId 기준 결정론적 순서로 해소됨 | ✅ | P4 |
| US-CRDT-02 | 재연결 후 편집 내용 유실 없음 | 신규 접속 클라이언트가 snapshot 또는 op 재생으로 초기화됨 | ⬜ | P8 |
| US-CRDT-02 | 재연결 후 편집 내용 유실 없음 | 모든 op가 CrdtOp 테이블에 append-only로 저장됨 | ✅ | P5 후반 (PR #14) |
| US-CRDT-03 | op 로그로 편집 이력 추적 가능 | CrdtOp 테이블 append-only 보장, 감사 추적 가능 | ✅ | P5 후반 (PR #14) |
| US-CRDT-03 | op 로그로 편집 이력 추적 가능 | wire 봉투: `{siteId, seq, opType, payload}` — payload는 아래 정본 구조 | ✅ | P4b (PR #9) |
| US-CRDT-03 | op 로그로 편집 이력 추적 가능 | 인라인 INSERT payload: `{id, originId, value, blockId}` (blockId로 블록 스코프) | ✅ | P4b (PR #9) |
| US-CRDT-03 | op 로그로 편집 이력 추적 가능 | 인라인 DELETE payload: `{targetId, blockId}` — tombstone 처리 | ✅ | P4b (PR #9) |
| US-CRDT-03 | op 로그로 편집 이력 추적 가능 | 블록 INSERT payload: `{id, originId, blockType}` — 외부 블록 RGA 삽입 | ✅ | P4b (PR #9) |
| US-CRDT-03 | op 로그로 편집 이력 추적 가능 | 블록 DELETE payload: `{targetId}` — 외부 블록 RGA tombstone | ✅ | P4b (PR #9) |
| US-CRDT-03 | op 로그로 편집 이력 추적 가능 | 블록 SET-TYPE payload: `{blockId, blockType, clock, siteId}` — LWW 타입 변경 | ✅ | P4b (PR #9) |

### Presence (PRD §6 — US-PRES)

| 항목 | 설명 | 수용 기준 요약 | 상태 | Phase |
|------|------|--------------|------|-------|
| US-PRES-01 | 같은 페이지 접속자 아바타 확인 | 현재 페이지 접속자 목록(이름, 아바타)이 에디터 상단에 표시됨 | ✅ | P6 (PR #11) |
| US-PRES-01 | 같은 페이지 접속자 아바타 확인 | presence 정보는 서버에 영속 저장하지 않음(메모리 내 상태) | ✅ | P6 (PR #11) |
| US-PRES-02 | 협업자 커서 위치가 에디터에 표시 | 협업자 커서 위치가 에디터 내에 컬러 표시(이름 레이블 포함)됨 | ✅ | P6 (PR #12) |
| US-PRES-02 | 협업자 커서 위치가 에디터에 표시 | 커서 위치가 RGA 노드 id(anchorId)로 표현되어 op 적용 후에도 올바른 위치 유지 | ✅ | P6 (PR #12) |
| US-PRES-02 | 협업자 커서 위치가 에디터에 표시 | presence 업데이트는 커서 이동 이벤트 시 debounce(50ms) 후 전송 | ✅ | P6 (PR #12) |
| US-PRES-03 | "이 페이지 보는 중" 표시·소멸 | 페이지 접속 시 relay 서버에 presence 참여 알림, 탭 종료·페이지 이동 시 이탈 알림 | ✅ | P6 (PR #11) |
| US-PRES-03 | "이 페이지 보는 중" 표시·소멸 | 사용자가 페이지를 떠나면 아바타가 즉시 사라짐(relay disconnect→presence-leave) | ✅ | P6 (PR #11) |

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
| presence 커서 유지 | 사이트 B 커서 anchorId 지정 → 사이트 A가 앞쪽에 삽입 → B의 anchorId가 동일 노드를 가리키는지 확인 | ✅ | P6 (PR #12) |
| tombstone 커서 | 커서가 앵커링된 문자를 삭제 → `resolveAnchorToIndex()` fallback 동작 확인 | ✅ | P6 (PR #12) |
| e2e (Playwright) | 브라우저 2개에서 동시 편집 후 양쪽 텍스트가 동일함을 확인 | ⬜ | P5 |
