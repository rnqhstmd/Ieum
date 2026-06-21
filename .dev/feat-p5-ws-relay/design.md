# 설계: P5 WebSocket Relay Walking Skeleton (확정)

> architect 초안 + design-critic MUST-ADDRESS 3건 해소 + 사용자 결정 반영 + test-architect testability 평가(8/10 PASS) 병합. 2026-06-20 확정.

## 설계 규모
**대형** — 신규 서버 패키지(`apps/ws-relay`) + 클라이언트 transport/relay 레이어 신규 + 에디터 진실 원천 교체(`EditorBlock[]` → `@ieum/crdt` `DocState`).

## 범위 (확정)
**포함**: relay 서버(room=pageId) + 클라 송수신 + 에디터 CRDT 연결 + 2탭 라이브 수렴(단일 블록 인라인 타이핑).
**제외**: DB 영속화, sync-request/response, snapshot, presence, 재접속 missing-op 복원, 정식 인증, **블록 단위 op 실시간 전송**, **구조 편집(Enter/Backspace 블록 분할·병합) — 이번 슬라이스 UI 비활성화**.

## 확정 결정 (오케스트레이터 Q&A)
1. **구조 편집 UI 비활성화** — walking skeleton은 단일 블록 인라인 타이핑 수렴만. Enter(블록 분할)·Backspace(블록 시작 병합)를 이번 슬라이스에서 비활성화(`preventDefault` no-op). 이유: split이 로컬 blockId를 생성하면 그 블록의 인라인 op가 상대 탭 `pendingInline`에 영구 적체되어 수렴이 깨짐(design-critic MUST-3). 구조 편집 2탭 수렴은 후속(블록 op 전송) 슬라이스.
2. **opType: WireEnvelope 그대로 재사용(소문자)** — P4b에서 머지·테스트된 `WireEnvelope.opType = op.type`(소문자 `'insert'/'delete'`)를 그대로 사용. relay는 op를 불투명 전달하므로 무관. **AC-5/BR-1을 실제 codec 기준으로 정정**(아래 "PRD AC 해석 보정"). 06-api §2-5의 대문자 표기는 구현 전 설계 문서로, 실제 codec과의 차이를 design.md에 기록.
3. **relay URL**: `NEXT_PUBLIC_WS_URL` 기본값을 `ws://localhost:3001`로 변경, 경로 없는 루트 연결(pageId는 join 메시지로 전달). 기존 `/ws/pages/` 경로 가정 폐기.
4. **autosave 스텁**: 유지(no-op save). `data-testid="autosave-status"` 보존. 영속화 슬라이스에서 CRDT op 영속화로 자연 연결.
5. **document.ts**: 남기되 에디터에서 import 제거(dead-code화, 후속 정리). `EditorBlock`/`createEmptyDocument` 참조 제거.
6. **relay 패키지**: `@ieum/ws-relay`, dev에서 `tsx`로 실행(`tsx src/main.ts`), test=`vitest run`.

## 컨벤션 (구현자 준수)
- ESM(`"type":"module"`), 상대 import `.js` 확장자(@ieum/crdt 스타일), `import type` 명시(`verbatimModuleSyntax`).
- 순수/transport 분리: `room.ts`(순수)/`server.ts`(ws 어댑터), `crdtDocument.ts`(순수 diff)/`useCrdtDocument.ts`(React 훅).
- 테스트 vitest only. `it()` 설명에 AC 번호 명시(`'AC-2: ...'`). crdt 패턴=`tests/*.test.ts` import `../src/index.js`; web 패턴=`@/` alias + jsdom.
- @ieum/crdt 외부 런타임 의존성 0 유지: relay 서버는 `WireEnvelope`/`AnyOp` **타입만** import(런타임 CRDT 미적용 — op 불투명 전달).
- 모델=진실 원천 원칙 승계: contenteditable=입력 수단, `DocState`→`docToBlocks` 단방향 파생.

