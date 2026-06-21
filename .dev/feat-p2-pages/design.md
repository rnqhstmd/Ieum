# 설계: P2 페이지 도메인 Walking Skeleton

## 개요
기존 스텁(`PageService`, `WorkspaceService.listMyWorkspaces`, 컨트롤러 `currentUserId=null`)을 채워 페이지 생성·트리 조회·내 워크스페이스 목록을 동작시킨다. P1의 `AccessGuard`/`CurrentUserService`를 실제 엔드포인트에 처음 배선한다. 기존 레이어 패턴(Controller → Service(@Transactional) → Repository, DTO record, `ApiExceptionHandler` 전역 예외 매핑)을 그대로 따른다.

## 설계 규모: 소형
- 신규 클래스 0, 기존 메서드 구현 3 + 컨트롤러 배선 2파일 + 리포지토리 메서드 1 추가(선택).
- 새 의존성/아키텍처 변경 없음 → design-critic 생략(소형 라우팅), test-architect 평가만 수행.

## 변경 범위 (파일별)

| 파일 | 종류 | 변경 |
|------|------|------|
| `page/PageService.java` | 수정 | 의존성 `WorkspaceService`→`AccessGuard`로 교체. `createPage`, `getPageTree` 구현. (`updatePage/movePage/archivePage`는 스텁 유지 — 범위 밖) |
| `page/PageController.java` | 수정 | `CurrentUserService` 주입, 모든 핸들러의 `currentUserId = null`을 `currentUserService.requireCurrentUserId()`로 대체 (PRD M5) |
| `workspace/WorkspaceService.java` | 수정 | `listMyWorkspaces` 구현 (`MembershipRepository.findByUserId` → `WorkspaceRepository.findAllById` → DTO) |
| `workspace/WorkspaceController.java` | 수정 | `CurrentUserService` 주입, `listMyWorkspaces()`의 `currentUserId = null` 대체 (나머지 핸들러는 범위 밖 — TODO 유지) |
| `page/PageRepository.java` | 수정(선택) | 변경 없음 — 기존 `findByWorkspaceIdAndArchivedAtIsNull(wsId)`로 충분 |

## 컴포넌트 설계

### 1. PageService.createPage(currentUserId, workspaceId, request) — AC-1~4, 13
```
1. accessGuard.requireWorkspaceMember(currentUserId, workspaceId)   // 비멤버 → AccessDeniedException(403)
2. title 검증: request.title()이 null이거나 isBlank() → IllegalArgumentException("제목은 비어 있을 수 없습니다") (400)
3. parentPageId != null 이면:
     parent = pageRepository.findById(parentPageId)
              .orElseThrow(() -> new EntityNotFoundException("부모 페이지를 찾을 수 없습니다"))   // 404
     if (!parent.getWorkspaceId().equals(workspaceId))
         throw new IllegalArgumentException("부모 페이지가 다른 워크스페이스에 속합니다")          // 400 (AC-3)
4. Page saved = pageRepository.save(Page.builder()
       .workspaceId(workspaceId).parentPageId(request.parentPageId())
       .title(request.title()).icon(request.icon())
       .position(request.position())              // D1: 클라이언트 전달값 그대로
       .createdById(currentUserId).build())
5. return toDto(saved, null)   // children=null
```

### 2. PageService.getPageTree(currentUserId, workspaceId) — AC-5~9
```
1. accessGuard.requireWorkspaceMember(currentUserId, workspaceId)   // 403
2. List<Page> pages = pageRepository.findByWorkspaceIdAndArchivedAtIsNull(workspaceId)
3. 트리 조립 (순수 함수, in-memory):
     - Map<UUID, List<Page>> byParent = new HashMap<>();  (parentPageId null 키 허용 위해 HashMap 수동 그룹핑)
       for (Page p : pages) byParent.computeIfAbsent(p.getParentPageId(), k -> new ArrayList<>()).add(p);
     - buildSubtree(parentId):
         byParent.getOrDefault(parentId, List.of())
           .stream().sorted(Comparator.comparingInt(Page::getPosition))   // 같은 레벨 position 오름차순
           .map(p -> toDto(p, buildSubtree(p.getId())))                    // 재귀로 children 설정
           .toList()
     - return buildSubtree(null)   // 최상위(parentPageId=null) 목록, 빈 워크스페이스면 빈 리스트
```
- 사이클 안전성: createPage는 부모가 사전 존재해야 하므로 데이터가 DAG를 형성(자기참조 사이클 불가). movePage(사이클 방지)는 범위 밖이므로 이번 슬라이스에서 무한재귀 위험 없음. (주석으로 명시)
- N+1 없음: 단일 쿼리로 플랫 로드 후 메모리 조립.

