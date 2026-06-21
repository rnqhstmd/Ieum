# 설계 초안: P5 WebSocket Relay Walking Skeleton (architect, 미확정)

## 설계 규모
**대형** — 신규 서버 패키지(`apps/ws-relay`) + 클라이언트 transport 레이어 신규 + 에디터 진실 원천 교체(`EditorBlock[]` → `DocState`).

## 범위
walking skeleton: relay 서버 + 클라 송수신 + 에디터 CRDT 연결 + 2탭 라이브 수렴. 범위 밖: DB 영속화, sync-request/response, snapshot, presence, 재접속 missing-op 복원, 정식 인증, 블록 단위 op 실시간 전송.

## 변경 범위

**신규 패키지: `apps/ws-relay`** (relay 서버)
- `apps/ws-relay/package.json` — `@ieum/ws-relay`(가칭), `ws` 의존, ESM, vitest
- `apps/ws-relay/tsconfig.json`
- `apps/ws-relay/src/protocol.ts` — 메시지 타입(C↔S 계약). 순수 타입. `WireEnvelope` 재사용
- `apps/ws-relay/src/room.ts` — **순수 RoomRegistry + 라우팅 로직** (transport 비의존)
- `apps/ws-relay/src/server.ts` — `ws` 어댑터(transport). room.ts 호출
- `apps/ws-relay/src/main.ts` — 엔트리포인트(포트 3001)
- `apps/ws-relay/tests/room.test.ts` — 순수 라우팅 단위 테스트

**신규 파일: `apps/web`** (클라이언트)
- `apps/web/src/lib/realtime/protocol.ts` — 클라 메시지 타입(서버와 동일 계약, walking skeleton에선 복제)
- `apps/web/src/lib/realtime/transport.ts` — `Transport` 인터페이스 + `WebSocketTransport` + `createRetryingTransport`(FR-7)
- `apps/web/src/lib/realtime/relayClient.ts` — 순수 클라 세션(join/op 송신, 수신 라우팅). Transport 주입
- `apps/web/src/lib/editor/crdtDocument.ts` — DocState 바인딩 + **텍스트 diff → 인라인 op 생성** 순수 로직
- `apps/web/src/lib/editor/useCrdtDocument.ts` — DocState를 React 상태로 관리하는 훅
- `apps/web/tests/realtime/relayClient.test.ts` — fake transport 송수신 테스트
- `apps/web/tests/realtime/convergence.test.ts` — **2탭 수렴 통합 테스트**(AC-8 대체)
- `apps/web/tests/editor/crdtDocument.test.ts` — diff 알고리즘 단위 테스트

**수정 파일**
- `apps/web/components/editor/EditorContainer.tsx` — `EditorBlock[]` useState 제거 → `useCrdtDocument(pageId)`
- `apps/web/components/editor/Editor.tsx` — `EditorBlockView`(id: RgaId) 기반, handleInput이 diff 기반 op emit
- `apps/web/src/lib/ws.ts` — **교체/삭제** (Spring Boot 가정 `/ws/pages/`, 8080 불일치)
- `apps/web/.env.local.example` — `NEXT_PUBLIC_WS_URL=ws://localhost:3001`

## 컨벤션
- ESM(`"type":"module"`), 상대 import `.js` 확장자, `import type` 명시(verbatimModuleSyntax).
- 순수 함수 분리 패턴: `room.ts`(순수)/`server.ts`(transport), `crdtDocument.ts`(순수)/`useCrdtDocument.ts`(훅).
- 테스트 vitest only. AC 번호를 `it()` 설명에 명시.
- @ieum/crdt 외부 의존성 0: relay는 op 타입/wire codec만 import(런타임 CRDT 미적용 — op 불투명 전달).

## 데이터 흐름
로컬 타이핑 → handleInput(blockId,newText) → diffText(old,new) → InlineInsert|InlineDelete op → (a) applyDocOp 로컬 즉시반영→docToBlocks→리렌더 (b) toWire→relayClient.sendOp → server room.handleOp → op-ack(발신자, 자기op 미적용 AC-10) + broadcast(발신자제외) → 탭B relayClient.onMessage → fromWire→applyDocOp(docState_B)→docToBlocks→리렌더.
join: 연결 → relayClient.join(pageId) → {type:"join",pageId} → room.handleJoin → {type:"join-ack",pageId,connectedClients:N}.

## 컴포넌트 설계 (인터페이스)

### relay 서버
- `protocol.ts`: JoinMsg/JoinAckMsg/OpMsg/OpAckMsg 타입 + `parseClientMessage(raw): ClientToServer|null`. op 필드는 `WireEnvelope`.
- `room.ts`: `RoomRegistry { join(client,pageId):Dispatch[]; handleOp(client,msg):Dispatch[]; leave(client):void; roomSize(pageId):number }`. `ClientHandle`(불투명 id), `Dispatch{target,message}`. **send 안 하고 "누구에게 무엇을" 반환** → fake로 단위 테스트. AC-9: handleOp는 broadcast 0이어도 op-ack 1개 항상 반환. AC-3/BR-2: broadcast 대상에서 발신 client 제외.
- `server.ts`: `createRelayServer({port,registry?}):Promise<RelayServer>`. `ws` WebSocketServer ↔ RoomRegistry 배선. ClientHandle↔소켓 `Map`. BR-5 인증 목 처리(localhost). 잘못된 JSON 무시.
- `main.ts`: `createRelayServer({port: env.PORT ?? 3001})`.

