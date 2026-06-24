# 설계서: P11 — CRDT 재접속 복원 · 구조편집 수렴 · e2e Playwright

## 설계 규모
**대형** — 3그룹(재접속 복원 / 구조편집 수렴 / e2e) 단일 슬라이스. ws-relay(protocol/room/server/opStore/pgOpStore)·web(protocol/relayClient/useCrdtDocument/crdtDocument/Editor/EditorContainer)·신규 e2e 인프라까지 4개 패키지를 가로지른다. packages/crdt·backend 무변경.

## 아키텍처 개요

**데이터 흐름 — 재접속 복원 (그룹 A)**
1. 클라가 connect→join 송신(relayClient onOpen→join).
2. server.ts join 체인: ① `registry.join(handle, pageId, presence)`로 신규 소켓을 room에 **먼저 등록**(broadcast 대상화) → ② `await opStore.loadByPage(pageId)`(serverSeq ASC) → ③ `op-batch` 송신.
3. fetch(②) 동안 다른 클라가 보낸 실시간 op는 ①의 등록 덕에 broadcast로 신규 소켓에도 전달됨.
4. 클라 onOpBatch: ops 순차 `applyDocOp` 후 bump 1회. 실시간 op는 onRemoteOp에서 즉시 `applyDocOp`(crdt 인과버퍼·멱등이 순서/중복 흡수) → 기존 접속자와 동일 `toText()` 수렴.

**데이터 흐름 — 구조편집 (그룹 B)**
1. Editor `handleKeyDown`이 Enter/Backspace를 `preventDefault` + DOM caret offset 계산 → `onEnter(blockId,offset)`/`onBackspace(blockId)` 호출. 마크다운 단축키는 `handleInput`이 `detectBlockTypeShortcut`로 감지 → prefix 제거(diffBlockText 경로) + `onSetType`.
2. useCrdtDocument 콜백이 crdt `splitBlock`/`mergeBlockWithPrev`/`setBlockType`을 **직접 호출**(로컬 즉시 적용 + 전송용 op 반환).
3. 반환 op들을 개별 `toWire`→`client.sendOp`로 relay 전송 → peer가 onRemoteOp `applyDocOp`로 수렴.
4. 렌더 진실원천은 `docToBlocks(doc)` — 로컬·원격 모두 자동 반영.

## 변경 범위

**ws-relay** (`apps/ws-relay/src/`)
- `protocol.ts` [수정] — `OpBatchMsg` 타입 추가, `ServerToClient` 유니온 합류(서버→클라 전용).
- `opStore.ts` [수정] — `OpStore` 포트에 `loadByPage(pageId)` **필수** 메서드 추가, `InMemoryOpStore`에 pageId별 wire 봉투 누적·조회 구현.
- `pgOpStore.ts` [수정] — `loadByPage(pageId)` 실 DB SELECT(serverSeq ASC, wire 봉투 복원) 구현.
- `room.ts` [수정] — `RoomRegistry.join`에 optional `ops?` 인자 추가, op-batch Dispatch 포함(순수 유지).
- `server.ts` [수정] — join 비동기 체인에서 등록→`loadByPage`→op-batch 송신 순서 구현.
- `tests/server.test.ts` [수정] — 인라인 fake(`fakeStore`/`recordingStore`)에 `async loadByPage(){ return [] }` 보강(기존 61개 그린 유지).

**web** (`apps/web/`)
- `src/lib/realtime/protocol.ts` [수정] — `OpBatchMsg` 타입 + `parseServerMessage`에 `op-batch` case.
- `src/lib/realtime/relayClient.ts` [수정] — `onOpBatch?` 핸들러 + onMessage switch case.
- `src/lib/editor/crdtDocument.ts` [수정] — **순수 함수 `detectBlockTypeShortcut(text)` 1개만 신규 추가**(마크다운 파싱). 패스스루 래퍼 없음.
- `src/lib/editor/useCrdtDocument.ts` [수정] — `onOpBatch` replay 핸들러, `onEnter`/`onBackspace`/`onSetType` 개별 콜백 노출, `sendOps` 헬퍼.
- `components/editor/Editor.tsx` [수정] — `handleKeyDown` Enter/Backspace 배선, `handleInput` 단축키 감지, DOM offset 매핑.
- `components/editor/EditorContainer.tsx` [수정] — 새 콜백 prop 전달.

