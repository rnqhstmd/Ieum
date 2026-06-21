# Review — P2 잔여 (이름변경·아이콘·아카이브)

## Step 2: spec-reviewer (AC 충족)

### 백엔드
| AC | 충족 | 근거 |
|----|------|------|
| AC-B1 제목 변경·아이콘 보존 | ✅ | PageServiceTest.updatePage_changesTitle_preservesIcon |
| AC-B2 아이콘 변경·제목 보존 | ✅ | updatePage_changesIcon_preservesTitle |
| AC-B3 blank 제목 400 | ✅ | updatePage_blankTitle_throws |
| AC-B4 비멤버 403 | ✅ | updatePage_nonMember_throws |
| AC-B5 없는 페이지 404 | ✅ | updatePage_notFound_throws |
| AC-B6 타 워크스페이스 400 | ✅ | updatePage_otherWorkspace_throws |
| AC-B7 soft delete | ✅ | archivePage_softDeletes |
| AC-B8 재귀 아카이브 | ✅ | archivePage_recursivelyArchivesDescendants |
| AC-B9 비멤버 403 | ✅ | archivePage_nonMember_throws |
| AC-B10 없는 페이지 404 | ✅ | archivePage_notFound_throws |
| AC-B11 타 워크스페이스 400 | ✅ | archivePage_otherWorkspace_throws |
| AC-I1 제목변경 e2e | ✅ | PageIntegrationTest.member_updateTitle_reflectedInTree |
| AC-I2 아카이브 e2e(자식 제외) | ✅ | member_archiveParent_excludesSubtree |
| AC-I3 비멤버 PATCH/DELETE 403 | ✅ | nonMember_updateOrArchive_returns403 |

### 프론트
| AC | 충족 | 근거 |
|----|------|------|
| AC-F1 updatePage PATCH | ✅ | pages.test |
| AC-F2 archivePage DELETE | ✅ | pages.test |
| AC-F3 인라인 이름변경 | ✅ | PageTree.test |
| AC-F4 Escape 취소 | ✅ | PageTree.test |
| AC-F5 아이콘 설정 | ✅ | PageTree.test |
| AC-F6 아카이브 트리거 | ✅ | PageTree.test |
| AC-F7 rename→updatePage+재조회 | ✅ | Sidebar.test |
| AC-F8 archive confirm 분기 | ✅ | Sidebar.test |
| AC-F9 회귀 | ✅ | vitest 34/34, tsc 0, backend 단위 21 + 통합 green |

[Must] FR-1~5 충족, [Should] FR-6(confirm)·FR-7(401 handleError 재사용) 충족.

### 설계 범위 이탈
없음. 변경 파일이 design.md "변경 범위"와 일치(백엔드 2 + 테스트 2, 프론트 lib 3 + 컴포넌트 2 + 테스트 3).

### 판정: ✅ SPEC PASS (B11 + I3 + F8 = 22 AC 충족)

---

## Step 3-A: quality-reviewer

### Critical (0)
없음. 재귀 아카이브 유계(seen+DAG), null 역참조 없음, 권한 검사 누락 없음.

### Important (0)
없음.

### Minor (3 — 메모)
- Sidebar `handleRename`/`handleSetIcon`가 동일 구조(updatePage→loadTree). 3줄 수준이라 명시 유지가 더 읽기 쉬움(추출 보류).
- PageTreeNode 아이콘 입력 `maxLength=8` 임의값 — 멀티코드포인트 이모지 여유분.
- updatePage는 icon clear 불가(null=보존). 의도된 한계, PRD Out-of-scope 명시.

### 판정: ✅ QUALITY PASS

## Step 3-B: security-auditor
→ trust-ledger.md. CRITICAL 0 · HIGH 0 · MEDIUM 0 · LOW 1(방어됨) · INFO 3. 차단 없음.

---

## PR #7 Gemini 리뷰 대응 (5건 전부 수정)
| # | 심각도 | 수정 | 방식 |
|---|--------|------|------|
| 1 | HIGH | Escape/Enter 후 blur 중복·취소무시 커밋 (이름) | PageTreeNode `finalizedRef` 가드 — commit/cancel 1회만, blur-on-unmount 무력화 |
| 2 | HIGH | 동일(아이콘) | finishIcon 동일 가드 |
| 3 | MED | 편집 중 액션 버튼 노출 | `editing === 'none'`일 때만 액션 그룹 렌더 + 회귀 테스트 |
| 4 | MED | 아카이브된 페이지 updatePage 허용 | `archivedAt != null` → **EntityNotFoundException(404)** (제안된 IllegalState는 핸들러 미매핑→500이라 회피). AC-B12 RGR |
| 5 | MED | 재아카이브 불필요 조회·BFS | `archivedAt != null` early return. AC-B13 RGR |

- 백엔드 #4/#5: RED(2 실패)→GREEN(PageServiceTest 23/23). 프론트 #1~#3: 가드+숨김 적용, vitest 36/36·tsc 0.
- 비고: #1/#2의 실브라우저 blur-on-unmount는 jsdom이 재현 못 해 충실한 RED 불가 → 방어 가드 + 기존 Escape 테스트(AC-F4) + "Enter 1회 커밋"(PR리뷰#1) 테스트로 보강.

## 종합 판정
Spec ✅ · Quality ✅ · Security 차단 0 + PR 리뷰 5건 반영 → **phase-complete 진행**.
특이성과: "백엔드 완비" 오판을 setup에서 정정 → 백엔드 서비스 2개를 실제 TDD로 구현(단위 11 + 통합 3 신규). 권한·재귀·부분갱신 모두 테스트로 고정.