### client transport
- `Transport { send(data); onMessage(cb):unsub; onOpen(cb):unsub; onClose(cb):unsub; close() }`.
- `createWebSocketTransport(url)`, `createRetryingTransport(url,{delayMs?})`(FR-7 단순 retry, 재접속 후 join 재전송, missing-op 복원 범위밖).
- FakeTransport(메모리 큐) 주입으로 테스트.

### client relayClient
- `createRelayClient(transport, pageId, handlers): RelayClient`. handlers: onRemoteOp(env)/onJoinAck/onOpAck. `RelayClient { join(pageId); sendOp(env); dispose() }`.
- onMessage 구독 → JSON.parse → type 분기. onOpen 시 자동 join. AC-5: sendOp이 `{type:"op",pageId,op:env}` 전송. AC-10: 자기 op는 서버 미broadcast(BR-2)라 onRemoteOp 안 옴.

### crdt 바인딩 (텍스트 diff)
- `diffBlockText(doc, blockId, oldText, newText): AnyOp[]` — 공통 prefix p / suffix s 산출 → 삭제구간 old[p..len-s) 가시 index p에서 순차 삭제(DELETE 먼저) → 삽입구간 new[p..len-s) index p부터 한 문자씩 삽입. `localInlineDelete`/`localInlineInsert`(block.ts) 재사용(op id/originId/로컬적용 캡슐화). 한글 1글자 입력→INSERT 1개.
- `useCrdtDocument(pageId): { blocks:EditorBlockView[]; connectedClients; onBlockInput(blockId,newText) }`. 초기 createDocument(siteId=randomUUID per 탭), 빈 paragraph 1개. useRef<DocState>+version 카운터로 리렌더. useEffect에서 transport+relayClient 배선. onRemoteOp→applyDocOp(fromWire)→bump. onBlockInput→diffBlockText→toWire(++seq,siteId)→sendOp→bump.

### EditorContainer/Editor 와이어링
- EditorContainer: `useState<EditorBlock[]>` 제거 → `useCrdtDocument(pageId)`. title은 CRDT 범위밖 로컬 유지.
- Editor: `blocks:EditorBlockView[]`(id:RgaId), `data-block-id`/key=idKey(block.id). onInput→onBlockInput(blockId,newText)(Editor는 diff 모름, 새 텍스트만 전달). Enter/Backspace는 splitBlock/mergeBlockWithPrev 핸들러. 마크다운 단축키는 setBlockType+접두사 삭제 op로 재구현. 캐럿 복원 RgaId 기반 유지. **최대 회귀 표면** — AC-7 단위테스트 선보호.

## 2탭 수렴 검증 (Playwright 없음) — AC-8
- `convergence.test.ts`(vitest 통합): 두 DocState(siteId A/B) + 두 RelayClient를 **in-memory relay**로 연결. A diffBlockText op 생성+전송 → relay broadcast → B onRemoteOp → applyDocOp → `docToBlocks(docA)===docToBlocks(docB)` 검증.
- **(권장) in-memory relay**: RoomRegistry(순수) 직접 사용 + 두 FakeTransport 양방향 배선 헬퍼 `createInMemoryRelay()`. ws·네트워크 불필요, 결정적. RoomRegistry 라우팅(발신자 제외)을 실제 통과 → AC-3/8/10 함께 커버.
- (대안) in-process ws 서버 기동 — async/포트/정리 복잡, walking skeleton엔 과함.
- AC-10: A의 docToBlocks가 op-ack 수신 후에도 불변.

## 구현 순서 (RGR 분해, AC 매핑)
1. `apps/ws-relay` 스캐폴드(package/tsconfig/main 골격) — 인프라
2. `protocol.ts` + parseClientMessage — BR-1,BR-3
3. `room.ts` RoomRegistry + room.test.ts — FR-2,3 BR-2,6 / AC-2,3,4,9
4. `server.ts` ws 어댑터 + main.ts — FR-1 / AC-1
5. client `transport.ts`(Transport+WebSocketTransport) — 기반
6. client `protocol.ts` — BR-1
7. `relayClient.ts` + test(FakeTransport) — FR-4,5 / AC-5,6
8. `crdtDocument.ts` diffBlockText + test — FR-4 / AC-5
9. `useCrdtDocument.ts` 훅 — FR-5,6 / AC-6,7
10. `Editor.tsx` EditorBlockView 어댑트 — FR-6 / AC-7 (회귀 선보호)
11. `EditorContainer.tsx` 와이어링 — FR-6
12. `convergence.test.ts` 통합 — AC-8,10
13. createRetryingTransport(재연결) — FR-7
14. `.env.local.example`/ws.ts 정리
병렬 가능: {1},{5},{6},{8} 초기 병렬. 서버체인{2,3,4} vs 클라체인{5,6,7} 12에서 합류 전까지 독립.

## 미확정 질문 (오케스트레이터가 사용자에게 확인 예정)
1. relay URL 환경변수: (a)NEXT_PUBLIC_WS_URL을 3001로 변경+루트연결(권장) (b)신규 NEXT_PUBLIC_RELAY_URL 분리
2. Enter/Backspace 블록 op 전송: (a)인라인 타이핑만 전송, 구조편집 로컬전용(권장) (b)모든 op 전송
3. autosave 스텁: (a)유지(권장) (b)제거
4. 기존 document.ts: (a)남기되 import 제거 dead code화(권장) (b)즉시 제거
5. relay 패키지 이름/실행: 제안 @ieum/ws-relay, tsx 또는 tsc+node
