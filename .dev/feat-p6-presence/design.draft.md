# 설계 초안: P6 Presence (아바타 목록) — 실시간 협업 인지

## 설계 규모
**중형.** P5 패턴(순수 RoomRegistry + Dispatch[] 반환, Transport 주입, in-memory relay 하네스) 그대로 따름. 변경 6 수정 + 3 신규, 새 아키텍처 패턴 도입 없음.

## walking skeleton 스코프
아바타 목록만(라이브 커서 제외), displayName=클라가 siteId 기반 자동 생성, 자기 자신 포함(강조 없음).

## 핵심 설계 결정
**결정 1 — presence 경로: 기존 `join` 메시지 확장 채택.** `{type:'join',pageId,presence?:{displayName?}}`. presence는 join 시점 확정(siteId 자동생성, 사용자 입력 없음) → 1 round-trip 원자 처리, 중간 상태 없음. color는 클라가 안 보냄(서버가 BR-5 할당, 클라 신뢰는 displayName에 한정). optional 필드 → P5 클라 하위호환.

**결정 2 — self presence를 발신자에게도 전송(서버 주도).** color는 서버 할당이라 클라가 자기 color를 모름 → join Dispatch에 self presence-update(서버 color 포함) 포함. usePresence가 self/peer 동일 경로 처리(BR-6 강조없음 일치). `join` 반환 Dispatch[]: ① 발신자 join-ack(기존) ② 발신자에게 self presence-update(AC-7/BR-6) ③ 발신자에게 기존 peer roster n건(AC-2/FR-3) ④ 기존 peer들에게 발신자 broadcast(AC-1/FR-2, peer 루프라 발신자 자동 제외).

**결정 3 — `leave` 시그니처 void→Dispatch[].** 슬롯 반환+presence 정리 후 남은 peer에게 presence-leave Dispatch[] 반환. server.ts close 핸들러가 send 배선.

**결정 4 — ClientHandle `{id}` 불투명 유지, presence는 RoomRegistry 내부 맵.** 핸들에 presence 안 넣음(양방향 결합 방지, 색슬롯은 room 상태라 registry 소유, 기존 fake handle 테스트 유지). registry가 `clientId→PresenceInfo` 맵 + room별 슬롯 맵 소유.

**결정 5 — usePresence 별도 훅(useCrdtDocument 확장 아님).** 관심사 분리(DocState vs awareness), 순수 reducer로 단독 테스트, AC-9(op 무영향) 구조 보장. relay 배선은 useCrdtDocument가 소유 → presence 핸들러를 usePresence reducer로 위임.

## 메시지 프로토콜 (ws-relay·web 대칭 복제, 공유패키지화 범위 밖)
```
JoinMsg { type:'join', pageId:string, presence?: { displayName?: string } }   // C→S 확장
PresenceInfo      { clientId:string, displayName:string, color:string }
PresenceUpdateMsg { type:'presence-update', clientId, displayName, color }     // S→C 신규
PresenceLeaveMsg  { type:'presence-leave', clientId }                          // S→C 신규
ClientToServer = JoinMsg | OpMsg
ServerToClient = JoinAckMsg | OpMsg | OpAckMsg | PresenceUpdateMsg | PresenceLeaveMsg
```
검증: parseClientMessage join 분기 — o.presence 있으면 object+!hasDangerousKey 확인 후 displayName string이면 채택, 아니면 생략(검증실패가 join을 null로 만들지 않음, dangerous key만 즉시 null). parseServerMessage — presence-update(clientId/displayName/color 모두 string), presence-leave(clientId string). 최상위 hasDangerousKey 가드 유지.

## 변경 범위
**신규(3 + 테스트):** apps/web/src/lib/realtime/usePresence.ts, apps/web/components/editor/PresenceAvatars.tsx, PresenceAvatars.test.tsx. (테스트 신규) apps/ws-relay/tests/room.presence.test.ts, web usePresence.test.ts, presence.convergence.test.ts.
**수정(8):** ws-relay protocol.ts(JoinMsg확장+presence타입+파싱), room.ts(presence상태/슬롯/join·leave), index.ts(re-export), server.ts(close leave Dispatch send + join presence 전달), web protocol.ts(presence타입+parseServerMessage), relayClient.ts(presence핸들러+join payload), useCrdtDocument.ts(usePresence배선+displayName생성+presences반환), EditorContainer.tsx(PresenceAvatars 마운트).