## 재사용 기반 API (`@ieum/crdt`, 변경 없음)
- `createDocument(siteId): DocState` — 빈 문서. `applyDocOp(doc, op): void`(가변, 인과버퍼 `pendingInline`/rga 버퍼 포함).
- `docToBlocks(doc): EditorBlockView[]` — `EditorBlockView { id: RgaId; type: BlockType; text: string }`(이미 존재).
- `localInlineInsert(doc, blockId, index, value): InlineInsertOp` — 가시 index에 1문자 삽입 + 로컬 applyDocOp + op 반환.
- `localInlineDelete(doc, blockId, index): InlineDeleteOp` — 가시 index 문자 삭제 + 로컬 applyDocOp + op 반환.
- `makeBlockInsertOp`/관련 — 초기 빈 블록 1개 생성용(아래 useCrdtDocument 초기화).
- `toWire(op, seq, siteId): WireEnvelope` / `fromWire(env): AnyOp`.

## 데이터 흐름
```
[탭A EditorContainer]                    [relay :3001 RoomRegistry]              [탭B EditorContainer]
 타이핑(IME 조합 완료 후)
  │ Editor onInput(blockId,newText)  ← isComposing 중엔 무시, compositionend에서 1회
  ▼
 useCrdtDocument.onBlockInput
  │ diffBlockText(doc,blockId,old,new) → InlineDelete*/InlineInsert* (localInline* 재사용=로컬 즉시 적용)
  │ docToBlocks → version bump → 리렌더
  │ 각 op: toWire(op,++seq,siteId)
  ▼
 relayClient.sendOp({type:"op",pageId,op:env}) ─► server.ts → room.handleOp
                                                     ├─ op-ack(발신자A) (자기op 미수신 → AC-10)
                                                     └─ broadcast(발신자 제외) ─► {type:"op",...} ─► 탭B
                                                                                      │ relayClient.onMessage
                                                                                      ▼
                                                                                   fromWire→applyDocOp(docB)
                                                                                   →docToBlocks→version bump→리렌더
join: 연결 onOpen → relayClient.join(pageId) → {type:"join",pageId} → room.join → {type:"join-ack",pageId,connectedClients:N}
```

## 변경 범위

### 신규 패키지 `apps/ws-relay`
| 파일 | 역할 |
|------|------|
| `package.json` | `@ieum/ws-relay`, deps `ws`(^8), `@ieum/crdt`(workspace), devDeps `@types/ws`/`typescript`/`vitest`/`tsx`. scripts: `dev:"tsx src/main.ts"`, `build:"tsc"`, `test:"vitest run"`, `typecheck:"tsc --noEmit"` |
| `tsconfig.json` | base extends, ESM, `noEmit` 등 crdt 패키지 패턴 |
| `src/protocol.ts` | 메시지 타입(C↔S) + `parseClientMessage(raw): ClientToServer \| null`. op 필드는 `WireEnvelope`. 순수 |
| `src/room.ts` | **순수 RoomRegistry** — 라우팅 결정만, send 안 함 |
| `src/server.ts` | `ws` 어댑터. `createRelayServer({port,registry?})`. RoomRegistry 주입(DI) |
| `src/main.ts` | 엔트리포인트. `createRelayServer({port: env.PORT ?? 3001})` |
| `tests/room.test.ts` | RoomRegistry 순수 단위 테스트 |
| `tests/server.test.ts` | AC-1 실 ws smoke 1개(`port:0` + teardown) |

### 신규 파일 `apps/web`
| 파일 | 역할 |
|------|------|
| `src/lib/realtime/protocol.ts` | 클라 메시지 타입(서버와 동일 계약, walking skeleton에선 복제) |
| `src/lib/realtime/transport.ts` | `Transport` 인터페이스 + `createWebSocketTransport(url)` + `createRetryingTransport(url,{delayMs?,transportFactory?})` |
| `src/lib/realtime/relayClient.ts` | 순수 클라 세션. `createRelayClient(transport,pageId,handlers)` |
| `src/lib/editor/crdtDocument.ts` | `diffBlockText(doc,blockId,old,new): AnyOp[]` 순수 diff(clamp 포함) |
| `src/lib/editor/useCrdtDocument.ts` | React 훅. DocState 진실원천 + relay 배선. `useCrdtDocument(pageId,{transportFactory?})` |
| `tests/realtime/relayClient.test.ts` | FakeTransport 주입 송수신(AC-5/6) |
| `tests/realtime/convergence.test.ts` | **2탭 수렴 통합(in-memory relay)** (AC-8/3/10) |
| `tests/editor/crdtDocument.test.ts` | diff 알고리즘(단일/중간삽입/삭제/치환/clamp/멀티문자) (AC-5) |

