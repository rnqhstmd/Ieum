# 설계서: P6 Presence (아바타 목록) — 실시간 협업 인지

## 개요 / 설계 규모
**중형.** P5의 확립된 패턴(순수 `RoomRegistry` + `Dispatch[]` 반환, `Transport` 주입, in-memory relay 하네스)을 그대로 따른다. 변경 8 수정 + 3 신규(+테스트), 새 아키텍처 패턴 도입 없음.

walking skeleton 스코프: 아바타 목록만(라이브 커서 제외), displayName=클라가 siteId 기반 자동 생성, 자기 자신 포함(강조 없음).

확정 UI 결정:
- **동일 displayName 다중 탭**: 색상만으로 구분(추가 표식 없음). BR-6/7 그대로.
- **아바타 이니셜**: `displayName`의 `'#'` 뒤 첫 글자를 대문자로(예: "사용자 #a1b2" → "A", "익명 #5" → "5"). PresenceInfo만으로 파생, siteId를 PresenceInfo에 넣지 않는다.

## 핵심 설계 결정

**결정 1 — presence 경로: 기존 `join` 메시지 확장.** `{ type:'join', pageId, presence?: { displayName?: string } }`. presence는 join 시점 확정(siteId 자동생성, 사용자 입력 없음) → 1 round-trip 원자 처리. color는 클라가 안 보냄(서버가 BR-5 할당, 클라 신뢰는 displayName에 한정). optional 필드 → P5 클라 하위호환.

**결정 2 — self presence를 발신자에게도 전송(서버 주도).** color가 서버 할당이라 클라가 자기 color를 모름 → join Dispatch에 self presence-update(서버 color 포함) 포함. usePresence가 self/peer 동일 경로 처리(BR-6 강조없음).

**[불변식 — MUST] join 반환 `Dispatch[]`의 인덱스 0은 항상 join-ack.** (발신자 X, 기존 peers P1..Pn 순):
- `[0]` 발신자에게 `join-ack`(기존 P5, connectedClients) — **항상 첫 요소**.
- 발신자에게 self `presence-update`(서버 color 포함) — AC-7/BR-6.
- 발신자에게 각 기존 peer의 `presence-update` n건 — AC-2/FR-3(roster).
- 각 기존 peer에게 발신자 `presence-update` 1건씩 — AC-1/FR-2(peer 루프라 발신자 자동 제외).

> 이 불변식은 `server.test.ts`의 "첫 도착 메시지=join-ack" 가정과 `room.test.ts`의 join-ack 단정을 보존하기 위함이다. 더불어 기존 테스트는 `.find(d => d.message.type==='join-ack')` / `.filter(type==='join-ack')`로 견고화한다(RGR 2/5단계).

**결정 3 — `leave` 시그니처 `void → Dispatch[]`.** disconnect 시 색상 슬롯 반환 + presence 정리 후, 남은 peer에게 `presence-leave { clientId }` Dispatch[] 반환. server.ts close 핸들러가 send 배선.

**결정 4 — `ClientHandle` `{id}` 불투명 유지, presence는 `RoomRegistry` 내부 맵.** 핸들에 presence 안 넣음(양방향 결합 방지, 색슬롯은 room 상태라 registry 소유, 기존 fake handle 테스트 유지).

**결정 5 — `usePresence` 별도 훅(useCrdtDocument 확장 아님).** 관심사 분리(DocState vs awareness) + 순수 reducer 단독 테스트 + AC-9(op 무영향) 구조 보장. relay 배선은 useCrdtDocument가 소유 → presence 핸들러를 usePresence reducer로 위임.

## 메시지 프로토콜 (ws-relay·web 대칭 복제, 공유패키지화 범위 밖)
```ts
JoinMsg { type:'join', pageId:string, presence?: { displayName?: string } }   // C→S 확장
PresenceInfo      { clientId:string, displayName:string, color:string }
PresenceUpdateMsg { type:'presence-update', clientId, displayName, color }     // S→C 신규
PresenceLeaveMsg  { type:'presence-leave', clientId }                          // S→C 신규
ClientToServer = JoinMsg | OpMsg
ServerToClient = JoinAckMsg | OpMsg | OpAckMsg | PresenceUpdateMsg | PresenceLeaveMsg
```
**검증(proto 가드 포함):**
- `parseClientMessage` join 분기: `o.presence` 있으면 `typeof==='object' && !hasDangerousKey` 확인 후 `displayName`이 string이면 채택, 아니면 presence 생략. presence 검증 실패가 join을 null로 만들지 않음(서버 fallback이 흡수), **dangerous key만 즉시 null**.
- `parseServerMessage`: `presence-update`(clientId/displayName/color 모두 string), `presence-leave`(clientId string). 최상위 `hasDangerousKey` 가드(기존 line 57) 유지. `default: null` 유지(하위호환).

