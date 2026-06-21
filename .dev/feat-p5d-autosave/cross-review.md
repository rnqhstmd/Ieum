# Cross-Review 결과 (advisor: claude — 오케스트레이터 직접, 서브에이전트 idle-fail 회피)

- 브랜치: feat/p5d-autosave (base: feat/p5c-ws-auth)
- DEV_DIR: .dev/feat-p5d-autosave
- 대상: 자동저장 배선(US-EDIT-02 제목) — PR #16

## AC 충족 매트릭스
| AC | 충족 | 근거 |
|----|------|------|
| AC-1 단건 GET 멤버 200 | O | PageDetailController.get + PageDetailIntegrationTest.member_getPage_returns200 |
| AC-2 비멤버 403 | O | requirePageAccess + nonMember_getPage_returns403 |
| AC-3 미인증 401 | O | SecurityConfig + unauthenticated_getPage_returns401 |
| AC-4 제목 PATCH 저장 | O | usePageTitle.saveTitle(wsId-scoped PATCH) + usePageTitle.test |
| AC-5 초기 title 로드 | O | usePageTitle GET→setTitle + usePageTitle.test |
| AC-6 '저장됨' 상태 | O | useAutosave(saveTitle) 기존 saved 전이 + EditorContainer 배선 |

[Must] 3/3, [Should] 2/2 — 전부 충족.

## 설계 범위 이탈
이탈 없음. 변경 파일(PageDetailController·usePageTitle·EditorContainer·테스트 + context/page/status.md docs)이 design.md "변경 범위"와 일치.

## 신규 위험 (trust-ledger 미보고)
### Warning
- [RISK] `apps/web/src/lib/editor/usePageTitle.ts` — **pageId 변경 시 title/wsRef 미초기화**.
  - 근거: 효과 dep는 `[pageId]`이나 `title` 상태·`wsRef`는 GET resolve 전까지 이전 값을 유지 → (a) 이전 제목 UI 플래시, (b) GET 전 빠른 제목 수정 시 **이전 페이지의 workspaceId 경로로 PATCH**될 정합성 위험.
  - 완화(현행): `page.tsx`가 `<EditorContainer key={pageId}>`로 페이지 이동 시 **remount** → 새 usePageTitle 상태로 재초기화되므로 실사용 경로에선 발생하지 않음. 단 훅 단독 견고성은 부족.
  - 권고: 렌더 시점 pageId 변경 감지로 title/wsRef 즉시 초기화(방어).
  - (gemini PR#16 #1 HIGH와 일치 — gemini는 remount 완화를 미반영.)

### Info
- [POLICY] `PageDetailController:38` — Repository 직접 접근(Controller→Service→Repository 레이어 이탈).
  - 근거: 기존 PageController는 PageService 경유. 일관성·트랜잭션 경계(@Transactional(readOnly)) 측면 권고.
  - 권고: 조회 로직을 PageService로 이관. (gemini PR#16 #3 MEDIUM과 일치.)

### 검증되어 기각된 지적
- gemini PR#16 #2 "제목 저장 시 icon이 null로 덮어써짐" → **false positive**. `PageService.updatePage`(117–125)가 **null 필드는 변경하지 않음**(`if (request.icon() != null) page.setIcon(...)`). 따라서 `saveTitle`의 `icon:null` 전송은 기존 아이콘을 보존한다. 위험 아님(기록만).

## references 위반
없음.

## 총평
- 강점: AC 6/6 충족, 설계 범위 이탈 0, 핵심 로직을 순수 훅으로 격리해 검증.
- 합산: Warning 1, Info 1 (Critical 0). icon 지적은 백엔드 null-skip으로 무효.
- 권고: usePageTitle의 pageId 변경 방어(Warning)를 반영하면 훅 단독 견고성↑.

## 처리 결과 (사용자: 핵심 방어 수정 + 나머지 문서화)
- **Warning (usePageTitle pageId 변경 초기화): 수정됨** — 렌더 시점 pageId 변경 감지로 title/wsRef 즉시 초기화(React prop-변경 상태조정 패턴). RED→GREEN 테스트 추가. web 145 pass, tsc 0.
- **Info (PageDetailController → Service 이관): 문서화·연기** — 아키텍처 일관성 개선이나 동작 무관, 후속 정리.
- **gemini PR#16 #2 (icon 덮어쓰기): 무효** — updatePage null-skip으로 기각.
- **PR #14/#15 gemini 마이너: 문서화** — 대부분 이미 안전(23503/22P02 rejected·isUuid·per-task try/catch·PgMembershipStore 내부 catch·마운트당 1회 fetch). 잔여 마이너(23514→rejected, V3 DROP IF EXISTS, userId 모듈 캐시)는 선택 후속.
