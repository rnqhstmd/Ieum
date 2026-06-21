## 코드 맵: P6 라이브 커서 (US-PRES-02)

### 핵심 파일 (커서가 확장/추가)
- packages/crdt/src/rga.ts:144 → `getVisibleNodes<V>(rga): RgaNode[]` (가시 노드 순서, 공개). index↔anchorId 변환 기반. tombstone 인식 resolve는 전체 노드 순회(RgaNode.next 링크드리스트) 필요 — 신규 helper 후보.
- packages/crdt/src/block.ts:31 → `DocState.inlineRgas: Map<idKey, RgaState<string>>` (공개). 블록별 인라인 RGA 접근. docToBlocks(:163).
- packages/crdt/src/types.ts → RgaNode{id,deleted,next}, RgaId. id.ts → idEquals/idKey/compareIds.
- apps/web/src/lib/editor/crdtDocument.ts → diffBlockText 등. **anchorId↔index 변환 함수(indexToAnchorId·resolveAnchorToIndex tombstone fallback) 추가 지점** (또는 crdt에 신규 export).
- apps/ws-relay/src/protocol.ts + apps/web/src/lib/realtime/protocol.ts → presence-update에 cursor 확장 vs 신규 `cursor-update` 메시지(설계 결정). proto 가드 동일 적용.
- apps/ws-relay/src/room.ts → PresenceInfo에 cursor(blockId,anchorId) 저장 또는 cursor 별도 비영속 중계.
- apps/web/src/lib/realtime/relayClient.ts → cursor 송수신 핸들러(onCursorUpdate 등).
- apps/web/src/lib/realtime/usePresence.ts → presence 맵에 cursor 좌표 저장.
- apps/web/components/editor/Editor.tsx → DOM selection→caret offset→anchorId 계산(debounce 50ms 전송) + 원격 커서 오버레이 렌더(색상+이름 레이블).
- apps/web/src/lib/editor/useCrdtDocument.ts → cursor 송신 배선(debounce) + 원격 cursor 상태 노출.

### 참조 파일
- apps/web/components/editor/PresenceAvatars.tsx → 색상·displayName 출처(커서 레이블이 동일 PresenceInfo 색상 재사용).
- apps/web/src/lib/realtime/__tests__/{inMemoryRelay.ts, fakeTransport.ts, presence.convergence.test.ts} → 커서 수렴/앵커유지/tombstone 통합 테스트 하네스 재사용.
- packages/crdt/src/__tests__ (있으면) → anchor 변환 순수 단위 테스트 위치.
- requirements/07-collaboration-crdt.md → presence 커서(anchorId, debounce 50ms, resolveAnchorToIndex fallback) 정본.
- context/collaboration/{glossary.md(커서 앵커 anchorId), architecture.md(Presence 흐름 커서 부분)}.

### 설정
- packages/crdt vitest, apps/web vitest(jsdom).
- 브랜치 전략: feat/p6-cursor는 feat/p6-presence(PR #11, 미머지) 위에 적층. PR base=feat/p6-presence.
