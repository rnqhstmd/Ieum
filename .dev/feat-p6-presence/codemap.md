## 코드 맵: P6 Presence (접속자 아바타 + 라이브 커서)

### 핵심 파일 (presence가 확장/추가)
- apps/ws-relay/src/room.ts:18 → RoomRegistry. rooms(pageId→Set<ClientHandle>), clientRoom(id→pageId), join/handleOp/leave/roomSize 보유. presence 참여/이탈/브로드캐스트의 substrate. ClientHandle은 현재 {id}만 — presence 신원(name/color) 부착 지점.
- apps/ws-relay/src/protocol.ts:8 → 메시지 계약(Join/JoinAck/Op/OpAck) + parseClientMessage + proto 가드. presence 메시지 타입(presence-join/leave/update) 추가 지점.
- apps/ws-relay/src/server.ts:38 → ws 어댑터. connection/message/close 배선. close→registry.leave에 presence-leave 브로드캐스트 추가 지점.
- apps/web/src/lib/realtime/relayClient.ts:21 → createRelayClient. onMessage 라우팅 + onOpen→join. presence 송수신 핸들러 추가 지점.
- apps/web/src/lib/realtime/protocol.ts → parseServerMessage(클라) + isWireEnvelope + proto 가드. presence 메시지 파싱 추가.
- apps/web/src/lib/editor/useCrdtDocument.ts → relay 배선 훅(DocState 진실 원천). presence 상태는 별도 usePresence 훅 후보.
- apps/web/components/editor/EditorContainer.tsx → 에디터 컨테이너. presence 아바타 목록 UI 마운트 지점.

### 참조 파일
- apps/web/src/lib/realtime/transport.ts → Transport 추상화(send/onMessage/onOpen/onClose/close) + createRetryingTransport.
- apps/web/src/lib/realtime/__tests__/inMemoryRelay.ts → 실 RoomRegistry+FakeTransport 통합 하네스. presence 2탭 통합 검증에 재사용.
- apps/web/src/lib/realtime/__tests__/fakeTransport.ts → FakeTransport(onOpen/onClose emit 포함).
- apps/ws-relay/src/index.ts → barrel export(RoomRegistry+protocol, server.ts 제외).
- requirements/06-api-and-realtime.md → WebSocket presence 프로토콜 규격.
- requirements/07-collaboration-crdt.md → US-PRES 수용 기준 + 커서 앵커(anchorId).

### 설정
- apps/ws-relay/package.json (vitest), apps/web vitest 설정.
- context/collaboration/{glossary,architecture,status}.md → presence 흐름·용어 정본.