### 수정 파일
| 파일 | 변경 |
|------|------|
| `components/editor/Editor.tsx` | `blocks: EditorBlockView[]`(id:RgaId), key/`data-block-id`=`idKey(id)`. onInput→`onBlockInput(blockId,newText)`. **IME 조합 처리**: `onCompositionStart`/`onCompositionEnd`로 `isComposing` ref 관리, 조합 중 input 무시, `compositionend`에서 최종 textContent로 1회 emit. **Enter/Backspace 구조 편집 비활성화**(preventDefault no-op). 캐럿 복원 RgaId 기반 유지 |
| `components/editor/EditorContainer.tsx` | `useState<EditorBlock[]>` 제거 → `useCrdtDocument(pageId)`. `<Editor blocks onBlockInput/>`. title 로컬 useState 유지. autosave 스텁 유지 |
| `src/lib/ws.ts` | **삭제**(connectPage 미사용 확인). transport.ts로 대체 |
| `.env.local.example` | `NEXT_PUBLIC_WS_URL=ws://localhost:3001`로 변경 + 주석 갱신(relay 서버) |

## 컴포넌트 인터페이스

### relay `protocol.ts`
```ts
import type { WireEnvelope } from '@ieum/crdt';
export interface JoinMsg    { type: 'join'; pageId: string; }
export interface JoinAckMsg { type: 'join-ack'; pageId: string; connectedClients: number; }
export interface OpMsg      { type: 'op'; pageId: string; op: WireEnvelope; }
export interface OpAckMsg   { type: 'op-ack'; siteId: string; seq: number; }
export type ClientToServer = JoinMsg | OpMsg;
export type ServerToClient = JoinAckMsg | OpMsg | OpAckMsg;
export function parseClientMessage(raw: string): ClientToServer | null; // JSON.parse + 타입가드, 실패 시 null
```

### relay `room.ts` (순수 — 최우선 테스트 자산)
```ts
export interface ClientHandle { id: string; }              // 불투명 — server.ts가 실 소켓과 매핑
export interface Dispatch { target: ClientHandle; message: ServerToClient; }
export class RoomRegistry {
  join(client: ClientHandle, pageId: string): Dispatch[];  // join-ack(자신, connectedClients=room size)
  handleOp(client: ClientHandle, msg: OpMsg): Dispatch[];  // op-ack(발신자) + op broadcast(같은 room 타자, 발신자 제외)
  leave(client: ClientHandle): void;                       // 연결 종료 정리
  roomSize(pageId: string): number;
}
```
- AC-9/BR-6: `handleOp`는 broadcast 대상 0이어도 op-ack Dispatch 1개를 **항상** 반환, 예외 없음.
- AC-3/BR-2: broadcast 대상에서 발신 client 제외.
- join 안 한 client의 op: op-ack만 반환(walking skeleton).

### relay `server.ts` (ws 어댑터)
```ts
export interface RelayServer { close(): Promise<void>; port: number; }
export function createRelayServer(opts: { port: number; registry?: RoomRegistry }): Promise<RelayServer>;
```
- `ws.WebSocketServer` 메시지 → `parseClientMessage` → `room.join`/`handleOp` → 반환 `Dispatch[]`를 실 소켓 send. close 시 `room.leave`.
- `ClientHandle.id ↔ WebSocket` `Map`. BR-5 인증 목 처리(localhost 연결 수락). 잘못된 JSON 무시.

