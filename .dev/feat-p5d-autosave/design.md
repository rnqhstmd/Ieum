# 설계: P5 후반 자동저장 배선 (US-EDIT-02 — 제목)

## 설계 규모: 중형 (백엔드 1 엔드포인트 + 웹 훅/배선)

## 핵심 설계 결정

### D1. 백엔드 `GET /api/pages/{pageId}` (pageId-only)
- 신규 `PageDetailController`(별도 — PageController는 `/api/workspaces/{wsId}/pages` 클래스 prefix라 pageId-only 경로 불가).
```java
@GetMapping("/api/pages/{pageId}")
public PageDetailResponse get(@PathVariable UUID pageId) {
  UUID userId = currentUserService.requireCurrentUserId();
  accessGuard.requirePageAccess(userId, pageId); // 비멤버 403, 미존재 예외
  Page page = pageRepository.findById(pageId).orElseThrow(...);
  return new PageDetailResponse(page.getId(), page.getTitle(), page.getIcon(), page.getWorkspaceId());
}
public record PageDetailResponse(UUID id, String title, String icon, UUID workspaceId) {}
```
- 미인증은 SecurityConfig가 401(기존). 비멤버는 `requirePageAccess`가 403(ApiExceptionHandler 매핑).

### D2. 웹 `usePageTitle(pageId, initialTitle)` 훅 (테스트 격리 단위)
- EditorContainer는 useCrdtDocument(ws 연결) 의존이라 단위테스트가 무거우므로, 제목 로드/저장 로직을 순수 훅으로 분리해 api 모킹으로 검증한다.
```ts
function usePageTitle(pageId, initialTitle) {
  const [title, setTitle] = useState(initialTitle);
  const wsRef = useRef<string | null>(null);
  useEffect(() => { // 마운트 시 단일 페이지 GET → 초기 title·wsId 로드(AC-5)
    let active = true;
    apiGet<PageDetail>(`/api/pages/${pageId}`).then((p) => {
      if (!active) return; wsRef.current = p.workspaceId; setTitle(p.title);
    }).catch(() => {});
    return () => { active = false; };
  }, [pageId]);
  const saveTitle = useCallback(async (next: string) => { // save-port(AC-4)
    const ws = wsRef.current; if (!ws) return;
    await apiPatch(`/api/workspaces/${ws}/pages/${pageId}`, { title: next, icon: null });
  }, [pageId]);
  return { title, setTitle, saveTitle };
}
```
- `wsRef`(상태 아님): GET 응답 wsId 보관, 재렌더 불필요. GET 전 saveTitle은 no-op(ws 없음) — 초기 로드 전 입력 보호.

### D3. EditorContainer 배선
- `const { title, setTitle, saveTitle } = usePageTitle(pageId, initialTitle);`
- `const { status, notifyChange } = useAutosave(saveTitle, 500);` (기존 스텁 `save` 제거)
- `handleTitleChange(next) { setTitle(next); notifyChange(next); }` (기존 유지). 기존 SaveStatus UI 그대로(S1).

## 변경 범위
### 신규
- `backend/.../page/PageDetailController.java`
- `apps/web/src/lib/editor/usePageTitle.ts`
### 수정
- `apps/web/components/editor/EditorContainer.tsx`(스텁 save → usePageTitle)
### 테스트
- `backend/.../page/PageDetailIntegrationTest.java`(멤버 200·비멤버 403·미인증 401)
- `apps/web/src/lib/editor/__tests__/usePageTitle.test.ts`(GET 로드·PATCH 저장, api 모킹)

## 구현 순서 (RGR)
- **T1** 백엔드 `GET /api/pages/{pageId}` + 통합테스트. [AC-1,2,3]
- **T2** 웹 `usePageTitle`(GET 로드 + PATCH 저장) + EditorContainer 배선 + 단위테스트. [AC-4,5,6]

## 신뢰 경계
- 단일 GET은 `requirePageAccess`로 멤버십 강제(타 워크스페이스 page 조회 차단). 기존 PATCH도 동일 가드(member_updateTitle 테스트 존재).
- save-port는 GET 성공(wsId 확보) 후에만 PATCH — 초기 로드 전 입력은 영속 스킵(다음 변경 시 저장).

---

## Testability 평가 (test-architect)
### 컴포넌트별 전략
- **PageDetailController**: 기존 AbstractIntegrationTest(testcontainers) + oauth2Login — 멤버 200(jsonPath id/title/workspaceId)·비멤버 403·미인증 401. AC-1,2,3.
- **usePageTitle**: api 모듈(apiGet/apiPatch) 모킹 + renderHook. 마운트 GET→title 반영(AC-5), saveTitle→apiPatch 경로/바디 단언(AC-4). 순수 훅(ws 의존 없음).
- **EditorContainer**: 배선만(usePageTitle+useAutosave). 직접 단위테스트는 ws 의존으로 생략, 로직은 usePageTitle/useAutosave 단위가 커버. AC-6은 useAutosave 기존 테스트(saved 전이)가 보장.
### Testability Score: 8/10
### 판정
- ✅ **TESTABILITY PASS** — 핵심 로직(GET 로드·PATCH 저장)을 usePageTitle 순수 훅으로 분리해 api 모킹으로 격리. 백엔드는 기존 통합 harness. -2: EditorContainer 통합(ws+autosave+title)은 직접 단위테스트 비대상(구성요소 단위로 분할 검증).
