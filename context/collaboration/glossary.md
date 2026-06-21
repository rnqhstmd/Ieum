# 실시간 협업 용어 사전

| 용어 | 정의 |
|------|------|
| **CRDT** (Conflict-free Replicated Data Type) | 수학적으로 수렴이 보장된 분산 자료구조. 같은 op 집합을 다른 순서로 적용해도 최종 상태가 동일하다. |
| **RGA** (Replicated Growable Array) | Ieum이 채택한 CRDT 알고리즘. 각 요소가 고유 id(`RgaId`)를 가지며, 삽입 위치는 선행 요소의 id(`originId`)로 명시하고 삭제는 tombstone으로 처리한다. MVP부터 2-level 블록 RGA 구조로 구현된다. |
| **블록 RGA** | 2-level 블록 RGA의 외부 레벨. 블록(paragraph, heading1~3, bullet list 등)을 RGA 요소로 관리하는 리스트. 블록 단위 삽입·삭제·순서 변경을 수렴 보장하에 처리한다. |
| **인라인 텍스트 RGA** | 2-level 블록 RGA의 내부 레벨. 각 블록 안에 포함된 문자 시퀀스를 RGA로 관리한다. 블록별로 독립적인 RGA 인스턴스를 가진다. |
| **RgaId** | RGA 요소의 고유 식별자. `{ counter: number, siteId: string }` 쌍으로 구성. `counter`는 사이트 내 단조 증가 논리 클락, `siteId`는 편집 세션/탭마다 생성되는 UUID. |
| **RgaNode** | RGA의 요소(노드). `id`, `originId`, `value`, `deleted(tombstone)` 필드를 가진다. 외부 블록 RGA에서는 `value`가 블록 타입(BlockNode), 내부 인라인 텍스트 RGA에서는 `value`가 문자(string). |
| **originId** | INSERT op에서 "이 요소가 삽입된 직전 요소의 id". `null`이면 문서 시작(sentinel 직후). |
| **tombstone** | 논리적으로 삭제된 RGA 노드. `deleted = true`로 표시되며 순서 유지를 위해 링크드 리스트 구조에 남아 있지만 `toText()`에서 제외된다. |
| **op** (operation) | RGA 연산 단위. `INSERT`(새 요소 삽입)와 `DELETE`(요소 tombstone 처리) 두 종류. |
| **수렴성** (Convergence) | 같은 op 집합을 다른 순서로 적용해도 최종 상태가 동일한 성질. 위반 시 사용자마다 다른 텍스트를 보게 된다. |
| **멱등성** (Idempotency) | 같은 op를 여러 번 적용해도 한 번 적용한 것과 결과가 동일한 성질. 네트워크 재전송·재접속 replay를 안전하게 처리한다. |
| **교환법칙** (Commutativity) | op 적용 순서를 바꿔도 최종 상태가 동일한 성질. 네트워크 순서와 무관하게 동일한 결과를 보장한다. |
| **인과 버퍼링** (Causal Buffering) | op의 `originId`가 아직 로컬에 없으면 `pendingBuffer`에 보관하고, `originId`가 도착한 후 자동으로 적용하는 메커니즘. |
| **tie-break** | 같은 `originId`에 여러 노드가 동시 삽입될 때 결정론적 순서를 정하는 규칙. `counter` 내림차순, counter가 같으면 `siteId` 사전 역순으로 비교한다. |
| **presence / awareness** | 현재 페이지에 접속 중인 다른 사용자의 상태 정보(커서 위치, 이름, 색상, 아바타). 서버에 영속 저장하지 않고 WebSocket 브로드캐스트로만 전파된다. |
| **커서 앵커** (anchorId) | presence 커서 위치를 RGA 문자 id로 표현한 것. DOM 인덱스 기반이 아니라 id 기반이므로 다른 사용자의 편집 후에도 커서가 올바른 문자를 가리킨다. |
| **Snapshot** | 특정 시점의 완전한 RGA 상태를 직렬화한 레코드. `pageId`, `state(JSON)`, `version(최대 seq)` 필드를 가진다. 재접속 시 전체 op replay 비용을 줄이는 데 사용된다. |
| **relay 서버** | CRDT op를 클라이언트 간에 중계하고, op를 DB에 영속화하며, presence 정보를 브로드캐스트하는 별도 Node.js + ws 서버. room은 pageId 단위로 관리된다. |
| **siteId** | 편집 세션/탭마다 새로 생성되는 UUID. CRDT 수렴 정확성을 위한 replica 식별자이며, 사용자 신원(`userId`)과 별개다. `(counter, siteId)` 쌍이 전역 유일 식별자 역할을 한다. 사용자 식별은 WebSocket 연결 시 JWT 인증으로 별도 처리하며, 서버는 클라이언트 siteId를 신뢰해 신원을 판단하지 않는다. |
| **seq** | 특정 `siteId` 내에서 op가 발생한 순서를 나타내는 단조 증가 번호. `(siteId, seq)` 쌍은 op의 벡터 클럭 역할이며 전체 시스템 내 전역 유일하다. |
| **pendingBuffer** | `originId`가 아직 도착하지 않아 적용할 수 없는 op를 임시 보관하는 버퍼. 새 op 적용 후 `drainBuffer()`로 재검사된다. |
| **toText()** | RGA 링크드 리스트를 순회하며 `deleted = false`인 노드의 value만 이어붙여 현재 문서 텍스트를 반환하는 함수. |
| **packages/crdt** | 순수 TypeScript로 구현된 RGA CRDT 모듈. 외부 의존성 0, 네트워크·DOM·파일시스템 접근 없음. Node.js·브라우저·Vitest 환경 모두에서 동일하게 동작한다. |
| **apps/ws-relay** | P5 WebSocket relay 서버 패키지. 순수 라우팅(`RoomRegistry`)과 `ws` 어댑터(`server.ts`)를 분리한다. `@ieum/crdt`는 타입 용도로만 import하며 런타임 CRDT를 적용하지 않는다(op 불투명 전달). |
| **RoomRegistry** | relay 서버의 순수 라우팅 클래스. pageId(room)별 연결 집합을 관리하고, join/op 처리 결과를 "누구에게 무엇을 보낼지"(`Dispatch[]`)로 **반환만** 한다(직접 send 안 함 → fake로 단위 테스트). op는 클라이언트가 실제 join한 room으로만 broadcast하고 발신자를 제외한다(교차 주입 차단·BR-2). |
| **wire 봉투 (WireEnvelope)** | op를 네트워크로 전송하기 위한 봉투. `{ siteId, seq, opType, payload }` 구조. `toWire(op, seq, siteId)`/`fromWire(env)`로 직렬화하며, `opType`은 op의 type(소문자)을 그대로 담는다. relay는 이 봉투를 파싱하지 않고 불투명하게 중계한다. |
| **genesis 블록** | P5 walking skeleton에서 sync(서버 초기 상태 전달) 미구현을 보완하기 위해, 모든 탭이 동일한 고정 id로 생성하는 초기 paragraph 블록(`createCollaborativeDocument`). 같은 pageId의 두 탭이 같은 블록 위에서 인라인 op를 수렴시킬 수 있게 한다. sync/snapshot 구현 후 대체된다. |
| **Transport (클라이언트)** | 클라이언트의 WebSocket 송수신을 추상화한 인터페이스(`send`/`onMessage`/`onOpen`/`onClose`/`close`). 실제 WebSocket 어댑터와 재연결 래퍼(`createRetryingTransport`)로 분리되어, 테스트에서 FakeTransport를 주입해 relay 로직을 네트워크 없이 검증한다. |
| **presence-update / presence-leave** | P6 presence(아바타 목록)의 서버→클라 메시지. `presence-update`는 접속자 참여/갱신을 `{clientId, displayName, color}`로, `presence-leave`는 이탈을 `{clientId}`로 알린다. relay의 `join`은 발신자에게 join-ack(항상 Dispatch[0])·self presence-update·기존 roster를, 기존 접속자에게는 발신자 presence-update를 보낸다. `leave`는 남은 접속자에게 presence-leave를 브로드캐스트한다. presence 정보는 DB 비영속(연결 수명 메모리)이며 displayName은 클라가 제공(서버 신뢰 중계, 미제공 시 room별 "익명 #N" fallback)한다. |
| **색상 슬롯 (PRESENCE_COLORS)** | presence 아바타 색상. 서버(RoomRegistry)가 8색 사전 정의 팔레트(`PRESENCE_COLORS`, 07-collaboration-crdt.md:531)에서 room 접속 순서대로 빈 슬롯 인덱스를 할당하고, disconnect 시 슬롯을 반환해 재입장 시 재사용한다. 8명 초과 시 modulo로 순환 재사용한다. 색상은 서버 할당이며 클라가 주입할 수 없다. |
| **usePresence** | 클라이언트 presence 상태 훅. `Map<clientId, PresenceInfo>`를 보유하며 presence-update/leave를 순수 reducer(`applyPresenceUpdate`/`applyPresenceLeave`, immutable)로 반영하고 clientId 정렬 배열을 노출한다. CRDT DocState(`useCrdtDocument`)와 분리되어 op 동기화 경로에 영향을 주지 않는다(관심사 분리). |
| **PresenceAvatars** | 에디터 상단의 접속자 아바타 목록 컴포넌트(presentational, props만). 각 접속자를 색상 배지 + 이니셜(displayName의 `#` 뒤 첫 글자 대문자)로 렌더하며 자기 자신도 동일하게 포함(강조 없음)한다. displayName은 `title`/`aria-label`로 노출하고 빈 목록이면 컨테이너만 렌더한다. |
| **cursor-update / cursor 메시지** | P6 라이브 커서의 메시지. C→S `cursor {pageId, blockId, anchorId}`(clientId 미전송 — 서버가 태깅), S→C `cursor-update {clientId, blockId, anchorId}`(발신자 제외 broadcast). 커서는 비영속(relay 저장/roster 없음 — 다음 이동 시 재표시)이며 색·이름은 미포함(렌더 시 PresenceInfo lookup). 커서 제거는 `presence-leave` 재사용. blockId/anchorId는 `isRgaId`로 검증(counter 유한 비음수 정수·siteId 길이 상한). |
| **anchorId / anchor 변환** | 커서 위치를 RGA 문자 id로 표현한 것(caret 직전 문자 id, 맨 앞이면 null). `@ieum/crdt`의 `indexToAnchorId(doc, blockId, 가시index)`(송신측 캡처)와 `resolveAnchorToIndex(doc, blockId, anchorId)`(수신측 가시 index 복원) 순수 함수로 변환한다. resolve는 `RgaState.sentinel.next`를 tombstone 포함 전체 순회하여, 앵커 문자가 삭제되면 다음 살아있는 문자(또는 블록 끝)로 fallback한다 — 타인의 편집 후에도 커서가 올바른 문자 옆에 머문다. |
| **useCursor** | 클라이언트 커서 상태 훅. `Map<clientId, CursorInfo{clientId,blockId,anchorId}>`를 보유하며 cursor-update/presence-leave를 순수 reducer(`applyCursorUpdate`/`applyCursorLeave`, immutable)로 반영한다. usePresence와 동형이며 DocState·presence와 분리(관심사: 위치). Editor는 50ms debounce 후 caret offset을 올리고, 원격 커서를 contentEditable 형제 오버레이(색막대+이름)로 렌더한다. 자기 커서는 서버 부여 clientId(join-ack)로 식별해 제외한다. |
