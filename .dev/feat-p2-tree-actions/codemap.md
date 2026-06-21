## 코드 맵: P2 잔여 — 페이지 이름변경·아이콘·아카이브

### 핵심 파일 (수정)
- backend/src/main/java/com/ieum/page/PageService.java:99,117 → updatePage/archivePage **스텁(UnsupportedOperationException)** → 구현 대상
- apps/web/src/lib/api.ts → apiGet/Post/Put/Delete. **apiPatch 없음** → 추가 필요(백엔드가 PATCH 사용)
- apps/web/src/lib/pages.ts → getPageTree/createPage. updatePage/archivePage 추가
- apps/web/src/lib/types.ts → Page/CreatePageInput. UpdatePageInput 추가
- apps/web/components/sidebar/PageTreeNode.tsx → 행 액션(이름변경 인라인·아이콘·아카이브) 추가
- apps/web/components/sidebar/PageTree.tsx → onRename/onSetIcon/onArchive 콜백 전달
- apps/web/components/sidebar/Sidebar.tsx → handleRename/handleSetIcon/handleArchive(confirm) + loadTree 재조회

### 참조 파일
- backend/.../page/PageController.java → PATCH /{pageId}(updatePage), DELETE /{pageId}(archivePage) 라우트 (이미 배선됨)
- backend/.../page/dto/UpdatePageRequest.java → record {title, icon}
- backend/.../page/Page.java → archivedAt 필드 존재(soft delete), icon nullable
- backend/.../page/PageRepository.java → findByWorkspaceIdAndArchivedAtIsNull(wsId) (재귀 아카이브용 활성목록)
- backend/.../common/security/AccessGuard.java → requireWorkspaceMember(userId,wsId)→AccessDenied(403)
- backend/.../common/ApiExceptionHandler.java → AccessDenied→403, EntityNotFound→404, IllegalArgument→400
- backend/.../page/PageServiceTest.java → Mockito 단위 테스트 컨벤션(@Mock repo/guard, ArgumentCaptor)
- backend/.../page/PageIntegrationTest.java → Testcontainers + oauth2Login(asUser) + MockMvc, BeforeEach DB clean
- apps/web/components/sidebar/__tests__/{Sidebar,PageTree}.test.tsx → vitest+RTL, vi.mock, page()/ws() 팩토리

### 설정
- apps/web vitest + jsdom, backend gradle test(Testcontainers)
- 예외 매핑: AccessDenied 403 / EntityNotFound 404 / IllegalArgument 400

### 결정 메모
- updatePage 부분갱신: null 필드=변경없음(rename은 icon 보존, set-icon은 title 보존). blank title(비null)=400. icon clear는 범위 밖.
- archivePage 재귀: 대상+모든 후손 archivedAt 설정(soft delete). 활성목록으로 child map BFS.
- 프론트 archive는 Sidebar에서 window.confirm 후 호출(파괴적·재귀이므로).
