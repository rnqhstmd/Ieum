# PRD: P11 버킷 마감 — 키보드 탐색 접근성 + 초기 로드 측정

## 배경
MVP 로드맵의 마지막 두 미완료 항목을 닫는 소형 슬라이스다.
- **키보드 탐색**: `Editor.tsx`의 `handleKeyDown`은 Enter(블록 분할)·Backspace(블록 병합)만 처리한다. ArrowUp/Down/Left/Right로 블록 경계를 넘어 인접 블록으로 포커스를 이동하는 기능이 없다. 블록은 `data-block-id` contenteditable로 렌더되며 배열 순서로 prev/next 계산이 가능하다.
- **초기 로드 측정(FR-C4)**: 페이지 진입 시 본문이 2초 내 표시되는지 검증하는 Playwright e2e spec이 없다. restore/convergence e2e와 동일한 수동 실행 전용 인프라 위에 타이밍 측정 spec만 추가한다.

변경 대상은 `apps/web`만이며 백엔드·ws-relay·CRDT 패키지는 건드리지 않는다.

## 목표
- 키보드만으로 블록 사이를 이동해 마우스 없이 편집할 수 있다.
- 페이지 초기 로드가 2초 미만임을 재현 가능한 수동 e2e spec으로 측정·기록한다.
- MVP 로드맵 미완료 항목 2건을 닫는다.

## 요구사항

### 기능 요구사항
- [Must] FR-1: ArrowUp + caret offset===0 → 이전 블록으로 포커스 이동, caret을 이전 블록 끝에 위치.
- [Must] FR-2: ArrowDown + caret offset===text.length → 다음 블록으로 포커스 이동, caret을 다음 블록 처음(0)에 위치.
- [Must] FR-3: ArrowLeft + caret offset===0 → 이전 블록으로 포커스 이동, caret을 이전 블록 끝.
- [Must] FR-4: ArrowRight + caret offset===text.length → 다음 블록으로 포커스 이동, caret을 다음 블록 처음.
- [Must] FR-5: IME 조합 중(composing)에는 화살표 블록 이동을 처리하지 않는다(기존 `composing.current` 가드 적용).
- [Must] FR-6: 첫 블록에서 위로 이동 조건(ArrowUp/Left·offset=0) → 이동 없이 기본 동작 허용(상한 경계).
- [Must] FR-7: 마지막 블록에서 아래로 이동 조건(ArrowDown/Right·offset=text.length) → 이동 없이 기본 동작 허용(하한 경계).
- [Must] FR-8: 블록 간 이동이 실제 발생하는 경우에만 `e.preventDefault()` 호출. 경계/미충족 시 기본 동작 막지 않음.
- [Must] FR-C4: 초기 로드 측정 e2e spec(`apps/web/e2e/load-time.e2e.ts`) 추가. 진입 후 첫 `[data-block-id]` 표시까지 경과 시간 측정, 2000ms 미만 단언.

### 비즈니스 규칙
- [Must] BR-1: 키보드 탐색은 로컬 DOM 포커스 이동만. CRDT op 생성·네트워크 전송·커서 이벤트 없음.
- [Must] BR-2: caret 경계 판정은 기존 `getCaretOffset(el, fallback)` 재사용. 신규 경계 로직 금지.
- [Must] BR-3: 이동 시 대상 블록 `.focus()` 호출. caret 위치는 Selection API로 설정하되, jsdom에서는 `document.activeElement`로만 검증(레이아웃 미지원).
- [Must] BR-4: FR-C4 e2e는 로컬 수동 구동 전용. 자동 verify 게이트(CI) 미포함(README 정책 준수).
- [Should] BR-5: 빈 블록(text.length===0)은 offset 0===length이므로 키 방향 우선 — ArrowUp/Left는 이전, ArrowDown/Right는 다음으로 이동.

### 품질 기대
- [Should] QE-1: 키보드 탐색 단위테스트는 기존 `Editor.test.tsx` 스타일(vitest + @testing-library/react, `fireEvent.keyDown`, `el(container, id(n))`).
- [Should] QE-2: FR-C4 e2e는 기존 `restore.e2e.ts` 구조(환경변수 PAGE_ID, 실행 전제 주석).

## 수용 기준

### 키보드 탐색 — 단위테스트 대상 (vitest + jsdom)

AC-1: ArrowUp, caret 블록 맨 앞 → 이전 블록 포커스 이동
  Given: 블록 2개(block-1, block-2) 렌더, block-2 포커스, caret offset 0.
  When: block-2에서 `fireEvent.keyDown(node, { key: 'ArrowUp' })`.
  Then: `document.activeElement`가 block-1의 `[data-block-id]` 요소. → [FR-1]