**e2e** (신규)
- `apps/web/playwright.config.ts` [신규] — `use.storageState` 사전주입, `testDir:'./e2e'`, `testMatch:'**/*.e2e.ts'`, webServer 미사용.
- `apps/web/e2e/convergence.e2e.ts` [신규] — 2-브라우저 동시 편집 수렴 재현(AC-C1).
- `apps/web/e2e/restore.e2e.ts` [신규] — 재접속 복원 재현(AC-C2/C3).
- `apps/web/e2e/README.md` [신규] — 로컬 구동(DB/relay/web) + storageState 저장 절차.
- `apps/web/package.json` [수정] — `e2e` 스크립트 + `@playwright/test` devDependency.

**packages/crdt / backend**: 변경 없음(BR-5).

## 적용 컨벤션
- **포트-어댑터**: I/O는 포트(`OpStore`, `MembershipStore`) 뒤로 격리, InMemory(fake)+Pg(실DB) 쌍. `RoomRegistry`는 순수(`Dispatch[]` 반환만) → fake `ClientHandle` 단위 테스트.
- **메시지 계약 대칭 복제**: ws-relay `protocol.ts`와 web `protocol.ts`가 동일 계약 각자 복제. 양쪽에 파서 + proto-pollution 가드(`hasDangerousKey`) + 구조 검증.
- **순수 로직 분리**: 비즈니스 로직은 React 무관 순수 함수(`diffBlockText`)로, 훅은 배선만. crdt op 생성·로컬 적용은 `packages/crdt`가 소유.
- **네이밍**: 메시지 타입 케밥(`op-batch`), 인터페이스 PascalCase+`Msg`, op 생성자 `make*Op`, 콜백 `on*`(평면).
- **wire 봉투**: `WireEnvelope{siteId,seq,opType,payload:AnyOp}`. relay는 op 불투명 전달. PgOpStore가 `opType`(소문자 5종) 그대로 INSERT(V3 CHECK 정합).
- **소켓 직렬화**: server.ts 소켓별 `socketChain` promise로 join→op FIFO(join이 op보다 먼저 `connPage` 설정).
- **테스트**: vitest. ws-relay 단위(`tests/*.test.ts`)+통합(`*.int.test.ts`, testcontainers). web `inMemoryRelay`(실 RoomRegistry+FakeTransport)로 풀 라우팅 수렴 검증.

## 상세 설계

### 결정 1 — `op-batch` 메시지 계약
**ws-relay `protocol.ts`**: `OpBatchMsg{ type:'op-batch'; pageId:string; ops:WireEnvelope[] }`(serverSeq ASC, 각 항목은 OpMsg.op와 동일 wire 봉투). `ServerToClient` 유니온 합류. 서버→클라 전용(ClientToServer 미추가).
**web `protocol.ts`**: 동일 타입 + `parseServerMessage`에 `op-batch` case — `pageId` string, `ops` 배열, 각 항목 `isWireEnvelope(e)`(기존 재사용), 위반 시 null.
- 고려: ops 길이 상한은 신뢰 환경(BR-5) 미적용. `maxPayload`(64KiB, server.ts:24)는 ws **수신** 한도 — 서버 **송신** op-batch엔 미적용(위험 1).

