# 설계 초안 (architect) — P11

> 이 파일은 architect 1차 초안. 확정본은 design.md. design-critic/test-architect 입력용.

## 설계 규모: 대형
3그룹 단일 슬라이스. ws-relay(protocol/room/server/opStore/pgOpStore)·web(protocol/relayClient/useCrdtDocument/crdtDocument/Editor)·packages/crdt(무변경)·신규 e2e. backend 무변경.

## 변경 범위
**ws-relay**: protocol.ts[수정 OpBatchMsg], opStore.ts[수정 loadByPage 포트+InMemory], pgOpStore.ts[수정 loadByPage SELECT serverSeq ASC], room.ts[수정 join op-batch Dispatch], server.ts[수정 join 체인: 등록→loadByPage→op-batch 송신].
**web**: protocol.ts[수정 OpBatchMsg+parse], relayClient.ts[수정 onOpBatch], crdtDocument.ts[수정 computeSplitOps/computeMergeOps/computeSetTypeOp/detectBlockTypeShortcut 순수함수], useCrdtDocument.ts[수정 replay restoring+pendingLiveOps drain, onStructuralEdit/onEnter/onBackspace/onSetType 콜백], Editor.tsx[수정 handleKeyDown 배선+단축키+DOM offset], EditorContainer.tsx[수정 콜백 prop].
**e2e 신규**: apps/web/playwright.config.ts, e2e/convergence.e2e.ts(AC-C1), e2e/restore.e2e.ts(AC-C2/C3), e2e/README.md, package.json[e2e 스크립트+@playwright/test].
**packages/crdt·backend**: 변경 없음.

## 결정 1 — op-batch 메시지 계약
- ws-relay protocol.ts: `OpBatchMsg{type:'op-batch', pageId, ops:WireEnvelope[]}`(serverSeq ASC), ServerToClient 유니온 합류. 서버→클라 전용.
- web protocol.ts: 동일 + parseServerMessage case(pageId string, ops 배열, 각 항목 isWireEnvelope). ops 항목은 OpMsg.op와 동일 wire 봉투 → 클라가 fromWire→applyDocOp.

## 결정 2 — OpStore.loadByPage(pageId): WireEnvelope[] (serverSeq ASC)
- 포트에 추가. InMemoryOpStore: pageId별 opsByPage Map(persisted만 push, duplicate 미축적, append 순서=serverSeq). PgOpStore: `SELECT site_id,seq,op_type,payload FROM crdt_ops WHERE page_id=$1 ORDER BY server_seq ASC` → WireEnvelope 재조립(payload jsonb 자동 파싱, op_type 소문자 그대로=V3 정합, backend enum 미경유). isUuid 가드.

## 결정 3 — join op-batch 송신 + 유실방지(BR-2)
- 불변식: 신규 소켓을 broadcast에 **먼저 등록**(registry.join) → op-batch fetch(async) → op-batch 송신. fetch 중 도착 실시간 op는 broadcast로 신규 소켓에도 전달(유실 없음), op-batch와 겹치면 멱등(AC-A5), batch 전 도착 시 클라 restoring 플래그로 보류(AC-A3).
- room.ts join(client, pageId, presence?, ops?): Dispatch[0]=join-ack(불변), [1]=op-batch(ops 주어질 때만, 없으면 생략=하위호환), 이후 presence. server.ts: registry.join 먼저 sendAll → opStore.loadByPage(try/catch 빈배열) → op-batch sendAll. 소켓별 socketChain FIFO 유지.

## 결정 4 — 클라 replay(useCrdtDocument)+GENESIS
- relayClient onOpBatch 핸들러. useCrdtDocument: restoringRef + pendingLiveOps. onRemoteOp: restoring이면 push, 아니면 applyDocOp. onOpBatch: restoring=true→ops 순차 applyDocOp(멱등)→restoring=false→pendingLiveOps drain→bump.
- GENESIS 정합: createCollaborativeDocument 무변경. 모든 탭 로컬 genesis{0,'genesis'} 생성+op-batch replay 멱등 공존. 빈문서=genesis 유지(AC-A4). 구조편집 생성 블록은 block-insert로 복원.

