# PRD: P6 Presence — 실시간 협업 인지 (누가 이 페이지를 보고 있는지)

> 확정 스코프 결정 (2026-06-21):
> 1. **라이브 커서(US-PRES-02) 제외** — 아바타 목록만(US-PRES-01/03). 커서는 후속 슬라이스.
> 2. **displayName = siteId 기반 랜덤 자동 생성** ("사용자 #abcd"). 사용자 입력·localStorage 없음.
> 3. **자기 자신 아바타 포함, 별도 강조 없음** — 전체 접속자 동일 렌더링.

## 배경

P5 walking skeleton(WebSocket relay 2탭 텍스트 수렴)이 main에 머지 완료된 상태다. relay 서버(`RoomRegistry`)는 이미 `pageId → Set<ClientHandle>` room 멤버십과 `leave`(disconnect 시 자동 정리)를 추적하고 있어 presence 참여/이탈의 물리적 토대가 갖춰져 있다. 그러나 현재 접속자가 누구인지, 몇 명인지를 다른 탭에 알리는 기능이 없다.

노션식 협업 에디터에서 "누가 지금 이 페이지를 보고 있는지"를 실시간으로 아는 것은 협업 맥락 인식의 핵심이다. P6는 이 awareness 레이어를 추가하는 walking skeleton 슬라이스다.

현재 제품 상태:
- relay 서버: `join`/`handleOp`/`leave` 구현 완료. presence 메시지 타입 미구현.
- 클라이언트 `relayClient`: `onRemoteOp`/`onJoinAck`/`onOpAck` 핸들러만 존재. presence 수신 핸들러 없음.
- 클라이언트 `protocol.ts`: `ServerToClient` 유니온에 presence 메시지 타입 없음.
- `EditorContainer`: 아바타 UI 마운트 지점으로 식별되나 아바타 컴포넌트 미존재.

## 목표

**달성하려는 것:**
- 같은 페이지를 열고 있는 협업자의 아바타(표시 이름 + 색상)를 에디터 상단에서 실시간으로 확인할 수 있다.
- 탭이 접속하면 다른 탭에 즉시 나타나고, 탭이 닫히거나 이탈하면 즉시 사라진다.
- 새로 접속한 탭은 기존 접속자 목록을 즉시 확인할 수 있다.

**성공 지표 (비즈니스 관점):**
- 2탭을 열었을 때 서로의 아바타가 보이고, 한쪽을 닫으면 상대 탭에서 즉시 사라짐 — in-memory relay(실 RoomRegistry + FakeTransport) 통합 테스트로 결정적으로 검증 가능.

**비목표 (이번 슬라이스 제외):**
- 라이브 커서(anchorId 앵커링 + debounce 50ms) — 후속 슬라이스.
- presence 영속화(DB 저장).
- 실제 JWT/Auth.js 인증 연동.
- Playwright e2e 브라우저 테스트.
- 아바타 이미지(avatarUrl) — 이니셜+색상 배지로 한정.

## 요구사항

### 기능 요구사항

- **[Must] FR-1**: 탭이 특정 pageId에 참여할 때, 자신의 표시 이름(displayName)과 색상 정보를 relay 서버에 알린다. join 메시지를 확장하거나 별도 `presence` 메시지를 전송한다. displayName은 클라이언트가 siteId 기반으로 자동 생성한다("사용자 #abcd" 형식).
- **[Must] FR-2**: relay 서버는 presence 정보를 수신하면 같은 room의 다른 탭 전체에 `presence-update` 메시지로 브로드캐스트한다. 발신 탭 자신은 브로드캐스트 대상에서 제외한다.
- **[Must] FR-3**: 새 탭이 room에 참여할 때, relay 서버는 해당 탭에게 기존 접속자 전체의 presence 정보를 즉시 전달한다(개별 `presence-update` 순차 전송 또는 snapshot).
- **[Must] FR-4**: 탭의 WebSocket 연결이 종료(disconnect)되면 relay 서버는 같은 room의 나머지 탭 전체에 `presence-leave` 메시지를 브로드캐스트한다. 연결이 끊긴 탭의 clientId를 포함한다.
- **[Must] FR-5**: 클라이언트는 `presence-update`를 수신하면 에디터 상단 아바타 목록에 해당 접속자를 추가하거나 갱신한다.
- **[Must] FR-6**: 클라이언트는 `presence-leave`를 수신하면 해당 접속자를 아바타 목록에서 즉시 제거한다.
- **[Must] FR-7**: 에디터 상단(`EditorContainer`)에 접속자 아바타 목록 UI를 표시한다. 각 아바타는 표시 이름(이니셜 또는 전체)과 색상 배지로 구성된다. 자기 자신도 동일하게 포함하며 별도 강조는 하지 않는다.