### 결정 2 — `OpStore.loadByPage(pageId): WireEnvelope[]` (serverSeq ASC, 필수)
**포트**: `loadByPage(pageId): Promise<WireEnvelope[]>` 필수 추가.
**InMemoryOpStore**: pageId별 `opsByPage: Map<string, WireEnvelope[]>`. append() persisted 분기에서만 push(duplicate/rejected 미축적 → 멱등). loadByPage는 방어 복사 반환. append 순서=server_seq 순서 → 정렬 불요.
**PgOpStore**: `SELECT site_id, seq, op_type, payload FROM crdt_ops WHERE page_id=$1 ORDER BY server_seq ASC`. `isUuid` 가드(22P02 회피). row→WireEnvelope 재조립(siteId=site_id, seq=Number(seq), opType=op_type[소문자 5종=AnyOp type, V3 정합], payload=row.payload[jsonb 자동 파싱]). JSON.parse 불필요. RgaId/originId 구조 무손실 round-trip → applyDocOp 입력 직접 사용. backend OpType enum 미경유.

### 결정 3 — join op-batch 송신 + 유실방지 (BR-2, AC-A3/A5)
**불변식**: 신규 소켓을 broadcast에 **먼저 등록**(registry.join) 후 op-batch fetch·송신.
**room.ts**: `join(client, pageId, presence?, ops?: WireEnvelope[]): Dispatch[]`. Dispatch[0]=join-ack(불변), [1]=op-batch(ops 주어질 때만, 미전달 시 생략=하위호환), 이후 presence self/roster/peer broadcast.
**server.ts**: `sendAll(registry.join(handle, pageId, presence))`(1 등록) → `try{ ops=await opStore.loadByPage(pageId) }catch{ ops=[] }`(2 fetch, 실패 시 빈 batch=AC-A4 동형) → `sendAll([{target:handle, message:{type:'op-batch', pageId, ops}}])`(3 송신).
- 유실방지 근거: (1) 등록으로 (2) await 중 도착 실시간 op가 신규 소켓에도 broadcast. op-batch와 겹쳐도 클라 멱등(nodeMap.has)으로 무시(AC-A5). 실시간 op가 먼저 와도 applyDocOp 인과버퍼가 미도착 origin 보류·drain(AC-A3). socketChain FIFO로 같은 소켓 op는 op-batch 후 처리.

### 결정 4 — 클라 replay (useCrdtDocument) + 유실방지 역할 구분
**유실방지 정합성 근거 = packages/crdt 4중 인과버퍼(pendingBuffer/pendingDeletes/pendingInline/pendingSetType) + 멱등(nodeMap.has).** 별도 보류 큐를 정합성 목적으로 두지 않음.
**relayClient.ts**: `onOpBatch?(ops)` 핸들러 + onMessage `case 'op-batch'`.
**useCrdtDocument.ts**:
- `onRemoteOp(env)`: 항상 즉시 `applyDocOp(doc, fromWire(env))`. `if (!restoringRef.current) bump()`.
- `onOpBatch(ops)`: `restoringRef.current=true` → ops 순차 applyDocOp(멱등) → `restoringRef.current=false` → bump 1회.
- **역할 구분(명시)**: 유실방지(BR-2/AC-A3)=crdt 인과버퍼·멱등. `restoring` 플래그=**렌더 배칭(replay 중 중간 bump 억제)** 전용, 정합성 메커니즘 아님.
**GENESIS 복원 정합 (M1)**:
- genesis `block-insert`는 **crdt_ops에 영속화되지 않음**(`createCollaborativeDocument`(crdtDocument.ts:25-31)가 `GENESIS_BLOCK_ID{0,'genesis'}` 블록을 로컬 applyDocOp만, relay 미전송).
- 따라서 op-batch = (a) genesis blockId 위 인라인 op + (b) 구조편집 block-insert/delete/set-type만 포함.
- 모든 탭이 동일 genesis 로컬 생성 → replay된 인라인 op blockId(={0,'genesis'})가 신규 탭 로컬 genesis 인라인 RGA에 정확 라우팅(applyDocOp insert/delete가 idKey(blockId)로 inlineRgas 조회).
- 빈 문서(AC-A4): op-batch [] → 로컬 genesis 1개 유지. **createCollaborativeDocument 무변경.**
- 이 라우팅은 **ws-relay 통합테스트 AC-A2**("abc" 인라인 op replay → 신규 접속자 genesis 블록 "abc" 수렴)가 검증.
- genesis merge 삭제 문서 복원: 신규 탭 genesis 재생성 + op-batch genesis block-delete 멱등 tombstone 수렴.

