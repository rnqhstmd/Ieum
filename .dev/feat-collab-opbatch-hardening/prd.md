# PRD: op-batch 견고화 — loadByPage 실패 UX + join-epoch 재join 보호

## 배경
재접속 복원에서 relay가 `opStore.loadByPage`로 op 이력을 읽어 `op-batch`로 클라에 전달한다. 두 결함:
- **A. loadByPage 실패 무음**: 실패 시 `console.warn` 후 빈 배열 반환 → 빈 `op-batch` 전송 → 클라가 복원 실패를 모른 채 빈 문서로 오인(데이터 손실 오인). (server.ts:149-157)
- **B. 재join stale 배치**: op-batch 전송이 socketChain 밖 fire-and-forget. 동일 소켓 재join 시 직전 join의 loadByPage가 늦게 resolve → stale op-batch/op-batch-error가 새 세션에 도착. (server.ts:148-157)
web은 `op-batch-error`를 모르고 `restoreError`/재시도 경로가 없다.

## 목표
- 복원 실패를 인지·재시도(데이터 손실 오인 제거). 재join 시 이전 in-flight 결과 격리. 복원 실패해도 로컬 편집 무중단.

## 요구사항

### 기능 (Must)
- FR-1(A): loadByPage 실패 시 빈 op-batch 대신 `op-batch-error` 전송.
- FR-2(A): relay protocol.ts에 `OpBatchErrorMsg{type:'op-batch-error',pageId}` + ServerToClient 유니온 포함.
- FR-3(A): web protocol.ts에 OpBatchErrorMsg + `parseServerMessage`가 op-batch-error 파싱.
- FR-4(A): relayClient `RelayClientHandlers.onOpBatchError?(pageId)` + switch 라우팅.
- FR-5(A): useCrdtDocument onOpBatchError → `restoreError=true`. `UseCrdtDocumentResult`에 `restoreError:boolean`+`retryRestore:()=>void`.
- FR-6(A): `retryRestore`=`clientRef.current?.join(pageId)`(서버 loadByPage 재실행). 성공(onOpBatch) 시 restoreError=false.
- FR-7(A): EditorContainer가 restoreError 시 비차단 배너(안내+재시도 버튼→retryRestore). 편집 미차단.
- FR-8(B): join마다 소켓별 epoch(정수) 증가. 비동기 op-batch/op-batch-error 전송 직전 현재 epoch==해당 join epoch 확인, 불일치 시 전송 생략.

### 기능 (Should)
- FR-9(A): loadByPage 결과 빈 배열(ops.length===0)은 에러 아닌 정상 op-batch(빈 배치). 빈 이력≠조회 실패 구분.

### 비즈니스 규칙
- BR-1(Must): 복원 실패해도 로컬 DocState 유지·편집 미차단.
- BR-2(Must): epoch 불일치 생략은 로그·표시 없이 조용히 폐기(정상 재join).
- BR-3(Must): retryRestore=join 재전송 → 새 join 흐름 전체 재실행.
- BR-4(Should): 재시도 성공(onOpBatch) 시 restoreError 즉시 false.

## 수용 기준

### relay — FR-1, FR-2
AC-1: loadByPage 실패 → op-batch-error 전송
  Given: opStore.loadByPage가 throw하도록 모킹된 환경에서 클라가 join을 전송.
  When: join 처리 중 loadByPage 비동기 경로 실행.
  Then: 클라 소켓 수신 메시지가 `{type:'op-batch-error', pageId:<joinMsg.pageId>}` 이고 `{type:'op-batch',ops:[]}`는 전송되지 않는다.

AC-2: loadByPage 빈 배열 → op-batch 정상
  Given: loadByPage가 `[]` resolve 모킹.
  When: 클라가 join 전송.
  Then: 수신이 `{type:'op-batch',pageId,ops:[]}` 이고 op-batch-error는 미전송.

AC-3: loadByPage 성공(op 포함) → 회귀 없음
  Given: loadByPage가 1건 이상 WireEnvelope 배열 resolve 모킹.
  When: 클라가 join 전송.
  Then: 수신이 `{type:'op-batch',ops:<배열>}` 이고 ops 길이가 반환값과 동일.

### relay — FR-8
AC-4: 재join 없음 → 정상 전송(epoch 일치)
  Given: loadByPage가 deferred promise 반환 모킹, 클라가 join 1회 전송.
  When: deferred resolve.
  Then: epoch 일치 → op-batch(또는 error)가 전송된다.

AC-5: 재join 시 stale op-batch 미전송(epoch 불일치)
  Given: loadByPage deferred 모킹, join 전송(epoch=1) 후 resolve 전 동일 소켓 재join(epoch=2).
  When: 첫 join의 deferred resolve.
  Then: epoch 불일치(1≠2)로 첫 join op-batch 미전송. 두 번째 join op-batch만 전송.

AC-6: 재join 시 stale op-batch-error 미전송
  Given: loadByPage deferred가 reject되도록 모킹 + 재join(epoch=2).
  When: 첫 join deferred reject.
  Then: epoch 불일치로 op-batch-error 미전송.

### web — FR-3
AC-7: op-batch-error 파싱
  Given: parseServerMessage에 `{type:'op-batch-error',pageId:'p1'}` JSON 입력.
  When: 실행.
  Then: 반환이 `{type:'op-batch-error',pageId:'p1'}`(null 아님).

### web — FR-4
AC-8: op-batch-error 라우팅 → onOpBatchError
  Given: relayClient 생성 + onOpBatchError 등록.
  When: transport가 `{type:'op-batch-error',pageId:'p1'}` emit.
  Then: onOpBatchError가 'p1'로 1회 호출. onOpBatch 미호출.

### web — FR-5, FR-6, BR-4
AC-9: op-batch-error 수신 → restoreError=true
  Given: useCrdtDocument 렌더 + transport mock으로 op-batch-error emit.
  When: 처리.
  Then: `restoreError===true`.

AC-10: retryRestore → join 재전송
  Given: restoreError===true에서 retryRestore() 호출.
  When: 실행.
  Then: transport mock에 `{type:'join',pageId:<pageId>}` 전송.

AC-11: 재시도 성공(op-batch) → restoreError=false
  Given: restoreError===true에서 retryRestore() 후 transport mock이 op-batch emit.
  When: op-batch 처리.
  Then: `restoreError===false`.

### web — FR-7, BR-1
AC-12: restoreError 배너 렌더
  Given: useCrdtDocument restoreError===true가 EditorContainer에 전달.
  When: 렌더.
  Then: `data-testid="restore-error"` 배너 요소가 DOM에 존재 + 재시도 버튼 포함.

AC-13: restoreError 시 편집 차단 없음
  Given: restoreError===true에서 에디터 렌더.
  When: 배너 표시.
  Then: Editor 컴포넌트가 DOM에 존재 + disabled/포인터 차단 미적용.

## 제외 범위
- request-restore 메시지 신설(재시도는 join 재호출 최소구현) · Snapshot+delta · splitBlock 원자성 · e2e CI · FR-B6 커서 · backend/packages/crdt 무변경.

## G-W-T 게이트
PASS — AC-1~13 모두 G/W/T 3절 + 검증 가능한 구체 Then. relay(AC-1~6)·web(AC-7~13) 구분.