### client `transport.ts`
```ts
export interface Transport {
  send(data: string): void;
  onMessage(cb: (data: string) => void): () => void;
  onOpen(cb: () => void): () => void;
  onClose(cb: () => void): () => void;
  close(): void;
}
export function createWebSocketTransport(url: string): Transport;
export function createRetryingTransport(
  url: string,
  opts?: { delayMs?: number; transportFactory?: (url: string) => Transport },  // ← factory 주입(테스트 격리, test-architect 권고1)
): Transport;
```

### client `relayClient.ts` (순수, Transport 주입)
```ts
import type { WireEnvelope } from '@ieum/crdt';
export interface RelayClientHandlers {
  onRemoteOp(env: WireEnvelope): void;
  onJoinAck?(connectedClients: number): void;
  onOpAck?(siteId: string, seq: number): void;
}
export interface RelayClient { join(pageId: string): void; sendOp(env: WireEnvelope): void; dispose(): void; }
export function createRelayClient(transport: Transport, pageId: string, handlers: RelayClientHandlers): RelayClient;
```
- onMessage 구독→JSON.parse→type 분기(op→onRemoteOp, join-ack→onJoinAck, op-ack→onOpAck). onOpen→자동 join.
- AC-5: `sendOp(env)` → `{type:"op",pageId,op:env}` 전송. AC-10: 자기 op는 서버 미broadcast(BR-2)라 onRemoteOp 안 옴.

### client `crdtDocument.ts` — `diffBlockText` (MUST-1 반영)
```ts
export function diffBlockText(doc: DocState, blockId: RgaId, oldText: string, newText: string): AnyOp[];
```
알고리즘(단일 연속 편집 가정 + clamp):
1. 공통 prefix 길이 `p` = old/new 앞에서 같은 동안.
2. 공통 suffix 길이 `s` = 끝에서 같은 동안, **단 `p + s ≤ min(old.length, new.length)`로 clamp**(경계 중복 방지 — design-critic MUST-1: "aa"→"aaa" 같은 케이스에서 음수 구간 방지).
3. 삭제 구간 `old[p .. old.length-s)`: 가시 index `p`에서 `localInlineDelete(doc,blockId,p)`를 `(old.length-s-p)`회(삭제 시 뒤가 당겨지므로 index 고정 `p`). **삭제를 삽입보다 먼저.**
4. 삽입 구간 `new[p .. new.length-s)`: index `p`부터 `localInlineInsert(doc,blockId,p+k,ch)`로 한 문자씩.
5. 생성된 op를 순서대로 배열 반환(전송용). `localInline*`가 로컬 applyDocOp까지 수행.
- 한글 1글자 입력("안")→INSERT 1개. **IME 조합 중간 input은 Editor 레이어에서 차단**(아래)하므로 diff는 조합 완료 텍스트만 받음.

### client `useCrdtDocument.ts` (훅)
```ts
export interface UseCrdtDocumentResult {
  blocks: EditorBlockView[];
  connectedClients: number;
  onBlockInput: (blockId: RgaId, newText: string) => void;
}
export function useCrdtDocument(pageId: string, opts?: { transportFactory?: (url: string) => Transport }): UseCrdtDocumentResult;
```
- 초기: `createDocument(siteId)` (siteId=`crypto.randomUUID()` per 탭) + 초기 빈 paragraph 블록 1개를 로컬 block-insert로 생성(reload 유실은 walking skeleton 허용).
- `useRef<DocState>` + `useState<number>` version 카운터로 리렌더(DocState 가변 → setState 대신 bump).
- relay: `useEffect`에서 `(opts?.transportFactory ?? createWebSocketTransport)(WS_URL)` + `createRelayClient(transport,pageId,{onRemoteOp,onJoinAck})`. onRemoteOp(env)→`applyDocOp(doc,fromWire(env))`→bump. unmount 시 `client.dispose()`.
- onBlockInput(blockId,newText): oldText=현재 docToBlocks의 해당 블록 text. `diffBlockText(doc,blockId,old,new)`→각 op `toWire(op,++seq,siteId)`→`client.sendOp(env)`→bump.

