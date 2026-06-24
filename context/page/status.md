# 페이지·에디터 구현 추적

## 범례

| 기호 | 의미 |
|------|------|
| ✅ | 반영됨 (구현 완료) |
| ⬜ | 미반영 (구현 전) |
| ❓ | 선택적 / 범위 미확정 |

---

## Phase 매핑

> 이 매핑은 구현 phase 계획 기준: 페이지 CRUD·중첩 트리·아카이브(US-PAGE) → **P2**, 블록 에디터·자동저장(US-EDIT) → **P3**, 에디터 CRDT 구조편집·키보드 탐색·초기로드 측정·페이지 순서 DnD → **P11**.
>
> 옛 P8(position) 표기는 폐기하고 평면 연속 번호(P11)를 쓴다. 묶음 정의는 [`../remaining-phases.md`](../remaining-phases.md) 참조.

---

## 요구사항 추적

### §3 페이지 (US-PAGE)

| 항목 | 사용자 스토리 | 핵심 수용 기준 | 상태 | Phase | 비고 |
|------|-------------|--------------|------|-------|------|
| US-PAGE-01 | 워크스페이스 멤버로서 새 페이지를 만들고 싶다 | 워크스페이스 내 최상위 페이지 및 특정 페이지의 하위 페이지 생성 가능 | ✅ | P2 | `PageService.createPage` 백엔드 API (PR #4). 비멤버 403·타 WS 부모 400 검증. 프론트 별도 |
| US-PAGE-02 | 페이지 안에 하위 페이지를 만들고 싶다 | 페이지 트리 깊이 제한 없음 (무한 중첩 허용) | ✅ | P2 | `getPageTree` parentPageId 자기참조 무한 중첩 + position 정렬 트리 조립 (PR #4) |
| US-PAGE-03 | 사이드바에서 페이지 트리를 탐색하고 싶다 | 부모 페이지 펼침 시 하위 페이지 목록 표시 | ✅ | P2 | 프론트 `Sidebar`/`PageTree` 중첩 펼침·접힘·네비 + 새 페이지 생성 (PR #5). 이름변경·아카이브 트리 액션 추가 (PR #7) |
| US-PAGE-04 | 페이지를 삭제(아카이브)하고 싶다 | soft delete(archivedAt 설정), 하위 페이지 재귀 아카이브, 트리에서 숨김 | ✅ | P2 | `PageService.archivePage` 재귀 soft delete + 사이드바 아카이브 버튼(confirm) (PR #7). 복원 UI는 MVP 선택적 |
| US-PAGE-05 | 페이지 제목과 아이콘을 설정하고 싶다 | 제목 변경은 에디터 상단 인라인, 아이콘은 이모지 문자열로 저장 (직접 입력) | ✅ | P2/P3 | `PageService.updatePage` 부분 갱신 + 사이드바 인라인 이름변경·이모지 직접입력 (PR #7). 에디터 상단 제목 인라인 편집 `TitleEditor` 구현 (PR #8, 영속화는 P5). 이모지 피커는 post-MVP |
| US-PAGE-05 (position) | — | 페이지 순서(position) 변경 UI | ⬜ | P11 | 드래그앤드롭 UI = post-MVP 연기. MVP는 position 기반 기본 정렬 유지, position 필드는 유지 |

### §4 에디터 (US-EDIT)

| 항목 | 사용자 스토리 | 핵심 수용 기준 | 상태 | Phase | 비고 |
|------|-------------|--------------|------|-------|------|
| US-EDIT-01 | 페이지에서 텍스트를 입력하고 수정하고 싶다 | contenteditable 기반 블록 단위 에디터 동작, Enter 새 블록·Backspace 빈 블록 삭제 | ✅ | P3 | controlled 블록 에디터 `Editor.tsx` + 순수 모델 `document.ts`(분할/병합) (PR #8). 캐럿 복원 best-effort |
| US-EDIT-02 | 편집 내용이 자동으로 저장되길 원한다 | debounce 500ms 후 자동저장 (협업 시 CRDT op 즉시 전송) | ✅ | P3/P5 후반 | 메커니즘(`useAutosave`)은 P3(PR #8). **영속화 연결 완료**: 블록 본문은 CRDT op 즉시 영속(P5 후반 op 영속화, PR #14), **제목**은 단건 GET `/api/pages/{id}` + `usePageTitle` save-port→PATCH로 영속(PR #16) |
| US-EDIT-03 | 기본 블록 타입을 사용하고 싶다 | paragraph / heading1~3 / bullet list 지원, 추가 타입은 post-MVP | ✅ | P3 | 타입별 시맨틱 렌더(h1~3/p/li) + 마크다운 단축(`# ## ### -`) (PR #8). 슬래시 메뉴·이미지/파일 블록은 Out-of-Scope |
| US-EDIT (CRDT) | — | 에디터 내용은 RGA CRDT 상태로 관리, 렌더링은 CRDT 상태에서 파생 | ✅ | P11 | CRDT 블록 모델·`docToBlocks` 도출은 P4b(PR #9). 인라인 라이브 수렴은 P5(PR #10). **구조편집 완전 배선 P11(PR #27)**: Editor Enter→`splitBlock`·Backspace(idx0)→`mergeBlockWithPrev`·마크다운 단축키→`setBlockType` 블록 op 전송·수렴. 진실원천 DocState. 커서 복원은 best-effort |

---

## 비기능 요구사항 추적

| 항목 | 목표 | 상태 | Phase | 비고 |
|------|------|------|-------|------|
| 페이지 초기 로드 | < 2초 (로컬 환경, 에디터 표시까지) | ✅ | P11 (PR #29) | `e2e/load-time.e2e.ts` — `goto`부터 첫 `[data-block-id]` visible까지 `Date.now()` wall-clock 측정 후 `expect(elapsed).toBeLessThan(2000)`. 수동 구동 전용(전체 스택 기동 필요, 자동 게이트 비대상). (FR-C4/AC-11) |
| 키보드 탐색 지원 | 에디터 및 주요 인터랙션 키보드 접근 가능 | ✅ | P11 (PR #29) | 에디터 영역 ARIA 그룹(role=group)·제목 textbox (PR #8). **블록 간 화살표 탐색 P11(PR #29)**: caret 경계(offset 0/length)에서 Up/Left→이전 블록 끝·Down/Right→다음 블록 처음 포커스 이동. 중간 caret·첫/마지막 경계·IME 중 미이동, 이동 시에만 preventDefault. 로컬 DOM 포커스만(CRDT/네트워크 무관). `resolveArrowDirection` 순수함수 + `placeCaret`. 단위 21건 (FR-1~8/AC-1~10) |