### 3. WorkspaceService.listMyWorkspaces(currentUserId) — AC-10, 11
```
1. List<Membership> ms = membershipRepository.findByUserId(currentUserId)
2. List<UUID> wsIds = ms.stream().map(Membership::getWorkspaceId).toList()
3. return workspaceRepository.findAllById(wsIds).stream().map(this::toDto).toList()
   // 멤버십 0건 → wsIds 빈 리스트 → findAllById([]) → 빈 리스트 (예외 없음)
```
- 별도 AccessGuard 불필요: 본인 멤버십만 조회하므로 자기 데이터만 반환.

### 4. 컨트롤러 인증 배선 — AC-12, M5
- `PageController`: `private final CurrentUserService currentUserService;` 추가. 각 핸들러에서 `UUID currentUserId = currentUserService.requireCurrentUserId();`.
- `WorkspaceController`: 동일 주입, `listMyWorkspaces()`만 대체(나머지 핸들러는 범위 밖이라 TODO 유지).
- 미인증 요청은 `SecurityConfig`의 `anyRequest().authenticated()` + `JsonAuthenticationEntryPoint`가 필터 단계에서 401 JSON으로 차단(AC-12). 컨트롤러 진입 전 차단되므로 `requireCurrentUserId()`는 인증된 principal에서 googleId→User.id 매핑 역할.

### 에러 처리 매핑 (기존 ApiExceptionHandler 재사용, 신규 핸들러 불필요)
| 상황 | 예외 | HTTP |
|------|------|------|
| 비멤버 접근 | AccessDeniedException | 403 |
| 부모 페이지 미존재 | EntityNotFoundException | 404 |
| 부모 다른 워크스페이스 / 빈 제목 | IllegalArgumentException | 400 |
| 미인증 | (필터단 JsonAuthenticationEntryPoint) | 401 |

### 공통 헬퍼
- `PageService.toDto(Page, List<PageDto> children)`: Page → PageDto 매핑(private static).
- `WorkspaceService.toDto(Workspace)`: 이미 패턴 존재 가정, 없으면 private 추가.

## 구현 순서 (RGR 태스크 단위)
- **T1**: `WorkspaceService.listMyWorkspaces` (AC-10, 11) — 가장 독립적, 의존 적음
- **T2**: `PageService.createPage` (AC-1~4, 13) — title/parent 검증 포함
- **T3**: `PageService.getPageTree` (AC-5~9) — 트리 조립 순수 로직
- **T4**: 컨트롤러 인증 배선 + REST 통합 (AC-12) — 미인증 401, 멤버 정상흐름

각 태스크는 RED(실패 테스트) → GREEN(최소 구현) → REFACTOR 순서.

## Testability 평가 (test-architect 관점, 오케스트레이터 직접 평가)

### 컴포넌트별 테스트 전략

#### PageService.createPage / getPageTree
- 단위 테스트: Mockito. `@Mock PageRepository`, `@Mock AccessGuard`, `@InjectMocks PageService`.
- 모의 대상: `PageRepository`(save/findById/findByWorkspaceIdAndArchivedAtIsNull), `AccessGuard`(requireWorkspaceMember — 비멤버 시 `AccessDeniedException` throw하도록 stubbing).
- 격리 전략: 트리 조립은 순수 in-memory 로직이라 mock 리스트만으로 결정적 검증 가능(AC-5,6,7,8).
- AC 매핑: AC-1,2,3,4,5,6,7,8,9,13.

#### WorkspaceService.listMyWorkspaces
- 단위 테스트: Mockito. `@Mock MembershipRepository`, `@Mock WorkspaceRepository`.
- AC 매핑: AC-10, 11.

#### 통합 테스트 (AbstractIntegrationTest, Testcontainers PostgreSQL)
- createPage→DB 저장 후 getPageTree로 트리 검증(실 DB), 비멤버 403 실증.
- AC 매핑: AC-1,2,5,6,9 (e2e 보강).

#### 컨트롤러 (REST)
- `@WebMvcTest(PageController)` + `spring-security-test` 또는 통합 테스트: 미인증 GET → 401 JSON.
- AC 매핑: AC-12.

### Testability Score: 9/10
- 모든 의존성이 생성자 주입 인터페이스(Repository, AccessGuard 컴포넌트). static/전역 상태 없음.
- 트리 조립이 순수 함수라 property 수준 검증까지 용이.
- −1: 컨트롤러 인증 흐름은 Spring Security 필터 의존이라 순수 단위가 아닌 슬라이스/통합 테스트 필요(불가피).

### 판정: ✅ TESTABILITY PASS (9/10 ≥ 7)
