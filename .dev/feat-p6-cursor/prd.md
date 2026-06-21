# PRD: P6 라이브 커서 (US-PRES-02) — 협업자 커서 실시간 표시

> 확정 결정 (2026-06-21):
> 1. **신규 `cursor-update` 메시지** — presence 상태(이름·색)와 커서 위치(blockId·anchorId) 분리. 커서 제거는 기존 `presence-leave` 재사용(별도 cursor-leave 없음).
> 2. **anchorId = caret 직전 문자의 id** (localInsert originId 관례 일치, caret 맨 앞이면 null).
> 3. **ws-relay 서버 변경 포함** — relay가 cursor-update를 같은 room에 broadcast(발신자 제외). 실 2탭 브라우저 동작까지 완결.

## 배경
P6 아바타 목록(feat/p6-presence, PR #11)이 완료되어 협업자 접속 여부는 색 배지로 확인 가능하나, 협업자가 문서 어디를 보는지는 알 수 없다. 이번 슬라이스는 그 위에 **라이브 커서**를 적층한다.

핵심 차별점은 **anchorId 기반 커서 표현**이다. 다른 협업자가 내 앞에 글자를 삽입/삭제해도 커서가 밀리지 않는다 — RGA 문자 id(anchorId)로 위치를 기억하고, op 적용 후 `resolveAnchorToIndex()`가 항상 올바른 가시 index를 반환한다.

현재 기반(feat/p6-presence): presence-update/presence-leave, `PresenceInfo{clientId,displayName,color}`, usePresence 훅, PresenceAvatars, relayClient presence 핸들러. crdt 공개 API: `getVisibleNodes(rga)`, `DocState.inlineRgas`, `RgaNode{id,deleted,next}`, `idEquals/idKey`.

## 목표
- 협업자 caret 위치를 색 막대 + 이름 레이블로 에디터 내 실시간 표시.
- anchorId 앵커로 편집 중에도 커서가 올바른 문자 옆에 머문다.
- 성공 지표: 2탭 동시 편집 시 상대 커서가 올바른 문자 옆에 유지됨을 테스트로 결정적 검증.

**비목표**: 선택 영역(range) 하이라이트 · 블록 구조편집(Enter/Backspace) 커서 · 커서 색 커스터마이즈 · 커서 영속화 · Playwright e2e.

## 요구사항

### 기능 요구사항
- **[Must] FR-1**: caret 이동(selectionchange/keyup/click) 시 위치를 `{blockId:RgaId, anchorId:RgaId|null}`로 캡처. anchorId = caret 직전 문자의 RGA 노드 id, caret이 블록 맨 앞이면 null(= 0번 위치).
- **[Must] FR-2**: caret 이동을 50ms debounce 후 cursor-update로 전송.
- **[Must] FR-3**: 수신측은 `resolveAnchorToIndex(doc, blockId, anchorId)`로 anchorId를 현재 가시 index로 변환. tombstone 앵커는 다음 살아있는 문자의 index로 fallback, 없으면 블록 가시 길이(블록 끝) 반환. anchorId=null이면 0.
- **[Must] FR-4**: 원격 협업자 커서를 해당 블록 안에 절대 위치 요소로 렌더 — 협업자 색상의 세로 막대 + 이름 레이블. 색·이름은 기존 PresenceInfo에서 읽는다.
- **[Must] FR-5**: 자기 커서는 렌더하지 않는다(브라우저 네이티브 caret). clientId로 구분.
- **[Must] FR-6**: 커서 상태는 메모리만(연결 수명). presence-leave 수신 시 해당 커서 즉시 제거.
- **[Should] FR-7**: 커서 이름 레이블은 일정 시간(3초) 노출 후 자동 숨김(막대는 유지). (선택)
- **[Should] FR-8**: 에디터 포커스가 없으면 cursor 이벤트를 전송하지 않는다.

### 비즈니스 규칙
- **[Must] BR-1**: anchorId 기반 — DOM offset이 아닌 RGA 문자 id. 타인의 삽입/삭제 후에도 동일 anchorId가 동일 문자를 가리킨다.
- **[Must] BR-2**: tombstone fallback — 앵커 문자 삭제 시 다음 살아있는 문자(또는 블록 끝)로. 커서 소멸 안 됨.
- **[Must] BR-3**: debounce 50ms — caret 이동 N회가 50ms 내면 전송 1회로 합침.
- **[Must] BR-4**: 자기 커서 미렌더 — 수신 cursor 중 자기 clientId는 렌더 제외.
- **[Must] BR-5**: 빈 블록 커서 — 블록 텍스트 빈 경우 anchorId=null(블록 맨 앞=끝).
- **[Must] BR-6**: 색·이름 재사용 — 신규 필드 없이 PresenceInfo.color/displayName 사용.
- **[Must] BR-7**: presence-leave 연동 — 협업자 이탈 시 커서도 즉시 제거.
- **[Must] BR-8**: cursor-update broadcast — relay가 발신자 제외 같은 room에 중계(presence 패턴). 비영속(저장 안 함, roster 없음 — 다음 이동 시 재표시).

### 품질 기대
- **[Should] QE-1**: 50ms debounce로 빠른 타이핑 중 불필요 전송 억제.
- **[Should] QE-2**: 협업자 커서가 레이아웃을 밀어내지 않음(절대 위치 오버레이).
- **[Should] QE-3**: 다중 협업자 커서가 각자 다른 색으로 독립 표시.

## 사용자 시나리오
**정상 — 커서 수렴**: A·B 접속 → B가 5번째 문자 뒤 caret(50ms 후 전송) → A 화면에 B 색막대+이름이 5번째 문자 뒤 → A가 B 커서 앞에 3글자 삽입 → B anchorId 불변 → A 화면에서 B 커서가 삽입 3글자 뒤(원래 문자 앞)로 자동 이동.
**예외 — tombstone**: B가 문자 X에 anchor, A가 X 삭제 → resolveAnchorToIndex가 X 다음 살아있는 문자 index 반환.
**예외 — 빈 블록**: B가 빈 블록 커서 → anchorId=null → A 화면 index 0.
**엣지**: 블록 끝 커서(마지막 가시 문자 id, index=길이) · 다중 커서(C,D 다른 색 독립) · 앵커 삭제 후 추가 편집(fallback 유지).

## 영향 범위
- **ws-relay**: protocol.ts(cursor-update 타입+파싱), room.ts(cursor broadcast 발신자 제외), server.ts(배선), index.ts(타입 export).
- **web**: realtime/protocol.ts(cursor-update), realtime/relayClient.ts(sendCursor+onCursorUpdate), realtime/usePresence.ts 또는 신규 useCursor(커서 Map), editor/crdtDocument.ts(anchorId↔index 변환·resolveAnchorToIndex), editor/useCrdtDocument.ts(cursor 배선+sendCursor 노출), components/editor/Editor.tsx(selection→debounce 전송+원격 커서 렌더), EditorContainer.tsx(props).
- **crdt(필요 시)**: resolveAnchorToIndex/anchor 변환을 web에 둘지 crdt에 export할지는 설계 결정.
- **기존 영향 없음**: presence-update/leave·op 수렴 경로 불변(AC-9 패턴). cursor 모르는 구버전은 parseServerMessage default:null 무시.

## 수용 기준 (Given-When-Then)

**AC-1 anchorId 캡처 — caret 직전 문자**
```
Given: 블록 텍스트 "hello"에서 caret이 index 2(두 번째 'l' 뒤)에 위치
When:  caret 이동 후 debounce 만료
Then:  전송 cursor-update의 anchorId가 index 2 문자(두 번째 'l')의 RgaId와 동일하다.
```
**AC-2 resolveAnchorToIndex — 앞쪽 삽입 후 anchorId 불변**
```
Given: 사이트 B의 DocState에서 blockId·anchorId(문자 X의 RgaId) 확정
When:  사이트 A가 X 앞에 문자 3개 삽입 op를 B에 적용
Then:  resolveAnchorToIndex(docB, blockId, anchorId)가 동일 문자 X를 가리키는 새 index(삽입 전 +3)를 반환한다.
```
**AC-3 tombstone fallback — 다음 문자**
```
Given: anchorId가 문자 X를 가리키고, X 다음 살아있는 문자 Y가 있음
When:  X에 delete op 적용(tombstone)
Then:  resolveAnchorToIndex(docB, blockId, anchorId_X)가 Y의 가시 index를 반환한다.
```
**AC-4 tombstone fallback — 마지막 문자 삭제 → 블록 끝**
```
Given: anchorId가 블록의 마지막 가시 문자를 가리킴
When:  해당 문자에 delete op 적용
Then:  resolveAnchorToIndex가 블록 현재 가시 텍스트 길이를 반환한다.
```
**AC-5 debounce 50ms — N회 이동 → 전송 1회**
```
Given: cursor 전송 spy가 설치된 환경
When:  50ms 내 caret 이동 이벤트 5회 발생
Then:  cursor 전송 함수가 정확히 1회 호출된다.
```
**AC-6 빈 블록 커서 — anchorId null**
```
Given: 블록 텍스트가 빈 문자열("")
When:  해당 블록에 caret 위치 후 debounce 만료
Then:  전송 cursor-update의 anchorId가 null이고, resolveAnchorToIndex(doc, blockId, null)이 0을 반환한다.
```
**AC-7 자기 커서 미렌더**
```
Given: 로컬 clientId가 "site-local"
When:  clientId "site-local"인 cursor-update를 수신
Then:  에디터 DOM에 data-cursor-client-id="site-local" 요소가 렌더되지 않는다.
```
**AC-8 원격 커서 렌더 — 색·이름 레이블**
```
Given: PresenceInfo{clientId:"site-b", displayName:"사용자 #bbbb", color:"#64B5F6"} 존재 + site-b cursor-update 수신
When:  jsdom render로 에디터 렌더
Then:  data-cursor-client-id="site-b" 요소가 존재하고, 그 색상이 "#64B5F6", 이름 레이블에 "사용자 #bbbb"가 포함된다.
```
**AC-9 presence-leave 시 커서 제거**
```
Given: site-b 커서가 렌더된 상태
When:  presence-leave(clientId="site-b") 수신
Then:  커서 상태 맵에서 site-b가 제거되고, DOM에 data-cursor-client-id="site-b" 요소가 없다.
```
**AC-10 2탭 커서 수렴 — in-memory relay 통합**
```
Given: in-memory relay로 연결된 A·B; B가 anchorId X(blockId=GENESIS_BLOCK_ID)로 cursor-update 전송
When:  A가 X 앞에 문자 삽입 op 적용 후 resolveAnchorToIndex 호출
Then:  반환 index가 삽입 전보다 1 증가하고, anchorId X는 동일 노드를 가리킨다(2탭 커서 broadcast 경로도 검증).
```

## 제외 범위
선택 영역 하이라이트 · 블록 구조편집 커서 · 커서 색 커스터마이즈 · 커서 서버 영속화 · 동일 블록 다중 앵커(range) · Playwright e2e.

## 탐색 추가 항목
- `packages/crdt/src/rga.ts:144` getVisibleNodes + RgaNode.next — resolveAnchorToIndex 구현 기반(tombstone 인식 순회).
- `apps/web/src/lib/editor/crdtDocument.ts` — anchorId↔index 변환 함수 추가 후보.
- `apps/web/src/lib/realtime/__tests__/{inMemoryRelay.ts, presence.convergence.test.ts}` — cursor relay 지원 + 수렴 통합 테스트.