### 결정 5 — 구조편집 배선 (래퍼 없이 crdt 직접 호출)
**책임 분리**: Editor.tsx=DOM caret→(blockId,offset) 매핑 + 키/입력 라우팅(얇게). op 생성·로컬 적용=useCrdtDocument 콜백이 crdt 직접 호출. 마크다운 파싱만 crdtDocument.ts 순수함수.
**crdtDocument.ts**: 순수함수 1개만 신규 — `detectBlockTypeShortcut(text): {type:BlockType; consumed:number}|null` ('### '→heading3/4, '## '→heading2/3, '# '→heading1/2, '- '→bullet/2, 미해당 null). 패스스루 래퍼 없음.
**useCrdtDocument.ts**: `sendOps(ops)` 헬퍼(client null 가드, `client.sendOp(toWire(op, ++seqRef.current, doc.siteId))`, bump). 콜백:
- `onEnter(blockId, offset)` → `sendOps(splitBlock(doc, blockId, offset))`.
- `onBackspace(blockId)` → `const ops = mergeBlockWithPrev(doc, blockId); if (ops) sendOps(ops)` (첫 블록 null→무동작 BR-4).
- `onSetType(blockId, type)` → `sendOps([setBlockType(doc, blockId, type)])`.
- import 추가: `splitBlock, mergeBlockWithPrev, setBlockType` from `@ieum/crdt`.
**Editor.tsx**: props에 optional `onEnter`/`onBackspace`/`onSetType` 추가.
- `handleKeyDown`: Enter(!shiftKey)→preventDefault, `offset=getCaretOffset(currentTarget, block.text.length)`, `onEnter?.(block.id, offset)`. Backspace→offset 계산, `if(offset===0){ preventDefault(); onBackspace?.(block.id) }`.
- 마크다운(FR-B3, Q3=제거+set-type): `handleInput`에서 `detectBlockTypeShortcut(newText)` 감지 시 ① `onBlockInput(block.id, newText.slice(consumed))`(기존 diffBlockText가 인라인 delete op 생성·전송) ② `onSetType(block.id, type)`.
- DOM caret→offset 책임=Editor(`getCaretOffset` L27-45, Range로 가시 offset 계산=splitBlock cursorIndex).
- **FR-B6 best-effort 커서(Q2)**: 블록 병합(텍스트 수렴) 완전 구현, 병합 후 커서는 직전 블록 포커스 이동까지만(끝 정밀 offset 후속). 정밀 Selection 복원 코드 미추가.
**EditorContainer.tsx**: useCrdtDocument의 onEnter/onBackspace/onSetType을 Editor에 전달.