### `Editor.tsx` 수정 (회귀 표면 — AC-7 선보호)
- `blocks: EditorBlockView[]`, `data-block-id`/key=`idKey(block.id)`.
- `onInput`→`onBlockInput(blockId, newText)`(Editor는 diff 모름, 새 텍스트만 전달).
- **IME 조합 처리(MUST-1)**: `isComposingRef` + `onCompositionStart`(true)/`onCompositionEnd`(false 후 최종 textContent로 onBlockInput 1회). `onInput`은 `isComposingRef.current`면 무시.
- **구조 편집 비활성화**: `onKeyDown`에서 Enter(비Shift)·블록시작 Backspace는 `preventDefault()` no-op(블록 분할/병합 안 함). 마크다운 단축키도 이번 슬라이스 비활성(타입 변경=블록 op 범위 밖).
- 캐럿 복원 로직 RgaId 기반 유지(현 try-catch fallback 패턴 보존).

## 2탭 수렴 검증 (Playwright 없음) — AC-8
`tests/realtime/convergence.test.ts`(vitest 통합):
- 헬퍼 `createInMemoryRelay()`: **실제 RoomRegistry(순수)** + 두 `FakeTransport`(메모리 큐)를 양방향 배선. ws·포트·async 없음 → 완전 결정적.
- 두 DocState(siteId A/B) + 두 RelayClient. A `diffBlockText` op 생성·전송 → RoomRegistry.handleOp broadcast(발신자 제외) → B FakeTransport → B.onRemoteOp → applyDocOp → `docToBlocks(docA)` deepEqual `docToBlocks(docB)`.
- AC-3(발신자 제외 실제 통과)·AC-10(A docToBlocks가 op-ack 후 불변) 함께 커버.

## PRD AC 해석 보정 (구현/리뷰 기준)
> 사용자 결정·환경 제약 반영. spec-reviewer는 이 보정을 기준으로 AC 충족을 판정한다.
- **AC-5 (opType)**: 전송 메시지의 `op`는 `toWire` 결과(`WireEnvelope`, `opType`=소문자 `op.type`)와 **일치**해야 한다. 06-api §2-5의 대문자 표기는 미적용(결정2). 검증: `op.payload === toWire(op,seq,siteId).payload` 및 `op.opType === op.payload.type`.
- **AC-8 (2탭 수렴)**: "Playwright e2e" 대신 **in-memory relay vitest 통합 테스트**로 검증(Playwright 미설치). 검증 대상=CRDT 수렴 + RoomRegistry 라우팅. 실 브라우저 DOM/실 WebSocket 경로는 walking skeleton 범위상 미커버(잔여 갭 명시) — AC-1의 실 ws smoke로 연결 경로만 별도 보증.
- **AC-7/영향범위 "기존 편집 UX 동일"**: 단일 블록 인라인 타이핑에 한정. 구조 편집(Enter/Backspace)은 이번 슬라이스 비활성(결정1).

## 구현 순서 (RGR 분해, AC 매핑 — 골격 먼저)
> design-critic ROOT-CAUSE 반영: 수렴 골격(서버/클라/diff/통합)을 에디터 재배선보다 먼저 green으로.

