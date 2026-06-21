# Cross-Review 결과

- advisor: claude (메인 오케스트레이터 직접 — 서브에이전트 idle-실패 + codex 402로 폴백)
- 브랜치: feat/p2-pages (base: main)
- DEV_DIR: .dev/feat-p2-pages
- 실행: 2026-06-18
- 주의: 구현자 = 검증자(독립성 제한). trust-ledger를 의심하고 적대적으로 재검증함.

## AC 충족 매트릭스

| AC | 충족 | 근거 |
|----|------|------|
| AC-1 최상위 생성 | O | PageService.createPage + PageServiceTest.createPage_topLevel_savesPage (saved/DTO 필드 단언) |
| AC-2 하위 생성 | O | createPage_child_savesWithParent (parentPageId 단언) |
| AC-3 타 WS 부모 거부 | O | createPage_parentInOtherWorkspace_throws (400 + never save) |
| AC-4 비멤버 생성 403 | O | createPage_nonMember_throws (AccessDeniedException) |
| AC-5 트리 조립 | O | getPageTree_buildsParentChild + PageIntegrationTest |
| AC-6 아카이브 제외 | O | PageIntegrationTest.getTree_excludesArchived (실 DB) |
| AC-7 빈 워크스페이스 | O | getPageTree_empty_returnsEmpty |
| AC-8 position 오름차순 | O(부분) | getPageTree_sortsByPositionAsc — **상이 position만 검증, 동률 미정의(신규위험 W1 참조)** |
| AC-9 비멤버 조회 403 | O | getPageTree_nonMember_throws + IT |
| AC-10 워크스페이스 목록 | O(부분) | listMyWorkspaces_returnsWorkspacesFromMemberships — **mock 기반, 타 WS 제외 실 DB 미검증(I3)** |
| AC-11 멤버십 0건 | O | listMyWorkspaces_noMemberships_returnsEmpty |
| AC-12 미인증 401 | O | PageIntegrationTest.unauthenticated_getPages_returns401 |
| AC-13 빈 제목 거부 | O(부분) | createPage_blankTitle_throws — **공백만 검증, null title 분기 미테스트(I2)** |

[Must] 6/6 충족, [Should] 1/1 충족. 13건 모두 구현·통과되나 3건은 테스트 커버리지에 공백 존재(부분).

## 설계 범위 이탈

이탈 없음. 변경 4파일(PageService/PageController/WorkspaceService/WorkspaceController) + 테스트 3파일 모두 설계 "변경 범위" 내. 신규 클래스 0, 마이그레이션 0. PageController 전 핸들러 배선은 설계가 명시("PageController 전 핸들러")한 범위.

## 신규 위험

(trust-ledger에 없는 항목만)

### Warning
- [RISK] 동일 position 타이브레이크 미정의 — PageService.getPageTree / PageRepository.findByWorkspaceIdAndArchivedAtIsNull
  - 근거: `buildSubtree`는 `Comparator.comparingInt(Page::getPosition)`만 사용(2차 정렬키 없음). `Stream.sorted`는 안정정렬이지만 입력 순서가 곧 리포지토리 반환 순서이고, 쿼리에 `ORDER BY`가 없어 **DB 반환 순서가 비결정적**이다. 같은 부모·같은 position 형제의 표시 순서가 실행마다 달라질 수 있다. D1(클라이언트 position 그대로 저장)에서 클라이언트가 position=0 같은 중복값을 보낼 수 있어 현실적 위험.
  - 권고: 리포지토리 쿼리에 `OrderByPositionAscCreatedAtAsc` 또는 `buildSubtree` 비교자에 2차키(createdAt 또는 id) 추가. AC-8에 동률 케이스 테스트 보강.

### Info
- [GAP] createPage 부모-not-found 분기 무테스트 — PageService.createPage: `findById(parentPageId).orElseThrow(EntityNotFoundException)`(404) 경로에 테스트 없음. AC에 없는 동작이라 우선순위는 낮으나 커버리지 공백.
- [GAP] AC-13 null title 분기 무테스트 — 구현은 `title == null || isBlank()`인데 테스트는 공백("   ")만. null 입력 경로 미검증.
- [GAP] AC-10 타 워크스페이스 제외 실 DB 미검증 — 단위 테스트가 mock(findByUserId)으로 입력을 통제하므로, "비멤버 워크스페이스가 결과에서 빠지는지"는 실제로 검증되지 않음. findByUserId 동작에 의존.
- [RISK] getPageTree 전량 로드 + 재귀 조립 — 워크스페이스 페이지가 매우 많으면 전량 메모리 로드, 중첩이 매우 깊으면(수천) buildSubtree 재귀가 StackOverflow 가능. MVP 규모에선 비현실적이나 페이지네이션·깊이 제한 부재는 장기 위험. 다음 사이클(movePage/대량 데이터) 전 인지 필요.

## 총평
- 강점: AC 13건 전부 구현+테스트 통과, 권한(AccessGuard) 일관 적용으로 IDOR/교차 WS 주입 차단, 트리 조립 N+1 없는 단일 쿼리.
- 합산: Critical 0, Warning 1(position 타이브레이크), Info 4.
- 권고: W1(동일 position 정렬 안정성)만 이번 PR 또는 다음 사이클 초입에 처리 권장. 나머지 Info는 커버리지 보강 항목으로 백로그.

## 처리 결과
- **W1 [Warning] 수정됨**: `buildSubtree` 비교자에 2차/3차 키 추가 — `comparingInt(position).thenComparing(createdAt, nullsLast(naturalOrder)).thenComparing(id)`. 동일 position 형제가 createdAt→id 순으로 결정론적 정렬. RED(getPageTree_samePosition_tieBreaksByCreatedAt)→GREEN, 전체 68 테스트 통과. (커밋 별도)
- Info ②③④⑤: 사용자 결정으로 백로그(이번 미수정).