### 결정 6 — e2e (Playwright, apps/web, storageState 사전주입)
- **e2e는 자동 verify 게이트 비포함(로컬 수동)** — 회귀 방어는 vitest 통합(ws-relay testcontainers + web inMemoryRelay)이 담당, e2e는 실 브라우저 풀스택 **재현·수동 검증 산출물**.
**playwright.config.ts**: `testDir:'./e2e'`, `testMatch:'**/*.e2e.ts'`(vitest와 분리), `use.baseURL=process.env.E2E_BASE_URL ?? 'http://localhost:3000'`, `use.storageState=process.env.E2E_STORAGE_STATE ?? './e2e/.auth/state.json'`(Q1 사전주입), webServer 미설정, chromium.
**convergence.e2e.ts**(AC-C1): 2 BrowserContext(storageState), pageA/pageB goto `/page/${PAGE_ID}`, A·B 입력 → relay 교환 대기 → 양쪽 `[data-block-id]` textContent 동일 `expect.toPass`.
**restore.e2e.ts**(AC-C2/C3): A 입력 후 B 새 접속 → B에 A 내용 표시.
**package.json**: `"e2e":"playwright test"`, `"e2e:install":"playwright install chromium"`, devDep `@playwright/test ^1.49.0`.
**README.md**: 1.DB 기동+Flyway+유효 pageId(UUID, FK) 시드 2.`pnpm --filter ws-relay start` 3.`pnpm --filter web dev` 4.storageState 저장(로컬 1회 로그인→`e2e/.auth/state.json`, UI 로그인 스텝·우회 코드 미사용) 5.`pnpm --filter web e2e`.

## 의존성·영향도
- 새 의존성: `@playwright/test`(web devDep)만. packages/crdt 외부 의존성 0(BR-5).
- room.ts join optional `ops?` → 기존 호출부 미전달 → op-batch 생략 → 무영향. Dispatch[0]=join-ack 불변.
- OpStore.loadByPage 필수 추가 → server.test 인라인 fake에 `async loadByPage(){return []}` 동시 보강(T1).
- relayClient onOpBatch optional, Editor 새 prop optional → 미주입 시 기존 동작 유지 → 무영향.
- 하위호환: op-batch 신규 타입, 기존 op broadcast 경로 불변. PgOpStore loadByPage read-only.
- 목표: ws-relay 61 · web 135 무회귀. fake store loadByPage 보강이 유일 기존 수정.

## 구현 순서 (RGR 태스크 → AC)

**Group A — 재접속 복원**
- **T1** [Must] OpStore.loadByPage 포트 + InMemoryOpStore + server.test fake 보강 (의존 없음) → AC-A1(부분)/A4. 검증 opStore.test.ts(round-trip, duplicate 미축적, 순서).
- **T2** [Must] PgOpStore.loadByPage SELECT serverSeq ASC 봉투 복원 (T1) → AC-A1/BR-1. 검증 pgOpStore.int.test.ts(testcontainers, ASC·무손실).
- **T3** [Must] ws-relay protocol OpBatchMsg (없음) → AC-A2. 검증 protocol.test.ts.
- **T4** [Must] room.join op-batch Dispatch[1](ops 인자) (T3) → AC-A2. 검증 room.test.ts([1]=op-batch, 미주입 생략, [0] 불변).
- **T5** [Must] server.ts join 체인: 등록→loadByPage→op-batch (T1,T2,T4) → AC-A1/A3/A5/BR-2. 검증 server.int.test.ts: AC-A3는 fake loadByPage **deferred Promise**로 [선등록→실시간 op→resolve→op-batch] race를 sleep 없이 재현.
- **T6** [Must] web protocol OpBatchMsg + parse case (없음) → AC-A2. 검증 protocol.test.ts.
- **T7** [Must] relayClient onOpBatch (T6) → AC-A2. 검증 relayClient.test.ts.
- **T8** [Must] useCrdtDocument onOpBatch replay(restoring=렌더배칭)+onRemoteOp 즉시적용 (T7) → AC-A2/A3/A4/A5. 검증 convergence.test.ts("abc" replay→genesis 수렴, 멱등 2회, 빈 batch genesis 유지); 핸들러 동기성 비의존 최종 toText() 수렴 단언.

