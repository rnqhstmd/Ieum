# 설계 초안: P6 라이브 커서 (US-PRES-02)

## 설계 규모
**대형** — crdt 신규 순수함수 2개(anchor.ts) + ws-relay 3파일 프로토콜/라우팅 확장 + web 5파일(프로토콜/relayClient/신규 useCursor 훅/useCrdtDocument 배선/Editor 전송·렌더). 여러 패키지 신규 기능 슬라이스.

## 확정 결정
cursor-update 신규 메시지 / anchorId=caret 직전 문자 id(맨앞=null) / ws-relay 서버 변경 포함. 커서 제거는 presence-leave 재사용.

## crdt anchor 설계 (핵심)
**위치: `@ieum/crdt`에 신규 `anchor.ts` + index.ts export.** 근거: resolveAnchorToIndex는 tombstone 포함 전체 순회 필요(`RgaState.sentinel.next` 링크드리스트, deleted 포함) — getVisibleNodes(tombstone 제외)로 불가. RgaState 내부 접근 필요 → crdt 캡슐화 유지 위해 crdt에 둠. 순수 CRDT 위상 연산, crdt 테스트 하네스 재사용.

### resolveAnchorToIndex(doc, blockId, anchorId|null): number
anchorId=caret 직전 문자 id → 반환=caret 가시 index.
```
if anchorId == null: return 0
inline = doc.inlineRgas.get(idKey(blockId)); if !inline: return 0
visibleIndex = 0; cursor = inline.sentinel.next
while cursor != null:
  if idEquals(cursor.id, anchorId):
    if !cursor.deleted: return visibleIndex + 1         // 살아있는 앵커 문자 뒤
    scan = cursor.next                                   // tombstone → 다음 살아있는 문자
    while scan != null: if !scan.deleted: return visibleIndex; scan = scan.next
    return visibleIndex                                  // 뒤에 살아있는 문자 없음 → 블록 끝
  if !cursor.deleted: visibleIndex += 1
  cursor = cursor.next
return visibleIndex                                      // 앵커 미발견 → 블록 끝
```
핵심: tombstone 분기에서 visibleIndex=앵커 앞쪽 살아있는 문자 수=다음 살아있는 문자의 가시 index와 일치(앵커 자신 tombstone이라 안 셌음). AC-3/AC-4 동시 만족.

### indexToAnchorId(doc, blockId, visibleIndex): RgaId|null
caret 가시 index → 직전 문자 id(송신측 캡처). `visibleIndex<=0 → null`, 그 외 `getVisibleNodes(inline)[visibleIndex-1]?.id ?? null`. localInsert originId 관례(index===0?null:getVisibleNodeAt(index-1))와 일치. AC-1 만족.

테스트: 순수 함수 → packages/crdt/tests/anchor.test.ts에서 createCollaborativeDocument/createRga+applyOp로 상태 구성 후 직접 호출(jsdom/React 불필요). AC-2/3/4 결정적 검증.

## 메시지 프로토콜
서버가 clientId 권위 부여(presence 패턴).
```
// C→S (clientId 없음, 서버 태깅)
interface CursorMsg { type:'cursor', pageId:string, blockId:RgaId, anchorId:RgaId|null }
// S→C (서버가 발신자 clientId 부착 broadcast)
interface CursorUpdateMsg { type:'cursor-update', clientId:string, blockId:RgaId, anchorId:RgaId|null }
```
커서 제거 메시지 없음 — presence-leave 재사용(BR-7).
검증(양쪽 protocol.ts 대칭): `isRgaId(v)`(object·!null·!hasDangerousKey·counter number·siteId string) 헬퍼. parseClientMessage cursor 분기(pageId string + blockId valid RgaId + anchorId null|RgaId + proto 가드). parseServerMessage cursor-update 분기(clientId string + blockId RgaId + anchorId null|RgaId). 구버전 default:null 무시(하위호환).

