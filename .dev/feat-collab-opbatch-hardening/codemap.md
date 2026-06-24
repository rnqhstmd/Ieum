## 코드 맵: 협업 op-batch 견고화 — loadByPage 실패 UX(op-batch-error) + W2 join-epoch

### 핵심 파일
- `apps/ws-relay/src/server.ts:144-166` → join 핸들러의 op-batch fire-and-forget. `opStore.loadByPage(pageId).catch(→console.warn+빈배치).then(send op-batch)`. **(A) loadByPage 실패 시 빈배치 무음 전송** → op-batch-error 전송으로 교체. **(B) join epoch 미부착** → 재join 시 in-flight 배치가 stale로 도착 가능 → epoch 부착·검사.
- `apps/ws-relay/src/protocol.ts` → 서버→클라 메시지 타입(op-batch 등). op-batch-error 메시지 타입 추가 지점.
- `apps/web/src/lib/realtime/protocol.ts` → 클라 측 메시지 파서(parseServerMessage). op-batch-error 파싱 추가 지점.
- `apps/web/src/lib/realtime/relayClient.ts:21-22,54-84` → `onOpBatch?` 핸들러 인터페이스 + switch 라우팅. `onOpBatchError?(pageId)` 추가 지점.
- `apps/web/src/lib/editor/useCrdtDocument.ts:120-129` → `onOpBatch`(restoringRef try/finally replay). `onOpBatchError` → restoreError 상태(set) 추가 지점. 인터페이스 UseCrdtDocumentResult에 restoreError 노출.

### 참조 파일
- `apps/web/components/editor/EditorContainer.tsx:27-50` → authError 배너 패턴(restoreError 비차단 배너·재시도 동일 패턴 재사용 후보).
- `apps/ws-relay/src/opStore.ts` / `pgOpStore.ts` → loadByPage(serverSeq ASC). 실패 경로(throw)가 server.ts catch로 흘러옴.
- `apps/ws-relay/tests/server.test.ts` → op-batch 테스트(AC-A*), recordingStore mock(loadByPage 포함). op-batch-error·epoch 테스트 추가.
- `apps/web/src/lib/editor/__tests__/useCrdtDocument.test.tsx` → op-batch 수신 테스트(AC-A2~). op-batch-error 수신 테스트 추가.
- `apps/web/src/lib/realtime/__tests__/relayClient.test.ts` → relayClient 라우팅 테스트.

### 설정
- base = `feat/ws-auth-identity`(#28, 미머지) 위 스택. #28 머지 후 이 PR 머지.
- 명령: `pnpm test`(turbo crdt+ws-relay+web) · `pnpm build` · `(cd apps/ws-relay && pnpm test)`.

### 비고
- 슬라이스 = (A) loadByPage 실패 UX + (B) W2 op-batch join-epoch 견고화. 둘 다 relay(server.ts)+web(protocol/relayClient/useCrdtDocument) 응집.
- 나머지 하드닝(Snapshot+delta, splitBlock 원자성, e2e CI, FR-B6 커서)은 후속 슬라이스.