1. `apps/ws-relay` 스캐폴드(package/tsconfig/main 골격) — 인프라
2. `protocol.ts` + parseClientMessage — BR-1,BR-3
3. `room.ts` RoomRegistry + `tests/room.test.ts` — FR-2,3 BR-2,6 / **AC-2,3,4,9**
4. client `transport.ts`(Transport + WebSocketTransport, factory 주입) — 기반
5. client `protocol.ts` — BR-1
6. `relayClient.ts` + `tests/realtime/relayClient.test.ts`(FakeTransport) — FR-4,5 / **AC-5,6**
7. `crdtDocument.ts` diffBlockText(clamp) + `tests/editor/crdtDocument.test.ts`(단일/중간/삭제/치환/clamp/멀티문자) — FR-4 / **AC-5**
8. `convergence.test.ts` in-memory relay 2탭 수렴 — **AC-8,3,10** ← 골격 확정 게이트
9. `server.ts` ws 어댑터 + main.ts + `tests/server.test.ts`(port:0 smoke+teardown) — FR-1 / **AC-1**
10. `useCrdtDocument.ts` 훅 — FR-5,6 / **AC-6,7**
11. `Editor.tsx` EditorBlockView 어댑트 + IME 조합 + 구조편집 비활성 — FR-6 / **AC-7** (회귀 선보호)
12. `EditorContainer.tsx` useCrdtDocument 와이어링 — FR-6
13. `createRetryingTransport`(재연결, factory 주입) — FR-7(Should)
14. `.env.local.example` 갱신 + `ws.ts` 삭제 — 환경설정
병렬 가능: 서버 체인{1,2,3}과 클라 체인{4,5,6,7}은 8(합류) 전까지 독립.

---

## Testability 평가 (test-architect)

**✅ TESTABILITY PASS — Score 8/10 (≥7). red-green-refactor 진입 가능.**

### 컴포넌트별 전략 요약
- `protocol.ts`(순수 파서): 케이스 테이블 단위 테스트(`wire.test.ts` 패턴). 모의 불필요.
- `room.ts`(RoomRegistry): **최우선 자산.** send 부수효과를 `Dispatch[]` 반환으로 치환 → 가짜 ClientHandle만으로 동기 결정적 단위 테스트. AC-2/3/4/9 직접.
- `server.ts`(ws 어댑터): `registry?` DI로 배선 단위 검증 + AC-1 실 ws smoke(`port:0`+teardown). flaky 위험 최소화 위해 실 ws 테스트는 1개로 한정.
- `transport.ts`: `Transport` 인터페이스가 격리 경계. FakeTransport 주입. retrying은 transportFactory 주입으로 단위 테스트.
- `relayClient.ts`(순수, DI): FakeTransport로 완전 격리. AC-5(send 캡처)/AC-6(onRemoteOp).
- `crdtDocument.ts`(순수 diff): 최적 — DocState 실객체 + AnyOp[] 단언. AC-5.
- `useCrdtDocument.ts`(훅): jsdom + `@testing-library/react` renderHook(v16 보유). transportFactory 주입으로 단위 테스트.
- `Editor/EditorContainer`: controlled 컴포넌트. 핵심 로직이 순수 레이어(crdtDocument/block.ts)로 추출되어 회귀 위험 격리. contenteditable/Selection jsdom 한계는 try-catch fallback로 이미 대응.
- `convergence.test.ts`: in-memory relay(실 RoomRegistry + FakeTransport) → **AC-8을 Playwright 없이 결정적 검증, flaky-free.**

### AC 커버리지
| AC | 검증 테스트 | 레벨 |
|----|------------|------|
| AC-1 | server.test.ts(port:0 실ws+open) | 통합 |
| AC-2 | room.test.ts(join Dispatch) | 단위 |
| AC-3 | room.test.ts + convergence | 단위+통합 |
| AC-4 | room.test.ts(op-ack Dispatch) | 단위 |
| AC-5 | relayClient.test.ts + crdtDocument.test.ts | 단위 |
| AC-6 | relayClient.test.ts + crdtDocument 통합 (+훅) | 단위+통합 |
| AC-7 | crdtDocument/Editor 렌더 단위 | 단위 |
| AC-8 | **convergence.test.ts(in-memory relay)** | 통합 |
| AC-9 | room.test.ts(1-client) | 단위 |
| AC-10 | convergence.test.ts | 통합 |

### 비차단 권고(반영됨)
1. `createRetryingTransport`/`useCrdtDocument`에 `transportFactory` 주입 지점 명시 → 인터페이스에 반영함.
2. AC-1 실 ws smoke 1개 + `port:0`/afterEach `server.close()` teardown → 구현 순서 9에 반영.
3. AC-8 in-memory 검증의 잔여 갭(실 브라우저/실 ws) → "PRD AC 해석 보정"에 명문화.