### 비즈니스 규칙

- **[Must] BR-1**: presence 정보는 relay 서버 메모리에만 존재한다. DB 저장 없음. 탭 disconnect = presence 소멸.
- **[Must] BR-2**: relay 서버는 클라이언트가 제공한 표시 이름을 신뢰해 그대로 중계한다. 서버 측 신원 검증 없음(목 처리, P5 BR-5 정책 연장).
- **[Must] BR-3**: presence 식별자(`clientId`)는 relay가 연결 시 부여한 내부 id(`c1`, `c2` 등)를 사용한다. CRDT `siteId`와 별개이며 혼동하지 않는다.
- **[Must] BR-4**: displayName은 클라이언트가 siteId 기반으로 자동 생성한다. 미제공/빈 문자열로 도착하면 relay가 "익명 #N" 형식의 비어 있지 않은 문자열로 fallback한다.
- **[Must] BR-5**: 색상은 서버가 room 접속 순서 기준으로 8가지 사전 정의 팔레트(`requirements/07-collaboration-crdt.md §5-5`의 `PRESENCE_COLORS`) 중 하나를 할당한다. disconnect 시 슬롯 반환, 다음 신규 참여자가 재사용.
- **[Must] BR-6**: 자기 자신의 아바타도 목록에 표시한다(자신이 접속 중임을 인지). 별도 강조/구분 없음.
- **[Should] BR-7**: 동일 사용자가 다중 탭을 열면 각 탭을 독립 presence로 취급한다(clientId 기준 구분). 표시 이름이 같더라도 탭별로 별개의 아바타로 노출한다.
- **[Could] BR-8**: 빈 room(접속자 0명)에서 아바타 영역은 빈 상태로 표시한다(별도 안내 문구 없음).

### 품질 기대

- **[Should] QE-1**: 탭 종료 후 상대 탭의 아바타가 사라지는 지연이 체감상 즉각적이어야 한다(WebSocket `close` 이벤트 기반, 네트워크 지연 외 추가 지연 없음).
- **[Should] QE-2**: 새 탭이 열렸을 때 기존 접속자 목록이 join 시점에 즉시 확인되어야 한다(초기 snapshot 전달).

## 사용자 시나리오

