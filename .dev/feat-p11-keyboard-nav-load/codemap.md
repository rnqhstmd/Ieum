## 코드 맵: P11 버킷 마감 — 키보드 탐색 접근성(page) + 초기 로드 <2초 측정(FR-C4)

### 핵심 파일
- `apps/web/components/editor/Editor.tsx:162-177` → `handleKeyDown(e, block)` — 현재 Enter/Backspace만 처리. **ArrowUp/ArrowDown(/Left/Right) 블록 간 포커스 탐색 부재** → 키보드 탐색 추가 지점. 블록은 `data-block-id={idKey(block.id)}` contenteditable로 렌더.
- `apps/web/components/editor/Editor.tsx:32-50` → `getCaretOffset(el, fallback)` — 블록 내 caret offset. 경계 판정(offset===0 / ===text.length)에 재사용.
- `apps/web/components/editor/Editor.tsx:246-272` → `Editor` 렌더 루프 — `blocks.map`. prev/next 블록은 배열 인덱스로 계산 가능.
- `apps/web/components/editor/__tests__/Editor.test.tsx` → 단위 테스트 스타일(vitest + @testing-library/react, `fireEvent.keyDown`, `el(container, id(n))` 헬퍼, `data-block-id` 조회). 키보드 탐색 RGR이 따를 스타일.

### 참조 파일
- `apps/web/components/editor/EditorContainer.tsx:27-61` → Editor에 blocks·onEnter/onBackspace/onSetType 주입. 키보드 탐색은 로컬 DOM 포커스(CRDT op·네트워크 무관)라 신규 prop 불필요 가능성.
- `apps/web/e2e/restore.e2e.ts` → 기존 manual e2e 스타일(`test`,`page.goto('/page/${PAGE_ID}')`,`waitForLoadState`,`expect(...).toHaveText`). FR-C4 측정 e2e가 따를 패턴.
- `apps/web/e2e/convergence.e2e.ts` → 동일 manual e2e 스타일(2번째 참조).
- `apps/web/e2e/README.md` → "로컬 수동 구동 전용, 자동 verify 게이트 미포함" 명시. FR-C4 측정도 manual e2e로 추가(게이트 비대상).
- `apps/web/src/lib/editor/useCrdtDocument.ts` → blocks 진실원천 훅(키보드 탐색엔 직접 무관, 참조).

### 설정
- `apps/web/playwright.config.ts` → testDir=./e2e, testMatch=**/*.e2e.ts, baseURL=E2E_BASE_URL ?? localhost:3000. FR-C4 측정 e2e가 자동 매칭됨.
- `apps/web/package.json` → scripts: `test`(vitest run, 게이트), `e2e`(playwright test, manual), `typecheck`(tsc --noEmit).

### 비고
- 베이스 = `feat/p11-crdt-restore-structural-e2e`(PR #27) 위 스택. e2e 인프라·Editor 구조편집 핸들러 재사용.
- 키보드 탐색 = jsdom 단위테스트 가능(offset 경계 + DOM 포커스). FR-C4 = manual e2e 측정(게이트 비대상, PR #27 e2e와 동일 취급).