**Group B — 구조편집** (T9 병렬 가능)
- **T9** [Must] crdtDocument.detectBlockTypeShortcut 순수함수 (없음) → FR-B3 파싱. 검증 crdtDocument.test.ts(prefix별 type/consumed, 미해당 null).
- **T10** [Must] useCrdtDocument onEnter/onBackspace/onSetType + sendOps (T8 동일파일) → AC-B1/B2/B3 전송. 검증 convergence.test.ts(split/merge/set-type 2탭 수렴).
- **T11** [Must] Editor.tsx handleKeyDown 배선 + handleInput 단축키/prefix 제거 + DOM offset (T10) → AC-B1/B2/B3/B4. 검증 Editor.test.tsx(Enter→onEnter(offset), Backspace at 0→onBackspace, 단축키→onSetType+slice; jsdom getCaretOffset 정밀성 단언 금지=콜백 호출/인자만).
- **T12** [Must] EditorContainer 콜백 prop 전달 (T10,T11) → 배선 완성. 검증 기존 통합 렌더.
- ※ AC-B3(genesis Backspace 무동작)/B5(inheritType)/B6(동시분할 tie-break)은 packages/crdt block.test.ts 기커버.

**Group C — e2e** (배선 후)
- **T13** [Must] @playwright/test 설치 + playwright.config.ts(storageState) + package.json 스크립트 (없음) → FR-C1 인프라.
- **T14** [Must] convergence.e2e.ts 2-브라우저 동시편집 (T8,T12,T13) → AC-C1. 로컬 수동.
- **T15** [Should] restore.e2e.ts 재접속 복원 (T8,T13) → AC-C2/C3. 로컬 수동.
- **T16** [Must] e2e/README.md 구동+storageState 절차 (T13) → FR-C2/Q1.

**병렬**: {T1,T3,T6,T9} 의존 없음. A(T1→T2→T5)∥B(T9). e2e는 T8,T12 후.
**AC-A3 결정론**: ws-relay 통합 fake loadByPage deferred resolve로 race 재현(sleep 금지); web 단위는 최종 toText() 수렴만 단언.

## 위험·트레이드오프
1. **op-batch 크기 vs maxPayload(64KiB 수신한도, 송신 미적용)** — 수천 op 페이지는 청크 분할 필요(범위 밖, Snapshot 슬라이스). 전체 replay는 단순하나 op 수 비례 batch 증가.
2. **AC-B6 동시 splitBlock 블록 중복(수용된 한계)** — 동시 Enter 시 양쪽이 tail 복제 → "Hello/World/World" 가능. AC-B6 Then은 "양쪽 docToBlocks 동일 + siteId tie-break"만 요구, packages/crdt block.test.ts(AC-12)가 기검증. 중복 제거는 CRDT split 본질 한계로 범위 밖(crdt 무변경).
3. **GENESIS 공존 가정** — 모든 탭 로컬 genesis 생성·genesis 미영속(M1). 현재 createCollaborativeDocument가 강제하므로 안전.
4. **fetch 실패→빈 batch** — loadByPage 예외 시 빈 op-batch(AC-A4 동형). 재join 복구(영구 손실 아님).
5. **FR-B6 커서 best-effort** — 정밀 caret 복원은 contenteditable 단방향과 충돌 가능, 포커스 이동까지만(Q2).
6. **e2e storageState 만료** — 만료 시 재저장(README). 자동 갱신 범위 밖.

## 확인이 필요한 사항
추가 확인 사항 없음. 설계가 완료되었습니다.

---

## Testability 평가 (test-architect)

**Testability Score: 8/10 — ✅ PASS (≥7)**. RGR 진입 가능.

