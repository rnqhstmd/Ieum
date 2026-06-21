# Cross-Review 결과

- advisor: claude (qa-manager/security-auditor subagent idle-fail → 오케스트레이터 직접 수행)
- 브랜치: feat/p3-block-editor (base: main)
- DEV_DIR: .dev/feat-p3-block-editor
- 미션: 산출물(PRD/설계/trust-ledger/review) 약속 대비 충실도 — 신규 위험만(중복 제외)

## AC 충족 매트릭스

| AC | 충족 | 근거 |
|----|------|------|
| AC-1~12 (순수 모델) | O | document.test.ts 12/12 (생성/불변갱신/분할/타입상속/병합/no-op/타입변경/마크다운) |
| AC-13 모델 파생 렌더 | O | Editor.test: h1/p/listitem 시맨틱 |
| AC-14 타이핑→onChange | O | Editor.test (fireEvent.input) |
| AC-15 Enter 분할 | O | Editor.test (개수+1) |
| AC-16 Backspace 병합 | O | Editor.test (개수-1) |
| AC-17~19 자동저장 | O | useAutosave.test (debounce 1회/연속 1회/status 전이) |
| FR-7 UI 마크다운 변환 | O | Editor.test "# "→heading1 + Editor.tsx:handleInput applyMarkdownShortcut 연결 |
| FR-8 라우트 통합 | O | page.tsx→EditorContainer, next build green |

[Must] FR-1~6 6/6 충족, [Should] FR-7·FR-8 충족, [Could] FR-9 충족(end-caret 한정).

## 설계 범위 이탈

- 파일: `context/page/status.md` (+6/-... )
  - 변경 요약: US-EDIT-01/03 ✅, US-EDIT-02 비고(메커니즘만) 갱신.
  - 판정: **정당** — phase-complete Step 3(도메인 status 동기화)의 표준 산출물. design 변경범위 외이나 파이프라인 규약상 허용.
- 그 외 변경 파일은 design.md "변경 범위"와 일치. 이탈 없음.

## 신규 위험

(trust-ledger.md/review.md에 이미 기록된 항목 — 콘텐츠 미영속화·"저장됨" 배지·연속 bullet 별도 ul·마크다운 리터럴 입력 불가·jsdom caret 폴백 — 은 제외)

### Warning
- **[W1] [GAP] US-PAGE-05의 "에디터 상단 인라인 제목 편집(P3)" 약속이 P3에서 미구현**
  - 위치: `apps/web/app/(app)/page/[pageId]/page.tsx` (`<h1>제목 없음</h1>` 정적, 편집 불가·메타데이터 미로드)
  - 근거: `context/page/status.md` US-PAGE-05 비고 "에디터 상단 인라인 편집은 **P3**". 그러나 P3 PRD/design은 US-EDIT(블록 콘텐츠)만 다루고 페이지 제목 편집을 범위에서 누락. 결과적으로 status 문서의 약속과 P3 산출물이 불일치.
  - 권고: ① 제목 인라인 편집을 P3 후속으로 구현(updatePage API 이미 존재, P2), 또는 ② status.md US-PAGE-05 비고를 "제목 편집은 P3 이후"로 정정하여 약속을 일치시킴.

- **[W2] [RISK] 자동저장 status가 미저장(dirty) 상태를 표현하지 못함**
  - 위치: `apps/web/src/lib/editor/useAutosave.ts` (notifyChange가 status를 변경하지 않음)
  - 근거: 직전 저장으로 status='saved' 이후 사용자가 다시 편집하면, debounce 대기(500ms) 동안 status가 'saved'로 유지된다 → UI는 "저장됨"인데 실제로는 미저장 변경 존재. AC-19는 idle→saving→saved만 명세하여 이 갭을 못 잡음.
  - 권고: notifyChange 진입 시 status를 'dirty'(또는 'unsaved')로 전이하고, 배지에 표시. P5 실제 영속화와 함께 정합성 확보. (P3 한정 영향은 낮으나 P5 전 수정 권장)

### Info
- **[I1] [ASSUMPTION] splitBlock 타입 규칙이 캐럿 위치와 무관**
  - 위치: `apps/web/src/lib/editor/document.ts` splitBlock (새 블록 type = bullet?bullet:paragraph)
  - 근거: PRD AC-4/AC-5는 end-caret 분할만 명세. heading을 **중간**에서 분할하면 뒤 블록이 paragraph가 되어 제목 후반부 서식이 바뀜(미정의 동작). Notion은 양쪽 모두 heading 유지.
  - 권고: 의도 확정 필요. "heading 중간 분할 시 뒤 블록도 heading 유지"가 자연스러우면 규칙을 (현재 타입 유지)로 변경 + AC 추가. 현 동작 유지 시 PRD에 명시.

- **[I2] [GAP] 에디터 블록에 ARIA 시맨틱 부재 / 키보드 탐색 NFR 미검증**
  - 위치: `apps/web/components/editor/Editor.tsx` (contenteditable 요소에 role/aria-label 없음, 에디터 영역 aria 미지정)
  - 근거: `context/page/status.md` 비기능 "키보드 탐색 지원(P3)"이 ⬜이며 본 변경에서 다뤄지지 않음. 블록은 편집 가능하나 스크린리더 시맨틱·탐색 보장 없음.
  - 권고: 에디터 컨테이너에 role/aria-label, 블록 간 화살표 이동 등은 후속(P3 후속/접근성 phase)으로 명시. 본 phase 범위 밖이면 NFR 행에 phase 재조정.

## references 위반
references/ 없음 — 해당 없음.

## 총평
- 강점: 순수 모델/DI 훅/controlled 컴포넌트 격리로 AC 충족도 100%(19+FR-7/8). 범위 결정(자동저장 메커니즘만·영속화 P5)이 코드(save-port no-op)와 정확히 일치. XSS 표면 없음(textContent).
- 합산: Critical 0, Warning 2(W1 약속 갭·W2 dirty 상태), Info 2(I1 분할 타입·I2 a11y).
- 권고: W1은 product 결정(구현 vs status 정정), W2는 P5 전 권장 수정, I1/I2는 후속 명시. 모두 phase-complete를 막지 않음(PR #8 유지 가능).

## 처리 결과 (전부 수정, RGR)
- **W1 (수정됨)**: `TitleEditor.tsx` 신규 — 에디터 상단 제목 인라인 편집(contentEditable h1, Enter 줄바꿈 차단). EditorContainer에 통합하여 제목+본문 공통 save-port로 자동저장. page.tsx 정적 제목 제거. status.md US-PAGE-05 비고 갱신. 테스트 W1-a/b/c.
- **W2 (수정됨)**: `useAutosave` SaveStatus에 `'dirty'` 추가, notifyChange 시 전이. EditorContainer 배지 '저장 대기…'. 테스트 W2.
- **I1 (수정됨)**: splitBlock 타입 규칙을 캐럿 인지로 변경 — 중간 분할(뒤 내용 있음)은 현재 타입 유지, 끝 분할(뒤 비음)은 paragraph. AC-4/5 불변. 테스트 I1.
- **I2 (수정됨)**: Editor 영역 `role="group" aria-label="페이지 본문"`, 제목 textbox role. status.md 키보드 탐색 NFR 비고 갱신(화살표 탐색은 후속). 테스트 I2.

검증: vitest **62/62**(신규 6), tsc 0, next build green.
