# 설계: op-batch 견고화 — loadByPage 실패 UX + join-epoch 재join 보호

## 설계 규모
**중형** — 신규 메시지 타입 1개(op-batch-error)를 relay·web 양쪽 protocol에 추가 + relay 전송 분기 재구성 + 소켓별 epoch + web 3레이어 관통 배선(relayClient→useCrdtDocument→EditorContainer). 변경 소스 6 + 테스트 4. 신규 파일 없음.

## 확정 결정 (review 반영)
- **retryRestore = ready 게이트 경유**(사용자 승인): `fetchAuth()`(토큰 재발급) 성공 후 `join(pageId)`. 만료 토큰 갱신 + 인증 실패 시 authError로 일관 처리(4001 churn 회피). #28 `fetchAuth` 재사용.
- **AC-13 단언**: Editor를 `vi.mock`(`data-testid="editor-surface"`) → restoreError 시 배너+editor-surface **공존** 단언(편집 미차단을 공존으로 환원). `baseResult`에 restoreError/retryRestore 보강.
- **배너 role**: `alert`(기존 authError 일관).
- **AC-5/6 결정성**: deferred store에 `firstCalled` 신호(loadByPage 첫 호출 시 resolve) → 테스트가 await 후 join2 전송. stale 미전송은 "둘째 op-batch 수신(positive 동기화) 후 첫째 미수신" 단언.
- **onOpBatch→restoreError 해제**: `setRestoreError(prev => prev ? false : prev)`(true일 때만 해제, 의도 명확·평상시 set 무발생).
- **epoch 불변식**: `++joinEpoch`는 반드시 socketChain 콜백 **동기 구간**(loadByPage 호출 직전)에 둔다 — 주석으로 명문화(후속 리팩터 회귀 방지).
- **presence 재broadcast 부작용 수용**: retryRestore=join 재호출이 self presence-update를 협업자에 재broadcast하나 멱등(clientId 갱신)이라 무해. request-restore 신설은 PRD 제외 → 수용·문서화.

## 변경 범위
- 수정(소스): `apps/ws-relay/src/protocol.ts`, `apps/ws-relay/src/server.ts`, `apps/web/src/lib/realtime/protocol.ts`, `apps/web/src/lib/realtime/relayClient.ts`, `apps/web/src/lib/editor/useCrdtDocument.ts`, `apps/web/components/editor/EditorContainer.tsx`.
- 수정(테스트): `apps/ws-relay/tests/server.test.ts`, `apps/web/src/lib/realtime/__tests__/relayClient.test.ts`, `apps/web/src/lib/editor/__tests__/useCrdtDocument.test.tsx`, `apps/web/components/editor/__tests__/EditorContainer.test.tsx`.
- 무변경: backend, `@ieum/crdt`.

## 상세 설계

### 1. relay protocol.ts — OpBatchErrorMsg
`OpBatchMsg` 아래 + `ServerToClient` 유니온 합류:
```ts
export interface OpBatchErrorMsg { type: 'op-batch-error'; pageId: string; }
// ServerToClient = ... | OpBatchMsg | OpBatchErrorMsg;
```

### 2. server.ts — epoch + sendIfCurrent + 성공/실패 분기
- 연결 클로저(connPage 옆)에 `let joinEpoch = 0;`.
- join 처리 socketChain 콜백 **동기 구간**(선등록 직후, loadByPage 직전)에 `const myEpoch = ++joinEpoch;` — **불변식 주석**.
- 전송 헬퍼(`sendAll` 인근, connection 콜백 클로저):
```ts
// 비동기 op-batch/op-batch-error 전송 가드: (1)epoch 일치(재join stale 격리 FR-8/BR-2) (2)OPEN.
const sendIfCurrent = (myEpoch: number, message: OpBatchMsg | OpBatchErrorMsg): void => {
  if (joinEpoch !== myEpoch) return;          // stale → 조용히 폐기(BR-2)
  const target = sockets.get(handle.id);
  if (target && target.readyState === WebSocket.OPEN) target.send(JSON.stringify(message));
};
```
- loadByPage 분기(현 149-157 교체):
```ts
const pageIdForBatch = joinMsg.pageId;
void opStore.loadByPage(pageIdForBatch)
  .then((ops) => sendIfCurrent(myEpoch, { type: 'op-batch', pageId: pageIdForBatch, ops }))     // 빈배열도 정상(FR-9)
  .catch(() => sendIfCurrent(myEpoch, { type: 'op-batch-error', pageId: pageIdForBatch }));      // 실패만 error(FR-1)
```
- import: `OpBatchMsg`, `OpBatchErrorMsg` type from `./protocol.js`.
- 회귀: 단일 join(재join 없음) 시 joinEpoch===myEpoch 항상 통과 → 기존 op-batch 경로 불변(AC-A1/A3/A4).

### 3. web protocol.ts — OpBatchErrorMsg + 파싱
`OpBatchMsg` 아래 인터페이스 + `ServerToClient` 확장 + `parseServerMessage` switch:
```ts
case 'op-batch-error':
  return typeof o.pageId === 'string' ? (o as unknown as OpBatchErrorMsg) : null;
```
최상단 `hasDangerousKey` proto 가드가 이미 적용.

### 4. relayClient.ts — onOpBatchError
```ts
// RelayClientHandlers:
onOpBatchError?(pageId: string): void;
// switch:
case 'op-batch-error': handlers.onOpBatchError?.(msg.pageId); break;
```
`join(page)` 함수·public 인터페이스 변경 없음.