## 컴포넌트별 설계 (요지)
- **RoomRegistry**: `presence:Map<clientId,PresenceInfo>`, `colorSlots:Map<pageId,Map<clientId,slot>>`, `anonCounter`. `join(client,pageId,presence?):Dispatch[]`(멤버십+assignColor+displayName fallback+Dispatch 4종). `leave(client):Dispatch[]`(제거+슬롯반환+presence-leave). `assignColor`=07-collaboration-crdt.md:538 로직(used set→빈 0부터→없으면 size%8). resolveDisplayName(빈값→`익명 #${anonCounter++}`). 순수 유지.
- **server.ts**: close→`const d=registry.leave(handle); send루프; sockets.delete`. message join 호출에 msg.presence 전달. handleOp 불변(AC-9). send루프 헬퍼 추출 선택적.
- **index.ts**: PresenceInfo/PresenceUpdateMsg/PresenceLeaveMsg re-export.
- **web protocol.ts**: 타입추가+parseServerMessage 2 case+default null 유지.
- **relayClient.ts**: handlers에 onPresenceUpdate?/onPresenceLeave? 추가, switch 분기, `createRelayClient(transport,pageId,handlers,opts?:{displayName?})` join이 presence payload 전송. 기존 4인자 호출 무변경.
- **usePresence.ts(신규)**: 순수 `applyPresenceUpdate(map,info)`/`applyPresenceLeave(map,clientId)` immutable + 훅 `usePresence()`→{presences(clientId 정렬 배열), onPresenceUpdate, onPresenceLeave}. useMemo로 Map→정렬배열. displayNameFromSiteId는 useCrdtDocument(siteId 소유)에 두고 opts로 주입.
- **useCrdtDocument.ts**: usePresence 호출, displayNameFromSiteId(doc.siteId)→opts.displayName, createRelayClient에 presence 핸들러 추가(op경로 불변), 반환에 presences 추가.
- **PresenceAvatars.tsx(신규)**: props {presences}. self포함 강조없음. 원형 색배지+이니셜, 전체이름 title/aria-label. 빈배열→빈컨테이너(BR-8). role/aria-label 접근성. presentational(props만)→render 단위테스트.
- **EditorContainer.tsx**: presences 구조분해, 상단에 `<PresenceAvatars presences={presences}/>`. op/title 경로 불변.

## 데이터 구조
```
PresenceInfo = {clientId,displayName,color}
PresenceMap  = Map<string,PresenceInfo>
PRESENCE_COLORS = ['#E57373','#64B5F6','#81C784','#FFD54F','#BA68C8','#4DB6AC','#FF8A65','#90A4AE']  // 07:531
RoomRegistry: presence Map<clientId,PresenceInfo>, colorSlots Map<pageId,Map<clientId,slot>>, anonCounter
색슬롯(AC-6): used=Set(roomSlotMap.values())→findIndex(i∉used) 0부터→없으면 size%8. leave시 delete→재사용.
```

## 영향/호환
- JoinMsg optional 필드 → P5 하위호환. **단 기존 room.test.ts join-ack `toHaveLength(1)` assert는 self presence-update 추가로 깨질 수 있음 → 완화 필요(명시).**
- leave void→Dispatch[]: server.ts 외 inMemoryRelay close()(reg.leave 반환무시 중)에 deliver 배선 추가 필요.
- createRelayClient 4번째 인자 optional → 기존 호출부 무변경.
- presence 모르는 구버전: parseServerMessage default null 무시. op 경로 완전 불변 → AC-9.

## 구현 순서 (RGR 단위)
1. [Must] ws-relay protocol.ts: JoinMsg 확장+Presence 타입+parseClientMessage presence 검증 (의존:없음) RED: protocol.test 확장.
2. [Must] ws-relay room.ts: presence 상태+색슬롯+assignColor+fallback+join Dispatch 확장 (의존:1) RED: room.presence.test AC-1/2/6/7/8 + 기존 join-ack assert 완화.
3. [Must] ws-relay room.ts: leave→Dispatch[](presence-leave+슬롯반환) (의존:2) RED: AC-3.
4. [Must] ws-relay index.ts barrel (의존:1).
5. [Must] ws-relay server.ts: close→leave Dispatch send + join presence 전달 (의존:3,4) server.test 유지.
6. [Must] web protocol.ts: Presence 타입+parseServerMessage 분기 (의존:없음) RED: protocol.test presence+null+proto.
7. [Must] web relayClient.ts: presence 핸들러+join payload (의존:6) RED: relayClient.test.
8. [Must] web usePresence.ts: 순수 reducer+훅 (의존:6) RED: usePresence.test AC-4/5. {1,4,6,8} 병렬 가능.
9. [Must] web PresenceAvatars.tsx+테스트 (의존:6) RED: AC-4/5 목록·color·self + BR-8 빈목록.
10. [Must] web useCrdtDocument.ts: usePresence 배선+displayNameFromSiteId+presences 반환 (의존:7,8).
11. [Must] web EditorContainer.tsx: PresenceAvatars 마운트 (의존:9,10).
12. [Must] web inMemoryRelay.ts: close() leave Dispatch deliver + presence.convergence.test (의존:3,5,7,8) RED: AC-1/2/3 2탭 수렴 + AC-9 op 불변.
병렬: {1,6} 선행분기. {4,8,9} 6 이후 병렬, {2} 1 이후. ws트랙(1→2→3→4→5)+web트랙(6→{7,8,9}) 12 합류.

## 미해결(architect 확인질문)
Q1 동일 displayName 다중탭 시각구분: (a)색상만(권장) (b)인덱스 suffix.
Q2 아바타 이니셜 표기: (a)siteId hex 첫글자 대문자(권장) (b)고정아이콘.
