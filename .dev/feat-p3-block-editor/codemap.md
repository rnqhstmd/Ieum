## 코드 맵: P3 블록 에디터 (US-EDIT-01~03)

### 핵심 파일 (이번 phase에서 생성/수정)
- apps/web/components/editor/ → **빈 디렉토리(.gitkeep만)**. 블록 에디터 컴포넌트 신규 생성 위치.
- apps/web/app/(app)/page/[pageId]/page.tsx:1 → 페이지 상세 라우트. 현재 TODO 플레이스홀더("[에디터 — Phase 2]"). 에디터 통합 대상.
- packages/crdt/src/rga.ts:89 → `localInsert`/`localDelete`(:110)/`toText`(:125)/`applyOp`(:48)/`createRga`(:18) — 인라인 문자 RGA(P4 완료). 블록 내부 텍스트 모델 후보.

### 참조 파일
- packages/crdt/src/index.ts → 공개 API. 블록 op 메이커(makeBlockInsertOp/Delete/SetType)·BlockType·BlockMeta 타입 export됨(리듀서는 P4b 미구현).
- packages/crdt/src/types.ts:65 → `BlockType`(paragraph/heading1~3/bullet 등)·`BlockMeta`(:73) 정의.
- apps/web/components/sidebar/PageTree.tsx → 기존 트리 UI. 에디터 네비게이션 onNavigate(pageId) 연동 지점.
- apps/web/src/lib/pages.ts → 페이지 API 클라이언트(getPageTree/createPage/updatePage/archivePage). 페이지 메타 조회 추가 후보.
- apps/web/src/lib/types.ts → Page 타입. 블록/콘텐츠 타입 추가 후보.
- backend/src/main/java/com/ieum/page/Page.java:1 → Page 엔티티. **content 필드 없음**(콘텐츠는 CrdtOp/Snapshot=P5 소관).
- backend/src/main/java/com/ieum/page/PageController.java:18 → `/api/workspaces/{wsId}/pages` (GET/POST/PATCH/move/DELETE). 콘텐츠 엔드포인트 없음.

### 설정
- context/page/architecture.md:37 → "블록 기반 contenteditable 에디터" 절: 외부 라이브러리 없음, paragraph/heading1~3/bullet, Enter 새블록·Backspace 빈블록 삭제, RGA 상태가 진실 원천(2-level 블록 RGA), 모듈 위치 apps/web/components/editor/.
- context/page/status.md:36 → US-EDIT-01~03 (P3, ⬜), US-EDIT(CRDT) (P4).