**정상 흐름 — 2탭 참여 및 이탈:**
1. 탭 A가 `page-1`을 열고 join한다. displayName="사용자 #a1b2", relay가 색상 `#E57373` 할당.
2. 탭 A의 아바타 목록: [사용자 #a1b2].
3. 탭 B가 `page-1`을 열고 join한다. displayName="사용자 #c3d4", relay가 색상 `#64B5F6` 할당.
4. 탭 A·B 아바타 목록: [사용자 #a1b2, 사용자 #c3d4].
5. 탭 A를 닫는다.
6. 탭 B의 아바타 목록: [사용자 #c3d4]. 사용자 #a1b2 아바타 즉시 사라짐.

**엣지 — 빈 room 단독 진입**: 탭 A 혼자 진입 시 자신의 아바타만 표시.
**엣지 — 동일 이름 다중 탭**: 같은 displayName 2탭 동시 접속 시 각각 독립 presence(다른 clientId·색상)로 2개 아바타.
**엣지 — displayName 미제공**: 클라가 생략 시 relay가 "익명 #N"으로 채워 브로드캐스트.

## 영향 범위

**영향받는 기존 파일:**
- `apps/ws-relay/src/protocol.ts`: `ClientToServer`/`ServerToClient` 유니온에 presence 메시지 타입 추가.
- `apps/ws-relay/src/room.ts`: `RoomRegistry`에 presence 상태(clientId → PresenceInfo) 및 색상 슬롯 관리, `join`/`leave` Dispatch 확장.
- `apps/ws-relay/src/server.ts`: presence 메시지 처리 분기 추가.
- `apps/web/src/lib/realtime/protocol.ts`: `ServerToClient`에 `presence-update`/`presence-leave` 추가.
- `apps/web/src/lib/realtime/relayClient.ts`: `onPresenceUpdate`/`onPresenceLeave` 핸들러 추가.
- `apps/web/components/editor/EditorContainer.tsx`: 아바타 목록 UI 마운트.

**기존 사용자 영향:** 기존 op 중계(P5)는 불변. presence 메시지는 별도 타입으로 분리되어 `op`/`join`/`join-ack`/`op-ack`에 영향 없음.
**하위 호환성:** presence 메시지를 모르는 구버전 클라는 `parseServerMessage`의 `default: return null`로 무시(에러 없음).

## 수용 기준 (Given-When-Then)

**AC-1: join 시 presence 정보 브로드캐스트** → [FR-1, FR-2]
```
Given: room `page-1`에 탭 A가 이미 presence 등록된 상태
When:  탭 B가 displayName="사용자 #c3d4"로 presence join을 전송한다
Then:  탭 A에게 { type: "presence-update", clientId: <B>, displayName: "사용자 #c3d4", color: <서버 할당> } 가 1건 dispatch된다.
       탭 B 자신에게는 해당 presence-update가 dispatch되지 않는다.
```

**AC-2: 신규 참여자에게 기존 접속자 목록 즉시 전달** → [FR-3]
```
Given: room `page-1`에 탭 A, 탭 B가 이미 presence 등록 중
When:  탭 C가 presence join을 전송한다
Then:  탭 C에게 A·B의 presence 정보가 각각 presence-update로 전달된다. 전달 건수 = 기존 접속자 수(2건).
```

**AC-3: disconnect 시 presence-leave 브로드캐스트** → [FR-4, FR-6]
```
Given: room `page-1`에 탭 A(clientId="c1"), 탭 B(clientId="c2")가 참여 중
When:  탭 A의 WebSocket 연결이 종료된다(close)
Then:  탭 B에게 { type: "presence-leave", clientId: "c1" } 가 1건 dispatch된다.
       이후 RoomRegistry room `page-1`에서 c1이 제거된다(roomSize = 1).
```

**AC-4: 클라이언트 아바타 목록 갱신 — 참여** → [FR-5, FR-7]
```
Given: 클라이언트 presence 상태가 빈 맵({})인 초기 상태
When:  presence-update { clientId: "c2", displayName: "사용자 #c3d4", color: "#64B5F6" } 수신
Then:  presence 상태 맵에 clientId="c2" 항목이 추가되고, 아바타 목록 렌더링에 "사용자 #c3d4" 배지가 포함된다.
```

**AC-5: 클라이언트 아바타 목록 갱신 — 이탈** → [FR-6]
```
Given: 클라 presence 맵에 { c1:{displayName:"사용자 #a1b2"}, c2:{displayName:"사용자 #c3d4"} } 존재
When:  presence-leave { clientId: "c1" } 수신
Then:  맵에서 c1이 제거되고 아바타 목록에 "사용자 #c3d4"만 남는다(목록 길이 = 1).
```

**AC-6: 색상 슬롯 할당 및 반환** → [BR-5]
```
Given: PRESENCE_COLORS 인덱스 0부터 순서 할당하는 빈 room
When:  탭 A, B, C가 순서대로 join한 뒤 탭 A가 disconnect한다
Then:  A=color[0], B=color[1], C=color[2]를 받는다.
       A disconnect 후 신규 탭 D가 join하면 D=color[0](반환된 슬롯)을 받는다.
```

**AC-7: 빈 room에서의 단독 접속** → [BR-8, FR-7]
```
Given: room `page-1`에 아무도 없는 상태
When:  탭 A 혼자 join한다
Then:  탭 A의 아바타 목록에 자신 1명이 표시된다(self 포함). presence-leave가 발생하지 않고, 다른 탭으로의 broadcast dispatch가 0건이다.
```

**AC-8: displayName 미제공 시 fallback** → [BR-4]
```
Given: 클라이언트가 displayName 필드를 생략하거나 빈 문자열로 presence join을 전송한다
When:  relay 서버가 해당 클라이언트 presence를 room에 브로드캐스트한다
Then:  브로드캐스트된 presence-update의 displayName이 "익명 #N" 형식의 비어 있지 않은 문자열이다.
```

**AC-9: presence 메시지가 op 중계 흐름에 영향 없음** → 하위 호환성
```
Given: 탭 A, B가 presence 등록된 room에서 op를 주고받는 중
When:  탭 C가 join하여 presence-update 브로드캐스트가 발생한다
Then:  탭 A, B 간 op 브로드캐스트 경로 및 op-ack 수신에 변화가 없다(in-memory relay 통합 테스트에서 op 수렴 결과 동일).
```

## 제외 범위

- **라이브 커서(US-PRES-02)**: anchorId 기반 커서 전송/렌더링. 후속 슬라이스.
- **awareness 재전송(재접속 presence 복원)**: 후속.
- **presence 영속화**: DB 저장 없음.
- **실 인증 연동**: JWT/Auth.js userId 검증. 후속.
- **Playwright e2e**: in-memory relay 통합 테스트로 대체.
- **아바타 이미지**: 이니셜+색상 배지로 한정.

## 탐색 추가 항목
- `requirements/07-collaboration-crdt.md` §5-5 → `PRESENCE_COLORS` 팔레트(8색) + 슬롯 할당/반환 로직(:531) — BR-5/AC-6 근거.