AC-2: ArrowDown, caret 블록 맨 끝 → 다음 블록 포커스 이동
  Given: 블록 2개, block-1 포커스, caret offset === block-1 텍스트 길이.
  When: block-1에서 `fireEvent.keyDown(node, { key: 'ArrowDown' })`.
  Then: `document.activeElement`가 block-2 요소. → [FR-2]

AC-3: ArrowLeft, caret 블록 맨 앞 → 이전 블록 포커스 이동
  Given: 블록 2개, block-2 포커스, caret offset 0.
  When: block-2에서 `fireEvent.keyDown(node, { key: 'ArrowLeft' })`.
  Then: `document.activeElement`가 block-1 요소. → [FR-3]

AC-4: ArrowRight, caret 블록 맨 끝 → 다음 블록 포커스 이동
  Given: 블록 2개, block-1 포커스, caret offset === 텍스트 길이.
  When: block-1에서 `fireEvent.keyDown(node, { key: 'ArrowRight' })`.
  Then: `document.activeElement`가 block-2 요소. → [FR-4]

AC-5: 블록 중간 caret — 이동 없음
  Given: 텍스트 "hello" 블록 2개, block-1 포커스, caret offset 2(중간).
  When: `fireEvent.keyDown(node, { key: 'ArrowDown' })`.
  Then: `document.activeElement`가 block-1 그대로, preventDefault 안 됨. → [FR-8]

AC-6: 첫 블록 상단 경계 — 이동 없음
  Given: 블록 2개, 첫 블록(block-1) 포커스, caret offset 0.
  When: `fireEvent.keyDown(node, { key: 'ArrowUp' })`.
  Then: `document.activeElement`가 block-1 그대로, preventDefault 안 됨. → [FR-6]

AC-7: 마지막 블록 하단 경계 — 이동 없음
  Given: 블록 2개, 마지막 블록(block-2) 포커스, caret offset === 텍스트 길이.
  When: `fireEvent.keyDown(node, { key: 'ArrowDown' })`.
  Then: `document.activeElement`가 block-2 그대로, preventDefault 안 됨. → [FR-7]

AC-8: 단일 블록 — 전 방향 이동 없음
  Given: 블록 1개, caret offset 0.
  When: `fireEvent.keyDown(node, { key: 'ArrowUp' })` 및 `{ key: 'ArrowLeft' }`.
  Then: 두 경우 모두 `document.activeElement`가 해당 블록, preventDefault 안 됨. → [FR-6, FR-7]

AC-9: 빈 블록 — ArrowDown으로 다음 블록 이동
  Given: 블록 2개(block-1 text="", block-2), block-1 포커스, caret offset 0(빈 블록).
  When: `fireEvent.keyDown(node, { key: 'ArrowDown' })`.
  Then: `document.activeElement`가 block-2 요소. → [FR-2, BR-5]

AC-10: IME 조합 중 화살표 키 — 이동 없음
  Given: 블록 2개, block-2 포커스, caret offset 0, `compositionstart` 발생 상태.
  When: `fireEvent.keyDown(node, { key: 'ArrowUp' })`.
  Then: `document.activeElement`가 block-2 그대로(조합 중 이동 없음). → [FR-5]

### 초기 로드 측정 — 수동 e2e 대상 (Playwright, 로컬 수동 구동 전용)

AC-11: 페이지 초기 로드 2초 미만 측정
  Given: DB·ws-relay·Next.js dev 기동, `E2E_PAGE_ID`에 유효 페이지 UUID 설정, `apps/web/e2e/load-time.e2e.ts` 존재.
  When: Playwright가 `/page/${PAGE_ID}` 이동 직후부터 첫 `[data-block-id]` 표시까지 경과 시간을 측정한다.
  Then: 경과 시간 < 2000ms, `expect(elapsed).toBeLessThan(2000)` 단언 통과. → [FR-C4]

## 제외 범위
- Tab 포커스 순환, PageUp/Down, 단축키 조합(Ctrl+Arrow): 제외.
- 줄 단위(line wrap) 탐색: jsdom 검증 불가로 제외. caret 텍스트 경계 판정만.
- FR-C4 e2e CI 자동화: 전체 스택 기동 필요로 제외.
- `Editor.tsx` 외 컴포넌트 변경: 범위 밖.

## G-W-T 게이트
PASS — AC-1~11 모두 Given/When/Then 3절 + 검증 가능한 구체적 Then. AC-1~10 단위테스트, AC-11 manual e2e.