## 컴포넌트별 설계

### 1. apps/ws-relay/src/room.ts — RoomRegistry presence 확장
- 신규 상태: `presence: Map<clientId, PresenceInfo>`, `colorSlots: Map<pageId, Map<clientId, slot:number>>`, **`anonCounters: Map<pageId, number>`** (MUST-ADDRESS 3: room별 단조, 전역 아님).
- `join(client, pageId, presence?): Dispatch[]` — 멤버십 추가(기존) + `assignColor(pageId, client.id)` + `resolveDisplayName(pageId, presence?.displayName)` + presence 맵 저장 + 결정 2 Dispatch 4종(join-ack는 `[0]`).
- `leave(client): Dispatch[]` — pageId 없으면 `[]`. 멤버십 제거 + `presence.delete` + 해당 room slot 맵에서 `delete`(슬롯 반환, room 비면 slot·anonCounter 맵도 정리) + 남은 peer에게 `presence-leave` Dispatch.
- `private assignColor(pageId, clientId): string` — requirements/07:538 로직: `used = new Set(roomSlotMap.values())` → 빈 인덱스 0부터, 없으면 `roomSlotMap.size % PRESENCE_COLORS.length`; slot 기록 후 `PRESENCE_COLORS[slot]`.
- `private resolveDisplayName(pageId, raw?): string` — `raw?.trim()`이 비면 `익명 #${(anonCounters.get(pageId) ?? 0) + 1}` 후 카운터 증가. **room별 단조.**
- `PRESENCE_COLORS` 상수는 room.ts 상단(또는 colors.ts). 순수 유지(send 없음).

### 2. apps/ws-relay/src/server.ts — 배선
- message 핸들러: `registry.join(handle, msg.pageId, msg.presence)`로 presence 전달. handleOp 분기 **불변(AC-9)**.
- close 핸들러: `const dispatches = registry.leave(handle); <send 루프>; sockets.delete(handle.id)`. send 루프는 message 핸들러와 동일 패턴(헬퍼 `sendAll(dispatches)` 추출 권장).

### 3. apps/ws-relay/src/index.ts — barrel
- `PresenceInfo`, `PresenceUpdateMsg`, `PresenceLeaveMsg` 타입 re-export.

### 4. apps/web/src/lib/realtime/protocol.ts — 클라 파싱
- JoinMsg 확장 + Presence 타입 추가 + ServerToClient 유니온 갱신 + `parseServerMessage` 2 case + `default:null` 유지.

### 5. apps/web/src/lib/realtime/relayClient.ts — presence 핸들러/송신
- `RelayClientHandlers`에 `onPresenceUpdate?(info)`, `onPresenceLeave?(clientId)` 추가. onMessage switch 2 분기.
- `createRelayClient(transport, pageId, handlers, opts?: { displayName?: string })`. `join(page)`이 opts.displayName 있으면 `{type:'join', pageId, presence:{displayName}}`, **없으면 `{type:'join', pageId}` 그대로**(기존 4인자 호출 무변경 — relayClient.test exact-match 보존).

### 6. apps/web/src/lib/realtime/usePresence.ts (신규)
- 순수 reducer(React 무관, 단독 테스트): `applyPresenceUpdate(map, info): PresenceMap`(immutable 추가/갱신), `applyPresenceLeave(map, clientId): PresenceMap`(immutable 제거).
- 훅 `usePresence(): { presences: PresenceInfo[]; onPresenceUpdate(info); onPresenceLeave(clientId) }`. `useState<PresenceMap>` + `useMemo`로 Map→clientId 오름차순 정렬 배열.

