# 설계: P11 버킷 마감 — 키보드 탐색 접근성 + 초기 로드 측정

## 설계 규모
**소형** — 단일 파일(`Editor.tsx`)의 `handleKeyDown`에 화살표 분기 추가 + e2e spec 1개 신규. 신규 의존성·아키텍처 변경 없음. 변경 대상은 `apps/web`에 국한.

## 확정 결정 (사용자 승인)
- **AC-5 검증**: 순수 함수 `resolveArrowDirection` 단위테스트(핵심, 중간이면 null) + AC-5 DOM 통합 경로에서만 `vi.spyOn(window,'getSelection')` 최소 모킹. 둘 다.
- **`resolveArrowDirection`**: `Editor.tsx`에서 **named export** → 순수 함수 직접 단위테스트.
- **FR-C4 측정 기준**: `Date.now()` wall-clock (goto 시작 ~ 첫 `[data-block-id]` visible).

## 변경 범위
- 영향 모듈: `apps/web`만. 백엔드·ws-relay·`@ieum/crdt` 무변경.
- **신규**: `apps/web/e2e/load-time.e2e.ts` (FR-C4 측정, Playwright manual).
- **수정**:
  - `apps/web/components/editor/Editor.tsx` — 순수 함수 `resolveArrowDirection`(named export) + `placeCaret` 추가, `handleKeyDown` 화살표 분기 확장.
  - `apps/web/components/editor/__tests__/Editor.test.tsx` — AC-1~10 describe 추가.
  - `apps/web/e2e/README.md` — 테스트 목록에 `load-time.e2e.ts` 행 추가.

## 상세 설계

### 1. Editor.tsx — 화살표 탐색

```ts
// 모듈 레벨 순수 함수 (named export). 키+offset+길이 → 이동 방향. DOM 의존 0.
export type ArrowDir = 'prev' | 'next';
export function resolveArrowDirection(
  key: string, offset: number, textLength: number,
): ArrowDir | null {
  if ((key === 'ArrowUp' || key === 'ArrowLeft') && offset === 0) return 'prev';
  if ((key === 'ArrowDown' || key === 'ArrowRight') && offset === textLength) return 'next';
  return null;
}
//   빈 블록(length 0): offset 0===length이나 key를 먼저 보므로 Up/Left→prev, Down/Right→next (BR-5)
//   중간 caret: 0도 length도 아님 → null (AC-5)
//   비화살표 키 → null

// 모듈 레벨. Selection으로 caret 배치. jsdom 미지원은 try/catch 흡수(getCaretOffset 패턴 동일).
function placeCaret(el: HTMLElement, atEnd: boolean): void {
  try {
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(/* toStart */ !atEnd);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch { /* jsdom 등 미지원 환경 */ }
}
```

`handleKeyDown` 분기 확장 (기존 IME 가드·Enter·Backspace 분기 뒤, 독립 분기로 추가):
```ts
// 화살표 블록 간 탐색 (FR-1~8). composing 가드는 함수 최상단 기존 코드가 처리(FR-5).
if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
  const offset = getCaretOffset(e.currentTarget, block.text.length);
  const dir = resolveArrowDirection(e.key, offset, block.text.length);
  if (!dir) return;                                    // 중간 caret → 기본 동작 (FR-8)
  const idx = blocks.findIndex((b) => idEquals(b.id, block.id));
  const target = dir === 'prev' ? blocks[idx - 1] : blocks[idx + 1];
  if (!target) return;                                 // 경계(첫/마지막) → 기본 동작 (FR-6/7)
  const targetEl = document.querySelector(`[data-block-id="${idKey(target.id)}"]`);
  if (targetEl instanceof HTMLElement) {
    e.preventDefault();                                // 이동 시에만 (FR-8)
    targetEl.focus();                                  // (BR-3)
    placeCaret(targetEl, /* atEnd */ dir === 'prev');  // prev→끝, next→처음 (BR-3)
  }
}
```

**고려사항**:
- offset은 화살표 키일 때만 계산(비화살표 키에 불필요한 selection 접근 차단).
- IME 가드(`if (composing.current) return`)가 함수 최상단(L163)에 이미 있어 화살표도 자동 차단(FR-5/AC-10). 추가 가드 불필요.
- BR-1: `onCursorMove`/CRDT op 미호출 → 네트워크·커서 이벤트 없음. `.focus()`는 `onFocus`(L262)로 `focusedBlock.current`만 갱신(로컬 ref, 의도된 동작).
- 형제 블록 접근은 기존 `document.querySelector('[data-block-id="..."]')` 패턴(L234) 재사용.

### 2. Editor.test.tsx — AC-1~10

새 describe `'Editor — 화살표 블록 탐색 (P11)'`:
- **순수 함수**: `resolveArrowDirection` 직접 호출 — 중간 offset→null(AC-5 핵심), 경계/방향/빈 블록 결정성 검증.
- **AC-1~4**: 2블록 렌더 → 소스 블록 `.focus()` → `fireEvent.keyDown(node,{key})` → `expect(document.activeElement).toBe(el(container, id(target)))`.
- **AC-5(DOM 경로)**: `vi.spyOn(window,'getSelection')`로 중간 offset(2) 재현 → 이동 없음 + preventDefault 미호출.
- **AC-6~8**: 경계 → `const prevented = !fireEvent.keyDown(...)` → `expect(prevented).toBe(false)` + activeElement 동일.
- **AC-9**: 빈 블록(text="") ArrowDown → 다음 블록 활성.
- **AC-10**: `fireEvent.compositionStart(node)` 후 ArrowUp → activeElement 동일(이동 없음).
- 이동 발생 케이스(AC-1~4,9)는 `prevented === true` 동반 단언(FR-8).