## 결정 5 — 구조편집 순수함수 분리
- crdtDocument.ts: computeSplitOps(doc,blockId,cursorIndex)=splitBlock 위임, computeMergeOps(doc,blockId)=mergeBlockWithPrev(null이면 무동작), computeSetTypeOp(doc,blockId,type)=setBlockType, detectBlockTypeShortcut(text)→{type,consumed}|null('# '→h1,'## '→h2,'### '→h3,'- '→bullet).
- useCrdtDocument: onStructuralEdit/onEnter/onBackspace/onSetType 콜백, sendOps 헬퍼(seqRef++, toWire, client null 가드).
- Editor.tsx: handleKeyDown Enter→getCaretOffset→onEnter(blockId,offset), Backspace offset0→onBackspace(blockId). handleInput에서 detectBlockTypeShortcut→onSetType+prefix 제거. DOM커서→offset은 Editor(getCaretOffset 재사용).

## 결정 6 — e2e Playwright(apps/web, 로컬 수동)
- playwright.config.ts: testDir ./e2e, testMatch *.e2e.ts(vitest와 분리), baseURL env, webServer 미설정(로컬 수동). chromium.
- convergence.e2e.ts: 2 BrowserContext, 양쪽 입력→relay 교환 대기→[data-block-id] 동일. restore.e2e.ts: A 입력→B 신규접속→B에 표시. package.json e2e 스크립트+@playwright/test. README 구동순서(DB→relay→web→e2e). 위험: (app) 인증 의존, UUID pageId 시드.

## 구현 순서(RGR→AC)
A: 1.loadByPage 포트+InMemory(AC-A1부분/A4) 2.PgOpStore.loadByPage int(AC-A1/BR-1) 3.ws protocol OpBatchMsg(AC-A2) 4.room.join op-batch(AC-A2) 5.server 체인+fake store 보강(AC-A1/BR-2) 6.web protocol(AC-A2) 7.relayClient onOpBatch(AC-A2) 8.useCrdtDocument replay(AC-A2/A3/A4/A5).
B(A와 병렬): 9.crdtDocument 순수함수(AC-B5/B6) 10.useCrdtDocument onStructuralEdit(B1/B2/B3 전송) 11.Editor handleKeyDown+단축키(B1/B2/B3/B4) 12.EditorContainer prop. (B3 genesis무동작/B5/B6동시분할은 crdt 단위 기커버)
C(배선 후): 13.Playwright 설치+config 14.convergence.e2e(AC-C1) 15.restore.e2e(AC-C2/C3) 16.README.
병렬: {1,3,6,9} 의존없음. A(1→2→5)∥B(9). e2e는 8,12 후.

## 위험
1. op-batch 크기 vs maxPayload(64KiB 수신한도, 송신 미적용) — 대형문서 청크분할 후속(Snapshot 슬라이스).
2. GENESIS 공존 가정 — merge로 genesis 삭제 후 복원 시 멱등 삭제 수렴(테스트 필요).
3. fetch 실패→빈 batch(재join 복구).
4. e2e 인증 의존((app) 그룹).
5. FR-B6 커서 복원 contenteditable 단방향 충돌.

## 확인 필요(architect 제기 4건)
1. e2e 인증 처리: (a)storageState 사전주입[권장] (b)UI 로그인 (c)인증우회 환경변수
2. FR-B6 커서 복원 범위: (a)수렴까지만 best-effort[권장] (b)정밀 커서복원
3. 마크다운 prefix 처리: (a)prefix 제거+set-type[권장] (b)prefix 유지
4. 구조편집 콜백 형태: (a)개별 평면 콜백 onEnter/onBackspace/onSetType[권장] (b)단일 객체
