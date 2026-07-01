## 코드 맵: usePageTitle 아이콘 null 덮어쓰기 버그 수정

### 핵심 파일
- apps/web/src/lib/editor/usePageTitle.ts:52 → saveTitle이 PATCH 본문에 `icon: null` 하드코딩(버그 지점). 제목 자동저장 save-port.
- apps/web/src/lib/editor/__tests__/usePageTitle.test.ts:33 → 현재 `icon: null` 전송을 단언(버그를 인코딩한 테스트 — RED에서 교정 대상).

### 참조 파일
- backend/src/main/java/com/ieum/page/PageService.java:117-126 → updatePage 부분갱신 계약(null=변경안함, ''=제거). 백엔드는 정상 → 수정 불필요.
- backend/src/main/java/com/ieum/page/dto/UpdatePageRequest.java → record(title, icon) 둘 다 nullable. 누락 필드는 Jackson이 null로 역직렬화.
- apps/web/components/editor/EditorContainer.tsx:32,98 → usePageTitle 사용처. 헤더 icon 미배선(📄 하드코딩) — 이 버그가 실배선 차단.
- apps/web/components/sidebar/PageTreeNode.tsx:75 → IconPicker 제거는 `onSetIcon(id, '')`(빈문자열) — null 아님. null/'' 의미 분리 확인.
- apps/web/src/lib/pages.ts:17-25 → updatePage(부분 input 그대로 PATCH).

### 설정
- .claude/config.json → node projectType: build=`npm run build`, test=`npm test`. 실제 러너는 pnpm workspace + vitest.