### 3. e2e/load-time.e2e.ts (신규, AC-11)

```ts
// AC-11/FR-C4: 페이지 초기 로드가 2초 미만에 본문(첫 블록)을 표시하는지 측정.
// 실행 전 요건: DB 기동 + pageId 시드 + ws-relay 기동 + Next.js dev 기동 + storageState + E2E_PAGE_ID.
// (e2e/README.md 참조 — 로컬 수동 구동 전용, 자동 게이트 미포함)
import { test, expect } from '@playwright/test';
const PAGE_ID = process.env.E2E_PAGE_ID ?? 'REPLACE_WITH_VALID_PAGE_UUID';

test('AC-11: 페이지 초기 로드가 2초 미만에 본문을 표시한다', async ({ page }) => {
  const start = Date.now();
  await page.goto(`/page/${PAGE_ID}`);
  await page.locator('[data-block-id]').first().waitFor({ state: 'visible', timeout: 10_000 });
  const elapsed = Date.now() - start;
  console.log(`[load-time] 초기 로드 경과: ${elapsed}ms`);  // 측정 산출물 기록
  expect(elapsed).toBeLessThan(2000);
});
```
- `playwright.config.ts` 기본 storageState 적용 → 인증 세션. `{ page }` fixture 사용.
- `waitFor` timeout(10s) > 단언(2s): 느린 경우에도 elapsed 측정해 실패 단언으로 드러냄.

### 4. e2e/README.md — 테스트 목록 갱신
목록 표에 `load-time.e2e.ts | AC-11 | 초기 로드 2초 미만 측정` 행 추가. 그 외 무변경.

## 구현 순서 (RGR 태스크)
```
T1. [Must] resolveArrowDirection(named export) + placeCaret + handleKeyDown 화살표 분기 (Editor.tsx)
    — AC-1~10 프로덕션 로직. FR-1~8, BR-1/2/3/5.
T2. [Must] 단위테스트: 순수함수(AC-5 핵심·경계·빈블록) + AC-1~4(정상이동) + AC-6~8(경계/preventDefault) + AC-9~10(빈블록·IME)
    — Editor.test.tsx. T1 의존.
T3. [Must] load-time.e2e.ts 신규 + README 표 갱신 (AC-11/FR-C4)
    — apps/web/e2e/. T1·T2와 import 무관 → 병렬 가능.
```
T1↔T3 병렬 가능(파일·import 독립). T2는 T1 의존.

## 영향도
- 기존 코드: `handleKeyDown`에 분기 **추가**만, Enter/Backspace/IME/커서 로직 무변경 → 기존 Editor 테스트 회귀 없음.
- 하위 호환: `Editor` 호출부(EditorContainer) 신규 prop 불필요 — 내부 동작만 확장.

## 준수 규격
(해당 없음 — references/ 디렉토리 없음)

## 확인이 필요한 사항
추가 확인 사항 없음. 설계가 완료되었습니다.

---

## Testability 평가 (test-architect)

### 컴포넌트별 테스트 전략
- **`resolveArrowDirection(key,offset,textLength)`**: 순수 함수, 의존성 0. 입력 3개→`'prev'|'next'|null` 직접 단언. jsdom·Selection 불필요. 경계/중간/빈블록/비화살표 결정적. AC-1~5·9 핵심. **named export로 노출.**
- **`handleKeyDown` 화살표 분기**: `render(<Editor/>)` + `fireEvent.keyDown` + `document.activeElement`(또는 `!fireEvent.keyDown()` preventDefault 반환). IME 가드 최상단 → AC-10 무료 보장. 모의: AC-5 한정 `vi.spyOn(window,'getSelection')`. AC-1~4·6~10.
- **`placeCaret`**: jsdom 레이아웃 미지원 → caret 위치 단언 비대상(정직). try/catch가 throw 흡수해 핸들러 안 깨짐만 보장. 직접 매핑 AC 없음(공백 허용 — caret 정확 위치 단언 AC 부재).
- **`load-time.e2e.ts`**: Playwright manual e2e. 전체 스택 기동 필요로 단위 불가가 정상. 게이트 비대상(CI 오염 방지). AC-11.

### Testability Score: 9/10
- 방향 판정을 의존성 0 순수 함수+named export로 분리 → 최난 AC-5를 DOM 없이 결정 검증(+).
- IME 가드 최상단으로 AC-10 무료, 기존 preventDefault·activeElement·data-block-id 패턴 재사용(+).
- 화살표 분기가 Enter/Backspace 무변경 추가 → 격리 우수(+).
- 감점 1: placeCaret caret 효과 jsdom 공백(허용), AC-5 DOM 경로 getSelection 모킹이 getCaretOffset 내부에 결합된 화이트박스(약간 취약). 둘 다 재설계 불요.

### 판정
**PASS (9 ≥ 7) → RGR 진입 가능.**
권고: (1) resolveArrowDirection named export+순수테스트 1순위(red), (2) AC-5 DOM 모킹은 "중간이면 미이동" 행위에 한정·offset 정확값은 순수함수에 위임, (3) AC-11 manual 절차 README 명기(충족).