### 7. apps/web/src/lib/editor/useCrdtDocument.ts — 배선
- `usePresence()` 호출. `displayNameFromSiteId(doc.siteId)` = `사용자 #${siteId.slice(0,4)}` → createRelayClient `opts.displayName`. 핸들러에 `onPresenceUpdate/onPresenceLeave` 위임(op 경로 불변). 반환에 `presences: PresenceInfo[]` 추가.

### 8. apps/web/components/editor/PresenceAvatars.tsx (신규)
- props `{ presences: PresenceInfo[] }`. self 포함 강조없음(전부 동일 렌더). 원형 배지(배경 inline `color`) + **이니셜**(`initialOf(displayName)` = `'#'` 뒤 첫 글자 대문자, 없으면 첫 글자). 전체 displayName은 `title` + `aria-label`. 빈 배열 → 빈 컨테이너(BR-8). 접근성 `role="list"`/그룹 + `data-testid`/`aria-label`로 테스트 조회.

### 9. apps/web/components/editor/EditorContainer.tsx — 마운트
- `presences` 구조분해, 상단(autosave-status 위)에 `<PresenceAvatars presences={presences} />`. op/title 경로 불변.

## 데이터 구조
```ts
PresenceInfo = { clientId, displayName, color }
PresenceMap  = Map<string, PresenceInfo>
PRESENCE_COLORS = ['#E57373','#64B5F6','#81C784','#FFD54F','#BA68C8','#4DB6AC','#FF8A65','#90A4AE']  // 07:531
// RoomRegistry: presence Map<clientId,PresenceInfo>, colorSlots Map<pageId,Map<clientId,slot>>, anonCounters Map<pageId,number>
// 색슬롯(AC-6): used=Set(roomSlotMap.values())→findIndex(i∉used) 0부터→없으면 size%8. leave시 delete→재사용.
```

## 변경 범위
**신규(3 + 테스트 3):** usePresence.ts, PresenceAvatars.tsx, PresenceAvatars.test.tsx, (ws-relay) tests/room.presence.test.ts, (web) usePresence.test.ts, presence.convergence.test.ts.
**수정(8):** ws-relay {protocol.ts, room.ts, index.ts, server.ts}, web {realtime/protocol.ts, realtime/relayClient.ts, editor/useCrdtDocument.ts, components/editor/EditorContainer.tsx}.
**기존 테스트 수정(2):** ws-relay tests/room.test.ts(join-ack assert 견고화), tests/server.test.ts(join-ack find 견고화).

## 영향/호환 (MUST-ADDRESS 반영)
- **(M1) AC-3 통합 트리거 명세**: `inMemoryRelay.ts close()`는 `inboxes.delete(clientId)` **이전에** `deliver(reg.leave(handle))`를 호출한다(leave된 본인 제외 peer에게만 가므로 순서 안전). `presence.convergence.test`는 떠나는 클라의 `transport.close()`(= relayClient.dispose 경유 또는 직접)로 AC-3을 트리거한다. 기존 convergence.test는 close 미사용 → 신규 테스트가 이 경로를 커버.
- **(M2) Dispatch 순서 불변식**: join-ack는 항상 `Dispatch[0]`. 기존 `room.test.ts:24 toHaveLength(1)`·`:31 d2[0]`와 `server.test.ts:33` 첫 메시지 가정은 `.find/.filter(type==='join-ack')`로 견고화.
- **(M3) anonCounter 격리**: room별 `Map<pageId,number>`. AC-8 테스트는 구체적 N이 아닌 정규식 `/^익명 #\d+$/`로만 검증.
- JoinMsg optional·createRelayClient 4번째 인자 optional → P5 하위호환. presence 모르는 구버전: parseServerMessage `default:null` 무시. op 경로(handleOp/onRemoteOp) 완전 불변 → **AC-9**.
- (인지) half-open 연결(close 미발화)은 유령 아바타로 잔존 — heartbeat 미도입, walking skeleton 범위 밖(후속). QE-1은 정상 close 기반.