## 컴포넌트별 설계
1. **ws-relay protocol.ts**: CursorMsg/CursorUpdateMsg + RgaId import + isRgaId + parseClientMessage cursor 분기.
2. **ws-relay room.ts**: `handleCursor(client,msg):Dispatch[]` — **저장/roster/ack 없이 broadcast만**(BR-8). joinedPage===msg.pageId 가드(교차주입 차단) + room peer 루프 발신자 제외 → `{type:'cursor-update',clientId:client.id,blockId,anchorId}`. handleOp broadcast와 동형. join/leave/handleOp 불변.
3. **ws-relay server.ts**: message 3분기(join/cursor=handleCursor/기본=handleOp), sendAll 재사용.
4. **ws-relay index.ts**: CursorMsg/CursorUpdateMsg export.
5. **web protocol.ts**: cursor 타입(대칭) + isRgaId + parseServerMessage cursor-update 분기.
6. **web relayClient.ts**: handlers에 onCursorUpdate?(info:CursorInfo) + switch cursor-update 분기 + `sendCursor(blockId,anchorId)`(transport.send {type:'cursor',pageId,blockId,anchorId}).
7. **web useCursor.ts(신규)**: CursorMap=Map<clientId,CursorInfo>. 순수 reducer applyCursorUpdate/applyCursorLeave(immutable). `useCursor():{cursors:CursorInfo[](clientId 정렬), onCursorUpdate, onCursorLeave}`. usePresence와 동형. **별도 훅 근거**: presence=정체성(이름·색), cursor=위치(blockId·anchorId) 관심사 분리.
8. **web useCrdtDocument.ts**: useCursor() 호출. handlers onCursorUpdate 배선. **presence-leave 연동**: onPresenceLeave 래핑 useCallback `(id)=>{presence.onPresenceLeave(id);cursor.onCursorLeave(id)}`(BR-7/AC-9). `sendCursor(blockId,anchorId)` 노출(client null skip). **localClientId 노출**(AC-7 자기 미렌더 — 식별 방법 확인필요 Q1). 반환에 cursors/presences/sendCursor/localClientId 추가.
9. **web Editor.tsx**: (a)송신 — selectionchange/keyup/click→getCaretOffset→`onCursorMove(blockId, caretOffset:number)`(DOM offset만 상위로, DocState 미노출)→50ms debounce. useCrdtDocument가 indexToAnchorId 변환 후 sendCursor. FR-8 포커스 가드. caret offset=가시 index(단일 텍스트노드 가정, 확인필요 Q2). (b)렌더 — 각 BlockView에 `cursors.filter(idEquals(c.blockId,block.id) && c.clientId!==localClientId)` 오버레이. resolveAnchorToIndex로 가시 index. position:absolute `<span data-cursor-client-id>`(색막대+이름, presences에서 color/displayName lookup BR-6). jsdom은 rect 0 → 테스트는 요소존재·data-color·이름만 단정(픽셀 위치 비검증, walking skeleton). debounce는 vi.useFakeTimers AC-5.
10. **web EditorContainer.tsx**: cursors/sendCursor(onCursorMove)/localClientId/resolveCursorIndex props 전달.
11. **web inMemoryRelay.ts**: send 3분기(join/cursor=reg.handleCursor/handleOp). AC-10 통합 지원.

## 데이터 구조
```
interface CursorInfo { clientId:string, blockId:RgaId, anchorId:RgaId|null }
```
web protocol.ts 정의(PresenceInfo 패턴). 색·이름 미포함 → 렌더 시 presences에서 clientId lookup(단일 출처, AC-9). PresenceInfo에 cursor 필드 추가 안 함.

## 영향/호환
- op 수렴 경로 불변(cursor는 DocState 밖 useCursor, resolveAnchorToIndex는 DocState 읽기만). presence 경로 불변. handleOp/join/leave 불변. join-ack Dispatch[0] 불변식 유지.
- 하위호환: cursor 모르는 구버전 클라/서버 모두 parse default:null/return null로 graceful 무시.
- 새 의존성 없음(setTimeout debounce, useAutosave 선례).

## 구현 순서 (RGR)
1. [Must] crdt anchor.ts: resolveAnchorToIndex+indexToAnchorId + anchor.test (의존 없음)
2. [Must] crdt index.ts export (의존 1)
3. [Must] ws-relay protocol.ts: Cursor 타입+isRgaId+parseClientMessage 분기+테스트 (의존 없음)
4. [Must] ws-relay room.ts: handleCursor broadcast+테스트 (의존 3)
5. [Must] ws-relay server.ts+index.ts: 분기 배선+export (의존 3,4)
6. [Must] web protocol.ts: cursor+isRgaId+parseServerMessage 분기+test (의존 없음)
7. [Must] web relayClient.ts: sendCursor+onCursorUpdate+test (의존 6)
8. [Must] web useCursor.ts: reducer+훅+test (의존 6)
9. [Must] web inMemoryRelay.ts: cursor 라우팅 (의존 3,4)
10. [Must] web useCrdtDocument.ts: useCursor 연동+sendCursor+presence-leave 커서제거+localClientId (의존 2,7,8)
11. [Must] web Editor.tsx(전송): selection→offset→debounce→onCursorMove+FR-8 (의존 10)
12. [Must] web Editor.tsx(렌더): 오버레이(자기 제외, resolveAnchorToIndex, 색·이름)+Editor.cursor.test (의존 2,10,11)
13. [Must] web EditorContainer.tsx props (의존 10,12)
14. [Must] web cursor.convergence.test.ts: 2탭 통합 AC-10 (의존 9,10)
15. [Should] FR-7 이름 3초 숨김 (선택, 의존 12)
병렬: {1,3,6} 의존 없음 동시. 11→12 순차(같은 Editor.tsx).

## 미해결(architect 확인질문)
Q1 localClientId 식별: (a)join-ack에 clientId 필드 추가(권장) vs (b)첫 self presence-update.
Q2 caret offset→가시 index: (a)단일 텍스트노드 range.startOffset(권장) vs (b)멀티노드 누적.
Q3 FR-7 이름 3초 숨김: (a)제외(권장) vs (b)포함.