### 컴포넌트별 격리 전략 (red-writer 참조)
- **OpStore.loadByPage(InMemory)**: 외부 의존 0, InMemoryOpStore가 곧 fake. 단위 — append N건→loadByPage round-trip, 빈 page []·duplicate 미축적·다른 page 격리·비UUID. `opStore.test.ts` 패턴. **포트에 필수 추가 시 server.test 인라인 fake 컴파일 영향 → `async loadByPage(){return []}` 동시 보강(T1)**.
- **PgOpStore.loadByPage**: testcontainers + Flyway V1~V3 + user→ws→page 픽스처(`pgOpStore.int.test.ts` 패턴). 5종 opType 시드→ASC 배열·소문자 보존·jsonb 파싱·비UUID [].
- **protocol op-batch(양쪽)**: 순수, `protocol.test.ts`. 타입/유니온, parseServerMessage 파싱·null.
- **RoomRegistry.join op-batch**: 순수 Dispatch[], fake ClientHandle(`room.test.ts`). [0]=join-ack 불변, ops 주입 시 [1]=op-batch, 미주입 생략.
- **server.ts join 체인(핵심 리스크)**: opStore DI(fake 주입). AC-A1=fake 50건→op-batch 길이·ASC. **AC-A3 BR-2 race=fake loadByPage를 수동 resolve deferred Promise로 [등록→실시간 op→resolve→op-batch] 결정론 재현(sleep 금지)**.
- **relayClient.onOpBatch**: FakeTransport.emitMessage(op-batch)→핸들러 호출(`relayClient.test.ts`).
- **useCrdtDocument replay(핵심 리스크)**: renderHook+createFakeTransport+act(`useCrdtDocument.test.tsx`). 내부 restoringRef 직접 단언 불가 → 동작 검증: emitMessage(op-batch "abc")→blocks[0].text==='abc'; ops:[]→genesis 1개; AC-A3=보류→drain 순서로 재구성, **최종 toText() 수렴만 단언(핸들러 동기성 비의존, flaky 회피)**. transportFactory DI.
- **crdtDocument.detectBlockTypeShortcut**: 순수, 테이블 단언(`crdtDocument.test.ts`).
- **구조편집 2탭 수렴**: inMemoryRelay(실 RoomRegistry+FakeTransport, `convergence.test.ts`). ※FakeTransport onOpen 미fire → client.join 수동 호출. AC-B1/B2/B4. AC-B3=단위(genesis index0 Backspace→sent op 0·불변).
- **Editor.tsx 배선**: jsdom. **getCaretOffset 정밀성 단언 금지(try/catch fallback) → 콜백 호출/인자 형태만**(Enter→onEnter(offset), Backspace at 0→onBackspace, 단축키→onSetType). split 위치 정확성은 inMemoryRelay(offset 직접 주입)+e2e.
- **e2e**: 수동 검증 항목(자동 게이트 비포함). storageState·UUID pageId 시드 전제.

### AC별 검증 레이어
| AC | 레이어 | RED 가능 |
|----|--------|:---:|
| AC-A1 | ws-relay 통합(testcontainers)+InMemory 단위 | ✅ |
| AC-A2 | ws-relay 통합 / web 단위 | ✅ |
| AC-A3 | ws-relay 통합(deferred fake, 주)+web 단위(보조) | ⚠️ 조건부(타이밍→deferred로 결정론) |
| AC-A4 | ws-relay 단위(room)+web 단위 | ✅ |
| AC-A5 | packages/crdt 단위(기존 멱등) | ✅ |
| AC-B1 | web 통합(inMemoryRelay)+crdt 단위 | ✅ |
| AC-B2 | web 통합 | ✅ |
| AC-B3 | web 단위 | ✅ |
| AC-B4 | web 통합 | ✅ |
| AC-B5 | packages/crdt 단위(기존 inheritType) | ✅ |
| AC-B6 | packages/crdt 단위(기존 AC-12) | ✅ |
| AC-C1/C2 | Playwright e2e | 🔶 수동 |

자동 검증 AC 11개 중 10 ✅, 1(AC-A3) 조건부. e2e 2개 수동.

### 비차단 권고(반영됨)
1. loadByPage 필수 + 기존 fake 보강(T1). 2. AC-A3 deferred fake 결정론 + 최종 toText 수렴 단언. 3. AC-B1/B2 offset 책임분리(Editor 단위는 콜백만, 정확성은 통합+e2e).
