# Trust Ledger — P11 버킷 마감 (키보드 탐색 + 초기 로드 측정)

> security-auditor 통합 감사(phase-review) + quality-reviewer 결과 + 오케스트레이터 트리아지. 브랜치 feat/p11-keyboard-nav-load (base: feat/p11-crdt-restore-structural-e2e).

## 리뷰 요약
- **spec-reviewer**: SPEC PASS — [Must] 11/11, [Should] BR-5 4케이스. 범위 이탈 없음.
- **quality-reviewer**: QUALITY PASS(조건부) — Critical 0, Important 2(모두 [동작불변]), Minor 3.
- **security-auditor**: CRITICAL 0 · HIGH 0 · MEDIUM 3 · LOW 1. BR-1 직접 위반(CRDT op·relay·직접 onCursorMove) 없음.

## 통합 감사 (review)

### 종결 — 비위험 / 수용+문서화 (코드 변경 불요)
- **[ASSUMPTION/MEDIUM→종결] idKey selector 보간 인젝션** — `Editor.tsx:209` `document.querySelector(\`[data-block-id="${idKey(target.id)}"]\`)`. **비위험**: `idKey=\`${counter}@${siteId}\``, counter=정수(RGA), siteId=`crypto.randomUUID()`(hex+하이픈, `useCrdtDocument.ts:52`) → CSS 메타문자(`"`·`]`·`\`) 불가. 게다가 **기존 P6 코드 `Editor.tsx:273`이 이미 동일 패턴**을 사용(선례) → P11 신규 위험 아님. 조치 불요.
- **[GAP/MEDIUM→수용] selectionchange 간접 onCursorMove 발화 (BR-1 해석)** — `placeCaret`→`sel.addRange`→`selectionchange`→`scheduleCursor`→`onCursorMove`(50ms debounce). **수용**: 화살표 분기는 onCursorMove를 직접 호출하지 않고, 간접 경로는 P6가 **모든** caret 이동(클릭·블록내 화살표 포함)에 쓰는 기존 메커니즘이다. 화살표 탐색으로 커서가 실제로 새 블록으로 이동했으므로 그 위치를 브로드캐스트하는 것은 **올바른 협업 동작**이며, debounce가 transient fallback 값을 흡수한다. BR-1("협업 커서 이벤트 미발생")은 "탐색 로직이 새 커서 코드·CRDT op를 추가하지 않음"으로 충족 — 억제(navigating 플래그)는 오히려 협업자에게 stale 커서를 남겨 악화. **코드 주석으로 의도 명문화 권장.**
- **[GAP/MEDIUM→정보→❌오판정정정] getCaretOffset nodeType===3 가드** — `Editor.tsx`. **review 단계에서 "위험 없음/정보"로 판정했으나 cross-review(claude security-auditor)+PR #29 gemini 봇이 실제 결함으로 재지적, 확정됨.** placeCaret의 `selectNodeContents+collapse`는 스펙상 startContainer를 **요소 노드**로 남기는데, nodeType===3 가드가 이를 fallback(text.length)으로 오판 → 화살표로 다음 블록 처음(offset 0) 이동 직후 ① 연속/역방향 화살표 탐색 불가, ② Enter 분할 위치 오판·Backspace 병합 실패. **→ 가드 제거(원래 `el.contains`만 복원). 회귀 테스트 추가. 전체 cross-review.md 참조.** (review 오판정 사유: "빈 블록은 fallback=0=정확"만 보고 텍스트 블록의 offset 0 케이스를 놓침.)

### 저비용 문서화 후보
- **[ASSUMPTION/LOW] load-time.e2e.ts 인증 미적용 시 로그인 리다이렉트로 timeout** — `e2e/.auth/state.json` 부재 시 비인증 → `/page/:id` 로그인 리다이렉트 → `[data-block-id]` 미표시 → 10s timeout(원인이 "느림"이 아닌 "인증 안 됨"). 시크릿 하드코딩 없음, `.gitignore` `e2e/.auth/` 준수. → README에 "state.json 미존재 시 인증 실패로 timeout" 한 줄 추가 권장.

### 품질 [동작불변] 정리 후보 (refactor-coder 단독 — RGR 불요)
- **[Important/동작불변] 화살표 키 판정 중복(DRY)** — `Editor.tsx:202`의 4중 OR 가드와 `resolveArrowDirection` 내부 키 판정 중복. **주의**: 외곽 OR 가드는 비화살표 키에 getCaretOffset(매 키 입력 selection 접근) 호출을 막는 **성능 목적**이 있어 단순 중복이 아님 → 제거가 아니라 `ARROW_KEYS` 집합으로 가독성 개선만 검토.
- **[Important/동작불변] querySelector 셀렉터 중복** — `[data-block-id="..."]` 빌드가 L209(신규)·L273(기존)에 중복. `blockSelector(id)` 헬퍼로 추출 가능(다중 에디터 격리는 범위 밖 백로그).

### Minor (메모만, 비차단)
- ArrowDir 타입 export 노출(외부 소비처 없음) / AC-5 getSelection 모킹 화이트박스 결합(jsdom 한계 불가피, 주석 명시) / load-time.e2e.ts placeholder·매직넘버(AC-11 사양값, 주석 충분).

## 교차 검증 정합
- BR-1(직접 onCursorMove/CRDT op 미생성) ✓ · BR-2(getCaretOffset 재사용, el.contains 유지) ✓ · BR-3(.focus()+placeCaret) ✓ · FR-5(IME 가드 최상단) ✓ · FR-8(이동 시에만 preventDefault) ✓ · storageState 커밋 금지(.gitignore) ✓ · load-time.e2e.ts CI 미포함(BR-4) ✓ · packages/crdt 무변경 ✓.
