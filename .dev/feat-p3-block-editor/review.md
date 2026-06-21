# Review — P3 블록 에디터 (US-EDIT-01~03)

## Step 0: Mechanical Gate
- next build: ✅ green (컴파일·lint·타입체크 통과, `/page/[pageId]` 라우트 빌드)
- vitest: ✅ 56/56 (신규 20 + 기존 36)
- tsc --noEmit: ✅ 0 (noUncheckedIndexedAccess 포함)

## Step 2: spec-reviewer (AC 충족)

| AC | 충족 | 근거 |
|----|------|------|
| AC-1 빈 문서 생성 | ✅ | document.test: createEmptyDocument |
| AC-2 updateText 불변성 | ✅ | document.test |
| AC-3 splitBlock 중간 분할 | ✅ | document.test |
| AC-4 heading→paragraph 상속 | ✅ | document.test |
| AC-5 bullet→bullet 상속 | ✅ | document.test |
| AC-6 mergeWithPrevious 병합 | ✅ | document.test |
| AC-7 첫 블록 merge null | ✅ | document.test |
| AC-8 빈 블록 삭제 | ✅ | document.test |
| AC-9 setType | ✅ | document.test |
| AC-10 마크다운 heading | ✅ | document.test |
| AC-11 마크다운 bullet | ✅ | document.test |
| AC-12 마크다운 미매칭 null | ✅ | document.test |
| AC-13 모델 파생 렌더 | ✅ | Editor.test (h1/p/listitem) |
| AC-14 타이핑→onChange | ✅ | Editor.test |
| AC-15 Enter 블록 추가 | ✅ | Editor.test |
| AC-16 Backspace 블록 제거 | ✅ | Editor.test |
| AC-17 debounce 1회 저장 | ✅ | useAutosave.test (fake timers) |
| AC-18 연속변경 1회 | ✅ | useAutosave.test |
| AC-19 status 전이 | ✅ | useAutosave.test |
| FR-7 UI 마크다운 변환 | ✅ | Editor.test "# " → heading1 (RGR 추가) |
| FR-8 라우트 통합 | ✅ | next build green, page.tsx→EditorContainer |

[Must] FR-1~6 충족, [Should] FR-7(마크다운 단축, UI 연결 포함)·FR-8(라우트) 충족, [Could] FR-9(타입상속) 충족(AC-4/5).

### 설계 범위 이탈
없음. 변경 파일이 design.md "변경 범위"와 일치(신규 document.ts/useAutosave.ts/Editor.tsx/EditorContainer.tsx + 수정 page.tsx + 테스트 3).

### 판정: ✅ SPEC PASS (19 AC + FR-7/FR-8 충족)

## Step 3-A: quality-reviewer

### Critical (0)
없음. XSS 벡터 없음(textContent 사용, innerHTML 미사용), null 역참조 가드(splitBlock/mergeWithPrevious의 undefined 가드), 무한 루프 없음.

### Important (0)
- (해소됨) FR-7 `applyMarkdownShortcut`가 순수함수로만 존재하고 UI 미연결 → RGR로 handleInput에 연결 + 캐럿 복원. 미사용 export 제거.

### Minor (4 — 메모)
- 연속 bullet 블록이 각각 별도 `<ul>`로 렌더(리스트 그룹핑 없음). MVP 허용, 시각 동일. P3 후속/P4b에서 그룹핑 검토.
- 마크다운 단축이 접두사 시작이면 항상 변환되어 리터럴 "# "를 문단에 입력 불가(Notion 동일 동작). MVP 허용.
- jsdom Selection/caret 미지원 → getCaretOffset 폴백(분할/병합 로직은 순수 모델로 완전 커버). 실브라우저 캐럿은 best-effort.
- `useAutosave` 저장 실패 시 status를 idle로 되돌리고 사용자 알림 없음 — 의도된 P3 한계(에러 UX는 P5 영속화와 함께).

### 판정: ✅ QUALITY PASS

## Step 3-B: security-auditor
→ trust-ledger.md. CRITICAL 0 · HIGH 0 · MEDIUM 0 · LOW 1(설계상 수용) · INFO 3. 차단 없음.

## 종합 판정
Spec ✅ · Quality ✅ · Security 차단 0 → **phase-complete 진행**.
특이성과: 리뷰 중 FR-7 미연결(미사용 export) 갭을 발견하여 RGR(RED→GREEN)로 UI 연결 + 캐럿 보존까지 완료. 순수 모델/DI 훅/controlled 컴포넌트 분리로 20개 테스트가 결정론적으로 고정됨.
