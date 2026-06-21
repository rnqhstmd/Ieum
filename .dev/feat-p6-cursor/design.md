# 설계서: P6 라이브 커서 (US-PRES-02)

## 개요 / 설계 규모
**대형** — crdt 신규 anchor.ts(순수함수 2) + ws-relay 4파일(cursor 메시지·handleCursor·배선·join-ack clientId) + web 6파일(protocol/relayClient/useCursor/useCrdtDocument/Editor/EditorContainer). feat/p6-presence(PR #11, 미머지) 위 적층, PR base=feat/p6-presence.

확정: cursor-update 신규 메시지 / anchorId=caret 직전 문자 id / ws-relay 서버 변경 포함 / **FR-7(이름 자동숨김) 제외**.

## crdt anchor 설계 (핵심) — `@ieum/crdt/anchor.ts` 신규 + index.ts export
근거: resolveAnchorToIndex는 tombstone 포함 전체 순회(`RgaState.sentinel.next`, deleted 포함) 필요 — getVisibleNodes(tombstone 제외)로 불가. RgaState 내부 접근 → crdt 캡슐화 유지. 순수 함수, crdt 테스트 하네스 재사용.

### resolveAnchorToIndex(doc, blockId, anchorId|null): number
anchorId=caret 직전 문자 id → 반환=caret 가시 index.
```
if anchorId == null: return 0
inline = doc.inlineRgas.get(idKey(blockId)); if !inline: return 0
visibleIndex = 0; cursor = inline.sentinel.next
while cursor != null:
  if idEquals(cursor.id, anchorId):
    if !cursor.deleted: return visibleIndex + 1          // 살아있는 앵커 문자 뒤
    scan = cursor.next                                    // tombstone → 다음 살아있는 문자
    while scan != null: if !scan.deleted: return visibleIndex; scan = scan.next
    return visibleIndex                                   // 뒤에 살아있는 문자 없음 → 블록 끝
  if !cursor.deleted: visibleIndex += 1
  cursor = cursor.next
return visibleIndex                                       // 앵커 미발견 → 블록 끝
```
tombstone 분기: visibleIndex=앵커 앞쪽 살아있는 문자 수=다음 살아있는 문자의 가시 index(앵커 자신 tombstone이라 안 셌음). AC-3/AC-4 동시 만족.

### indexToAnchorId(doc, blockId, visibleIndex): RgaId|null
`visibleIndex<=0 → null`, 그 외 `getVisibleNodes(inline)[visibleIndex-1]?.id ?? null`. localInsert/localInlineInsert의 originId 관례(index===0?null:visible[index-1])와 일치. AC-1 만족.

> **[M1] AC-2/AC-10 테스트 정밀화 (design-critic)**: "+N" 단정은 resolveAnchorToIndex 로직이 아니라 RGA 순서 불변의 부산물이다. 따라서 테스트는 **삽입이 앵커 문자 앞(= 앵커 노드의 originId 또는 그 앞)에서 일어나도록 명시**해야 +N이 의미를 갖는다. RED 테스트 작성 규칙: anchor=특정 문자 X의 id로 고정 → X **앞쪽**(X의 가시 index보다 작은 위치)에 N개 삽입 op 적용 → resolve가 (삽입 전 +N) 반환 + idEquals(X) 동일 노드 단정. 삽입을 X 뒤에 하면 index 불변(이 케이스도 별도 테스트로 명시 가능).

## 메시지 프로토콜
서버가 clientId 권위 부여(presence 패턴).
```
// C→S (clientId 없음, 서버 태깅)
interface CursorMsg { type:'cursor', pageId:string, blockId:RgaId, anchorId:RgaId|null }
// S→C (서버가 발신자 clientId 부착 broadcast)
interface CursorUpdateMsg { type:'cursor-update', clientId:string, blockId:RgaId, anchorId:RgaId|null }
```
커서 제거 메시지 없음 — presence-leave 재사용(BR-7).
검증(양쪽 protocol.ts 대칭): `isRgaId(v): v is RgaId`(object·!null·!hasDangerousKey·counter number·siteId string). parseClientMessage `cursor` 분기(pageId string + isRgaId(blockId) + (anchorId null||isRgaId) + proto 가드 → 실패 null). parseServerMessage `cursor-update` 분기(clientId string + isRgaId(blockId) + anchorId null||isRgaId). 구버전 default:null 무시(하위호환).

### join-ack clientId 확장 (Q1/TA3 — 자기 커서 미렌더 AC-7)
- **JoinAckMsg에 `clientId: string` 추가** (서버 부여 client.id = presence-update의 clientId와 동일 출처 server.ts:44). room.join의 join-ack Dispatch에 `clientId: client.id` 포함(Dispatch[0] 불변식·connectedClients 유지 → 페이로드 확장이라 기존 join-ack 단정 안전).
- parseServerMessage join-ack에 `clientId` string 검증 추가. relayClient `onJoinAck` 시그니처 `(connectedClients: number, clientId: string)`로 변경. useCrdtDocument가 localClientId 저장.
- **기존 테스트 업데이트(이 슬라이스 내)**: web protocol.test의 join-ack 케이스·relayClient.test의 onJoinAck 케이스에 clientId 필드/인자 추가. ws-relay room.presence.test/server.test는 connectedClients만 단정이라 무영향(필요 시 clientId 확인 추가).

## 컴포넌트별 설계
1. **ws-relay protocol.ts**: CursorMsg/CursorUpdateMsg + RgaId import + isRgaId + parseClientMessage cursor 분기. JoinAckMsg.clientId 추가.
2. **ws-relay room.ts**: `handleCursor(client,msg):Dispatch[]` — **저장/roster/ack 없이 broadcast만**(BR-8). joinedPage===msg.pageId 가드 + peer 루프 발신자 제외 → cursor-update. join Dispatch join-ack에 clientId:client.id 추가. handleOp/leave 불변.
3. **ws-relay server.ts**: message 3분기(join/cursor=handleCursor/handleOp), sendAll 재사용.
4. **ws-relay index.ts**: CursorMsg/CursorUpdateMsg export.
5. **web protocol.ts**: cursor 타입(대칭)+isRgaId+parseServerMessage cursor-update 분기. JoinAckMsg.clientId + parse 검증.
6. **web relayClient.ts**: onCursorUpdate?(info:CursorInfo) 핸들러 + switch cursor-update + `sendCursor(blockId,anchorId)`(send {type:'cursor',pageId,blockId,anchorId}). onJoinAck 시그니처 (n, clientId).
7. **web useCursor.ts(신규)**: CursorMap=Map<clientId,CursorInfo>. 순수 reducer applyCursorUpdate/applyCursorLeave(immutable). `useCursor():{cursors:CursorInfo[](clientId 정렬), onCursorUpdate, onCursorLeave}`. usePresence 동형. **별도 훅**(정체성 vs 위치 분리).
8. **web useCrdtDocument.ts**: useCursor() 호출. onCursorUpdate 배선. **presence-leave 연동**: onPresenceLeave 래핑 useCallback `(id)=>{presence.onPresenceLeave(id);cursor.onCursorLeave(id)}`(BR-7/AC-9). **localClientId**: onJoinAck(n,clientId)에서 setState 저장. `sendCursor` 노출(client null skip). `resolveCursorIndex(blockId,anchorId)=resolveAnchorToIndex(doc,blockId,anchorId)` 노출(Editor가 DocState 미접근). 반환에 cursors/presences/localClientId/sendCursor/resolveCursorIndex 추가.
9. **web Editor.tsx**:
   - **(a) 송신**: selectionchange/keyup/click → `getCaretOffset(el, block.text.length)` → **[M2] 보정**: 블록이 비었거나 startContainer가 텍스트노드가 아니면 offset=0; offset을 [0, text.length]로 clamp; **`composing` ref true(IME 조합 중)면 미전송**(기존 input 가드 Editor.tsx:93 재사용). → **[TA1] Editor 내부 50ms debounce**(전용 setTimeout/clearTimeout, useAutosave 선례) → `onCursorMove(blockId, offset:number)`. FR-8: `document.activeElement`가 해당 블록 아니면 미전송. **useCrdtDocument가 indexToAnchorId(doc,blockId,offset) 변환 후 sendCursor**(Editor는 DOM offset만 — DocState 미노출).
   - **(b) 렌더**: 각 BlockView에 `cursors.filter(c => idEquals(c.blockId, block.id) && c.clientId!==localClientId)`(자기 제외 AC-7). 각 커서: `idx=resolveCursorIndex(block.id, c.anchorId)`, 색·이름 = `presences.find(p=>p.clientId===c.clientId)` — **[CONSIDER] lookup 실패 시 해당 커서 렌더 skip**(presence-leave 1프레임 불일치 방어). position:absolute `<span data-cursor-client-id={c.clientId} data-color={color}>`(색 막대+이름 레이블). 블록은 position:relative 컨테이너. **픽셀 위치**: 단일 텍스트노드에서 Range로 측정 시도, 실패(jsdom rect 0)면 블록 시작 fallback — 픽셀은 비검증(walking skeleton, 어떤 AC도 미요구).
   - **[Q2] 단일 텍스트노드 가정**: 구조편집(Enter/Backspace) 비활성 + genesis paragraph 단일 → textContent 단일 텍스트노드. range.startOffset=가시 index. 빈 블록·IME는 (a) 보정으로 처리.
10. **web EditorContainer.tsx**: cursors/onCursorMove(sendCursor 래퍼)/localClientId/resolveCursorIndex/presences props 전달.
11. **web inMemoryRelay.ts**: send 3분기(join/cursor=reg.handleCursor/handleOp). AC-10 지원.

## 데이터 구조
```
interface CursorInfo { clientId:string, blockId:RgaId, anchorId:RgaId|null }
```
web protocol.ts 정의. 색·이름 미포함 → presences lookup(단일 출처, BR-6/AC-9). PresenceInfo에 cursor 필드 안 넣음.

## 영향/호환
- op 수렴 경로 불변(cursor는 DocState 밖 useCursor, resolveAnchorToIndex는 읽기만). presence 경로 불변. handleOp/join/leave 불변. join-ack Dispatch[0] 불변식 유지(clientId는 페이로드 확장).
- 하위호환: cursor 모르는 구버전 클라/서버 모두 parse default:null/return null로 graceful 무시.
- roster 없는 broadcast-only(BR-8): 신규 접속자는 기존자 다음 이동 시 커서 표시(PRD 확정 비목표, UX 인지).
- 새 의존성 없음.

## 구현 순서 (RGR)
1. [Must] crdt anchor.ts: resolveAnchorToIndex+indexToAnchorId + anchor.test (의존 없음) RED: AC-1/2(앞쪽삽입 명시)/3/4/6.
2. [Must] crdt index.ts export (의존 1).
3. [Must] ws-relay protocol.ts: Cursor 타입+isRgaId+parseClientMessage 분기+JoinAckMsg.clientId+테스트 (의존 없음).
4. [Must] ws-relay room.ts: handleCursor broadcast+join-ack clientId+테스트 (의존 3). 기존 join-ack 단정 무영향 확인.
5. [Must] ws-relay server.ts+index.ts: 분기 배선+export (의존 3,4).
6. [Must] web protocol.ts: cursor+isRgaId+parseServerMessage 분기+JoinAckMsg.clientId+test(기존 join-ack 케이스 clientId 추가) (의존 없음).
7. [Must] web relayClient.ts: sendCursor+onCursorUpdate+onJoinAck(n,clientId)+test(기존 onJoinAck 케이스 갱신) (의존 6).
8. [Must] web useCursor.ts: reducer+훅+test (의존 6).
9. [Must] web inMemoryRelay.ts: cursor 라우팅 (의존 3,4).
10. [Must] web useCrdtDocument.ts: useCursor 연동+sendCursor+resolveCursorIndex+presence-leave 커서제거+localClientId(onJoinAck) (의존 2,7,8).
11. [Must] web Editor.tsx(전송): selection→offset 보정(빈블록/clamp/composing)→Editor debounce→onCursorMove+FR-8 (의존 10) RED: AC-5(fake timer).
12. [Must] web Editor.tsx(렌더): 오버레이(자기 제외 AC-7, resolveCursorIndex, 색·이름 lookup+skip fallback AC-8)+Editor.cursor.test (의존 2,10,11).
13. [Must] web EditorContainer.tsx props (의존 10,12).
14. [Must] web cursor.convergence.test.ts: 2탭 통합 AC-10(삽입 위치 명시 M1) (의존 9,10).
병렬: {1,3,6} 의존 없음. 11→12 순차(같은 Editor.tsx).

---

## Testability 평가 (test-architect)

### 컴포넌트별 전략
- **crdt anchor.ts**: 순수 단위(packages/crdt/tests/anchor.test.ts, createRga/applyOp/localInsert/localDelete 재사용). AC-1/2/3/4/6 + AC-10 anchor 부분. jsdom/React 불필요. **10/10**.
- **useCursor reducer**: 순수 단위(usePresence.test 동형). AC-9(presence-leave 커서제거)·갱신. **10/10**.
- **relayClient**: fakeTransport 단위. cursor-update 라우팅 + sendCursor 직렬화. **10/10**.
- **ws-relay room.handleCursor**: fake ClientHandle 단위, Dispatch[] 발신자 제외·joinedPage 가드. **10/10**.
- **protocol(양쪽)**: isRgaId 가드 + 분기 valid/invalid/default 단위. **10/10**.
- **cursor.convergence(in-memory relay)**: 실 RoomRegistry+FakeTransport, handleCursor broadcast + resolveAnchorToIndex 결정 결합 AC-10. **10/10**.
- **Editor**: jsdom render. AC-5(vi.useFakeTimers, **debounce는 Editor 내부**), AC-7(자기 미렌더 — localClientId prop 주입), AC-8(색·이름 — cursors/presences prop). **픽셀 위치는 어떤 AC도 미요구 → jsdom rect 0 무영향**. Editor는 props 주입형(DocState 미주입). **8/10**.
- **useCrdtDocument**: renderHook+transportFactory DI. AC-9 훅 레벨, AC-10 통합. **9/10**.

### Testability Score: 9/10
핵심 AC(1/2/3/4/6/10 anchor)가 순수 함수 단위로 결정적. 나머지는 검증된 DI 패턴(usePresence reducer·fakeTransport·Dispatch[]·transportFactory) 재사용. jsdom rect 0은 AC 무영향. 감점 -1: Editor debounce 위치/props 인터페이스가 RGR 진입 전 확정 필요 — 본 설계에서 **(TA1) debounce=Editor 내부, (TA2) Editor props 주입형(resolveCursorIndex 콜백, DocState 미주입), (TA3) Q1=join-ack clientId** 확정으로 해소.

### 판정: ✅ TESTABILITY PASS (9/10 ≥ 7) — RGR 진입 가능.
