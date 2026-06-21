## 코드 맵: P5 WebSocket relay walking skeleton (단일 op → ws 전송 → broadcast → 수신 탭 적용)

### 핵심 파일
- packages/crdt/src/wire.ts → wire 봉투 codec (toWire/fromWire). WireEnvelope{siteId,seq,opType,payload}. P5 ws 전송 직렬화 기반 (주석에 P5 소비자 가이드 명시)
- packages/crdt/src/index.ts → @ieum/crdt 공개 API (op makers, applyDocOp, docToBlocks, toWire/fromWire, 타입가드)
- packages/crdt/src/block.ts → 2-level 블록 RGA (createDocument/applyDocOp/docToBlocks). 수신 op 적용 대상
- apps/web/src/lib/editor/document.ts → 현재 에디터 도큐먼트 모델(EditorDoc=EditorBlock[], 순수 함수). CRDT op 미연결 — P5 와이어링 대상
- apps/web/app/(app)/page/[pageId]/page.tsx → 페이지 에디터 진입점. ws 클라이언트 연결 지점

### 참조 파일
- packages/crdt/src/op.ts → op 타입 가드 & makers (makeInsertOp 등)
- packages/crdt/src/types.ts → RgaId / AnyOp / WireEnvelope 타입
- requirements/06-api-and-realtime.md:255-430 → ws 프로토콜 규격 (join/join-ack, op C→S/S→C broadcast 발신자제외, op-ack)
- requirements/03-mvp-and-roadmap.md:163 → walking skeleton 골격: "Insert op 1개 → ws 전송 → 서버 브로드캐스트 → 수신 탭 적용"

### 설정
- package.json(root) + pnpm-workspace.yaml(apps/*, packages/*) + turbo.json(build/dev/lint/typecheck/test) → 신규 ws 서버는 apps/ws-relay 신규 패키지로 배치
- packages/crdt/package.json → @ieum/crdt (외부 의존성 0, vitest)
- apps/web/package.json → Next.js web app. vitest only, @testing-library/react ^16(renderHook 보유), Playwright 미설치. @/* → apps/web/*

### 설계 추가 탐색 (design phase)
- packages/crdt/src/block.ts:41 → EditorBlockView{id:RgaId,type,text} (docToBlocks 반환형, 에디터 렌더 타입)
- packages/crdt/src/block.ts:255/275 → localInlineInsert(doc,blockId,index,value)/localInlineDelete(doc,blockId,index) — diffBlockText 재사용 헬퍼(로컬 applyDocOp+op반환)
- packages/crdt/src/block.ts:104/143 → applyDocOp pendingInline 버퍼(블록 미도착 인라인 op 적체) — 구조편집 비활성화 근거
- apps/web/components/editor/Editor.tsx:71/130-163 → onInput textContent 통째 전달(IME 조합 미구분), handleKeyDown(Enter/Backspace) — diff+IME+구조편집 비활성 수정 대상
- apps/web/components/editor/EditorContainer.tsx:30-49 → blocks useState + no-op save(P5 연결지점) — useCrdtDocument 교체 대상
- apps/web/src/lib/ws.ts → connectPage(Spring Boot 8080 /ws/pages/ 가정, 미사용) — 삭제 대상
- apps/web/.env.local.example → NEXT_PUBLIC_WS_URL=ws://localhost:8080 → 3001 변경
- packages/crdt/tests/wire.test.ts, apps/web/src/lib/editor/__tests__/document.test.ts → 테스트 패턴 참조(AC 번호 명시)

### P5 walking skeleton 범위 메모
- 포함: ws 서버(room=pageId 기반), join/join-ack, op 메시지 relay broadcast(발신자 제외), op-ack(발신자), 클라이언트 송수신 와이어링(로컬 편집 → toWire 전송 / 수신 → applyDocOp)
- 제외(다음 슬라이스/P8): CrdtOp DB 영속화, sync-request/sync-response, snapshot 초기로드, 재접속 missing-op 재전송, presence/awareness(P6)