### 5. useCrdtDocument.ts — restoreError + retryRestore (ready-gated)
- 인터페이스 `UseCrdtDocumentResult`: `restoreError: boolean;` + `retryRestore: () => void;`.
- state: `const [restoreError, setRestoreError] = useState(false);`
- 핸들러(createRelayClient handlers):
```ts
onOpBatch: (ops, batchPageId) => {
  if (batchPageId !== pageId) return;
  restoringRef.current = true;
  try { for (const env of ops) applyDocOp(doc, fromWire(env)); } finally { restoringRef.current = false; }
  setRestoreError((prev) => (prev ? false : prev)); // BR-4: true일 때만 해제
  bump();
},
onOpBatchError: (errPageId) => { if (errPageId === pageId) setRestoreError(true); }, // FR-5/AC-9
```
- retryRestore(useCallback): **ready 게이트 경유**:
```ts
const retryRestore = useCallback(() => {
  // fetchAuth로 토큰 재발급(만료 대비) 후 join 재전송 → 서버 loadByPage 재실행(FR-6/BR-3).
  // 인증 실패는 fetchAuth가 authError로 처리(catch는 join 미전송만 담당).
  fetchAuth().then(() => clientRef.current?.join(pageId)).catch(() => {});
}, [fetchAuth, pageId]);
```
- 반환 객체에 restoreError, retryRestore 추가.

### 6. EditorContainer.tsx — restoreError 배너
- 구조분해에 restoreError, retryRestore 추가.
- authError 배너 아래(편집 영역 위, 비차단):
```tsx
{restoreError && (
  <div role="alert" data-testid="restore-error" className="text-sm text-red-600">
    이전 편집 내용을 불러오지 못했습니다.{' '}
    <button type="button" onClick={retryRestore} className="underline">재시도</button>
  </div>
)}
```
`<Editor>`는 그대로 항상 렌더(BR-1/AC-13 — disabled/포인터차단 prop 미전달).

## 구현 순서 (RGR 응집 단위)
```
T1. relay protocol(OpBatchErrorMsg) + server.ts(epoch+sendIfCurrent+분기) + server.test AC-1~6   [relay 일괄]
T2. web protocol(파싱 AC-7) + relayClient(onOpBatchError AC-8)                                      [web 수신]
T3. useCrdtDocument(restoreError/retryRestore AC-9~11) + EditorContainer(배너 AC-12/13)             [web UI]
```
- T1(relay) ∥ T2(web 수신) 독립 가능. T3는 T2 의존. 각 T는 RED(테스트)→GREEN(구현)→REFACTOR.

## 영향도 / 하위호환
- op-batch 성공 경로 불변. epoch는 단일 join 시 항상 통과. #28 토큰/멤버십 게이트·op 경로 무영향.
- 구 클라(op-batch-error 모름)는 parseServerMessage default→null 무시(crash 없음). 구 relay(error 미발신) + 신 클라 → restoreError 진입 안 함. 양방향 안전.
- `UseCrdtDocumentResult` 확장 → EditorContainer.test `baseResult` 보강 필요(미보강 시 컴파일 에러).

## 확인이 필요한 사항
추가 확인 사항 없음. 설계가 완료되었습니다.

---

## Testability 평가 (test-architect)

### 컴포넌트별 테스트 전략
- **relay protocol.ts**: 타입 추가 → tsc 게이트. server.test 간접 커버.
- **server.ts (FR-1/9)**: opStore DI seam. AC-1(loadByPage throw→op-batch-error+op-batch 미전송), AC-2([]→op-batch{[]}), AC-3([ops]→회귀, 기존 AC-A1). 통합(실 ws + opStore 모킹).
- **server.ts epoch (FR-8)**: AC-4(deferred resolve→전송), AC-5(동일 ws join 2회+deferred→첫 stale 미전송), AC-6(deferred reject+재join→error 미전송). **결정성**: store가 호출순서별 deferred 반환 + `firstCalled` 신호로 join2 타이밍 동기화. 미전송은 "둘째 수신 후 첫째 미수신" positive 동기화.
- **web protocol.ts (FR-3)**: 순수 함수, 동기 결정적. AC-7.
- **relayClient.ts (FR-4)**: fakeTransport emitMessage 동기. AC-8(op-batch-error→onOpBatchError, onOpBatch 미호출).
- **useCrdtDocument.ts (FR-5/6)**: renderHook+transportFactory DI. AC-9(restoreError=true), AC-10(retryRestore→join 전송 — **fetchAuth 경유라 fetch 모킹+`await Promise.resolve()` flush**), AC-11(op-batch→restoreError=false).
- **EditorContainer.tsx (FR-7)**: vi.mock(useCrdtDocument)+baseResult. AC-12(배너+재시도 버튼), AC-13(**Editor vi.mock→editor-surface + 배너 공존**). baseResult에 restoreError:false/retryRestore:vi.fn().

### Testability Score: 8/10
- web 4레이어 DI+동기 emit으로 완전 결정적(선례 다수). relay opStore DI seam 견고.
- 감점: AC-5/6 deferred+재join 결정성(firstCalled 신호로 해소), AC-13 단언 방식(Editor mock으로 확정), 미전송 부정단언 한계(positive 동기화로 완화).

### 판정
**PASS (8 ≥ 7)** → RGR 진입 가능. red 진입 전 보강(테스트 명세): firstCalled 신호, 공존 단언, fetch flush — 모두 위에 반영.