## 구현 순서 (RGR 단위)
1. **[Must] ws-relay protocol.ts**: JoinMsg 확장 + Presence 타입 + parseClientMessage presence 검증 (의존:없음). RED: protocol.test 확장(presence 채택/생략/비문자열/proto).
2. **[Must] ws-relay room.ts**: presence 상태 + 색슬롯 + assignColor + resolveDisplayName(room별 anonCounter) + join Dispatch 4종(join-ack[0]) (의존:1). RED: room.presence.test AC-1/2/6/7/8 + 기존 room.test join-ack 견고화(.find/.filter).
3. **[Must] ws-relay room.ts**: leave→Dispatch[](presence-leave + 슬롯/anonCounter 반환) (의존:2). RED: AC-3(presence-leave, roomSize 감소, 슬롯 재사용).
4. **[Must] ws-relay index.ts**: barrel re-export (의존:1).
5. **[Must] ws-relay server.ts**: close→leave Dispatch send + join presence 전달 + server.test join-ack find 견고화 (의존:3,4).
6. **[Must] web protocol.ts**: Presence 타입 + parseServerMessage 분기 (의존:없음). RED: protocol.test presence/null/proto.
7. **[Must] web relayClient.ts**: presence 핸들러 + join payload(opts.displayName) (의존:6). RED: relayClient.test 라우팅 + join payload(+opts 미제공 exact-match 회귀가드).
8. **[Must] web usePresence.ts**: 순수 reducer + 훅 (의존:6). RED: usePresence.test AC-4/5.
9. **[Must] web PresenceAvatars.tsx + 테스트** (의존:6). RED: AC-4/5 목록·color·이니셜·self + BR-8 빈목록.
10. **[Must] web useCrdtDocument.ts**: usePresence 배선 + displayNameFromSiteId + presences 반환 (의존:7,8).
11. **[Must] web EditorContainer.tsx**: PresenceAvatars 마운트 (의존:9,10).
12. **[Must] web inMemoryRelay.ts**: close()에서 leave Dispatch deliver(inboxes.delete 이전) + presence.convergence.test (의존:3,5,7,8). RED: AC-1/2/3 2탭 수렴 + AC-9 op 불변.

병렬: {1,6} 선행 분기. 6 이후 {7,8,9} 병렬, 1 이후 {2,4}. ws트랙(1→2→3→4→5) + web트랙(6→{7,8,9}) → 10,11 → 12 합류.

---

## Testability 평가 (test-architect)

### 컴포넌트별 테스트 전략
- **RoomRegistry presence 확장**: 단위(`room.presence.test.ts`), fake `ClientHandle{id}`만으로 Dispatch[] assert. AC-1(self broadcast 제외), AC-2(roster 건수=기존 인원), AC-6(color[0/1/2] + leave 후 [0] 재사용), AC-7(단독 self 1건·peer 0건), AC-8(`/^익명 #\d+$/`). 모의 0, 매 it `new RoomRegistry()`.
- **leave(void→Dispatch[])**: 단위. `leave(A)`→peer에 presence-leave 1건 + roomSize 감소. 기존 `room.test.ts:97` leave 반환 무시라 하위호환.
- **ws-relay protocol.ts**: 단위. presence 채택/생략/비문자열/proto. optional이라 기존 7케이스 무변경.
- **web protocol.ts**: 단위. presence-update/leave 파싱 + 누락 null + proto.
- **relayClient.ts**: 단위, FakeTransport. join presence payload + 수신 라우팅 + **opts 미제공 시 join exact-match 회귀가드**.
- **usePresence reducer**: 순수 단위(React 무관). AC-4(immutable 추가), AC-5(immutable 제거 size=1).
- **PresenceAvatars**: render 단위(RTL/jsdom, Editor.test 패턴). AC-4 배지·color·이니셜·self 포함, BR-8 빈목록.
- **presence.convergence.test**: 통합(실 RoomRegistry + FakeTransport `createInMemoryRelay`). AC-1/2/3 2탭 + AC-9 op 무영향. inMemoryRelay.close()의 leave Dispatch deliver 배선 전제(M1).
- **useCrdtDocument/EditorContainer**: 통합 보조(renderHook+FakeTransport / 스모크).

### Testability Score: 9/10
모든 컴포넌트 DI(Transport/transportFactory/registry) 또는 순수/presentational. 전역상태·static 의존 없음. 9개 AC 전부 결정적 경로. 감점 -1: self presence-update의 Dispatch 순서 암묵 의존(3개 기존 테스트) → "join-ack=Dispatch[0]" 불변식(M2)으로 해소.

### 판정: ✅ TESTABILITY PASS (9/10 ≥ 7) — RGR 진입 가능.
