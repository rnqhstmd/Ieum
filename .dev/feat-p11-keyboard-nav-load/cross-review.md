# Cross-Review 결과

- advisor: claude (qa-manager + security-auditor) + PR #29 gemini-code-assist 봇 리뷰 종합
- 브랜치: feat/p11-keyboard-nav-load (base: feat/p11-crdt-restore-structural-e2e)
- DEV_DIR: .dev/feat-p11-keyboard-nav-load

## AC 충족 매트릭스
[Must] 11/11 충족(AC-1~11). AC-8은 ArrowUp/Left 2케이스로 PRD 요구 충족. 설계 범위 이탈 없음(context/page 문서는 SSOT 관행 갱신).

## 신규 위험

### [Critical/RISK] getCaretOffset `nodeType===3` 가드 = 실제 프로덕션 결함 (trust-ledger "위험 없음" 판정 번복)
- 위치: `apps/web/components/editor/Editor.tsx:67`(가드), `:194`(Enter), `:198`(Backspace), `:206`(화살표).
- 근거(DOM 스펙): `placeCaret`의 `range.selectNodeContents(el) + range.collapse(toStart)`는 startContainer를 **요소 노드(el, nodeType 1)**로 남긴다(스펙상 텍스트 노드로 내려가지 않음). 따라서 화살표로 다음 블록 처음(atEnd=false)에 이동한 직후:
  - `getCaretOffset`의 `el.contains(sc) && sc.nodeType===3` 가드에서 nodeType 1 → **false → fallback=block.text.length 반환**(실제 caret offset은 0인데).
  - ① 그 블록에서 **ArrowUp/Left 시 offset=text.length로 평가 → resolveArrowDirection null → 이전 블록 복귀 불가**. 연속/역방향 탐색이 깨진다.
  - ② 이동 직후 **Enter → onEnter(block.id, text.length)로 블록 끝에서 분할**(처음 분할 의도 위반). **Backspace → offset≠0이라 onBackspace 미실행(병합 실패)**.
- 원래 getCaretOffset(가드 없음)은 startContainer가 요소노드든 텍스트노드든 `setEnd(sc, 0)` → `""` → **0을 정확히 계산**한다. nodeType 가드는 green-coder가 jsdom 테스트(focus()→fallback=text.length 의존)를 통과시키려 추가한 것으로, 프로덕션 회귀를 유발한다.
- 교차검증: PR #29 gemini 봇(critical, 메커니즘 설명 일부 부정확하나 결론=가드 제거 정확) + security-auditor(HIGH, Enter/Backspace 경로) 일치. qa-manager는 "브라우저가 텍스트노드로 내려간다"는 미검증 가정으로 무결 판정 → DOM 스펙상 성립 안 함(반려).
- 권고: **`nodeType===3` 가드 제거**(원래 `el.contains(range.startContainer)`만으로 복원). 테스트는 fallback 의존 대신 `getSelection` 모킹으로 결정화하고, "요소노드 offset 0 도착 후 ArrowUp→복귀" 연속탐색 회귀 테스트 추가.

### [Warning/CLEAN] 테스트 파일 stale RED 주석
- `apps/web/components/editor/__tests__/Editor.arrowNav.test.tsx:5` — `// resolveArrowDirection 는 아직 named export 안 됨 → import 실패로 RED`. 지금은 export 완료라 거짓 정보. 삭제/수정 권장.

### [Info/MAINT] AC-5 모킹 textNode null 가드
- `Editor.arrowNav.test.tsx` AC-5 — `node1.firstChild`가 null이면 암묵 실패. `expect(textNode).not.toBeNull()` 추가 권장.

## 총평
- 강점: `resolveArrowDirection` 순수함수 분리·named export, blockSelector DRY.
- 합산: **Critical 1**(getCaretOffset 가드 — 연속탐색·Enter/Backspace 회귀) · Warning 1 · Info 1.
- 권고: Critical을 RGR(회귀 테스트 RED → 가드 제거 GREEN → verify)로 수정 후 PR #29 갱신·gemini 응답.

## 처리 결과 (사용자: 전부 수정)
- ✅ **[Critical] getCaretOffset nodeType 가드 제거 (RGR)**: RED — 회귀 테스트("요소노드 caret offset 0 도착 후 ArrowUp → 이전 블록 복귀")가 가드로 인해 실패(1 fail) 확인. GREEN — `Editor.tsx`에서 `&& range.startContainer.nodeType === 3` 제거(원래 `el.contains`만 복원) → 요소노드/텍스트노드 모두 offset 0 정확 계산. 회귀 테스트 통과.
- ✅ **[Warning] 테스트 stale RED 주석 제거** (`Editor.arrowNav.test.tsx:5`).
- ✅ **[Info] AC-5 textNode null 단언** + `mockCaret` 헬퍼로 모든 통합테스트 caret offset 결정화(focus()-fallback 의존 제거 → AC-2/4/5/7 명시 모킹).
- 검증: arrowNav 22 pass(회귀 1 신규) · 전체 web 208 pass 0 fail(P6 커서 회귀 0) · typecheck 0 · next build OK.
