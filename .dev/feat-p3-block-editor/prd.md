# PRD — P3 블록 에디터 (US-EDIT-01~03)

## 배경

P2까지 페이지 CRUD·트리·아카이브·이름/아이콘이 완성됐고, P4에서 인라인 문자 RGA(CRDT 코어)가 머지됐다. 그러나 사용자가 실제로 **글을 쓸 수 있는 에디터**는 아직 없다 (`apps/web/components/editor/`는 빈 디렉토리, `page/[pageId]` 라우트는 "[에디터 — Phase 2]" 플레이스홀더).

P3은 외부 라이브러리 없이 브라우저 `contenteditable`을 직접 활용한 **블록 단위 에디터**를 구현한다. `context/page/architecture.md`의 "블록 기반 contenteditable 에디터" 절을 따른다: 블록 타입 paragraph/heading1~3/bullet, Enter→새 블록, Backspace→빈 블록 삭제(병합), 렌더링은 문서 모델에서 파생.

## 범위 결정 (제약 기반)

이 phase가 의존할 수 없는 것:
- **블록 레벨 RGA(P4b 미구현)**: 블록 순서를 관리하는 외부 RGA 리듀서가 아직 없다. → P3의 문서 모델은 **순수 함수 블록 도큐먼트(plain block-document)**로 구현하되, 추후 CRDT 백엔드로 교체 가능하도록 인터페이스를 격리한다 (rework 최소화).
- **콘텐츠 백엔드 영속화(P5 미구현)**: `Page` 엔티티에 content 필드가 없고, 콘텐츠는 `CrdtOp`/`Snapshot`(P5) 소관이다. → P3의 자동저장은 **debounce 메커니즘 + 저장 상태 표시**까지 구현하고, 실제 백엔드 영속화 호출은 **save-port(인터페이스)** 뒤로 격리하여 P5에서 연결한다.

이 결정의 핵심 효과: P3은 **순수 프론트엔드 + 순수 로직** phase가 되어 TDD에 매우 적합하고, CRDT 아키텍처(RGA가 진실 원천, 콘텐츠=op 영속화)와 상충하지 않으며, 던져버리는(throwaway) 코드가 없다.

## 요구사항

### [Must]
- **FR-1 (US-EDIT-01)** 블록 단위 contenteditable 에디터: 사용자가 블록에 텍스트를 입력·수정할 수 있다.
- **FR-2 (US-EDIT-01)** Enter 키로 현재 블록을 캐럿 위치 기준 분할하여 새 블록을 만든다.
- **FR-3 (US-EDIT-01)** 블록 시작에서 Backspace 시 이전 블록과 병합한다(빈 블록은 삭제됨). 첫 블록에서는 no-op.
- **FR-4 (US-EDIT-03)** 기본 블록 타입 지원: paragraph / heading1~3 / bullet. `@ieum/crdt`의 `BlockType`을 재사용한다. 타입별로 시맨틱 태그(h1~h3, li 등)로 렌더링된다.
- **FR-5 (US-EDIT-02)** 자동저장 메커니즘: 편집 후 debounce 500ms가 경과하면 save-port가 정확히 1회 호출되고, 저장 상태('idle'/'saving'/'saved')가 표시된다. (실제 백엔드 영속화는 P5)
- **FR-6** 문서 모델은 순수 함수로 분리되어 렌더링의 진실 원천이 된다 (DOM이 아닌 모델이 진실 원천). 모든 편집은 모델 → 렌더 단방향.

### [Should]
- **FR-7 (US-EDIT-03)** 마크다운 단축: 블록 시작에 `# `/`## `/`### `/`- ` 입력 시 해당 블록 타입으로 변환되고 접두사가 제거된다.
- **FR-8** 에디터를 `page/[pageId]` 라우트에 통합하여 화면에서 편집 가능하게 한다 (인메모리 문서, 로드/영속화는 P5).

### [Could]
- **FR-9** Enter 타입 상속 규칙: heading 다음 새 블록은 paragraph, bullet 다음 새 블록은 bullet 유지.

### Out-of-Scope (명시적 비범위)
- 슬래시(/) 메뉴, 이미지·파일 블록 (status.md 명시).
- 블록 레벨 CRDT 동기화 / 2-level 블록 RGA (P4b).
- 콘텐츠 백엔드 영속화·페이지 로드 시 콘텐츠 복원 (P5: CrdtOp/Snapshot).
- 협업 모드 실시간 op 전송 (P5), presence 커서 (P6).
- 드래그앤드롭 블록 재정렬, 이모지 피커 (post-MVP).

## 수용 기준 (Given-When-Then)

### 순수 문서 모델 (apps/web/src/lib/editor/document.ts)

**AC-1: 빈 문서 생성**
- Given: 새 페이지를 연 직후 초기 문서가 필요하다
- When: `createEmptyDocument()`를 호출한다
- Then: 길이 1인 배열이 반환되고, 그 블록의 `type === 'paragraph'`, `text === ''`, `id`가 비어있지 않은 문자열이다

**AC-2: 텍스트 갱신(불변성)**
- Given: 블록 B1(text='a')과 B2(text='b')로 구성된 문서
- When: `updateText(doc, B1.id, 'abc')`를 호출한다
- Then: 반환 배열에서 B1.text === 'abc', B2.text === 'b'(불변), 반환값은 입력 배열과 다른 참조(`!== doc`)다

**AC-3: Enter 블록 분할(중간 캐럿)**
- Given: 블록 B(type='paragraph', text='hello')
- When: `splitBlock(doc, B.id, 2)`를 호출한다
- Then: B.text === 'he'이고, B 바로 뒤에 text==='llo'인 새 블록이 삽입되며, 반환 객체의 `newBlockId`가 그 새 블록의 id와 같다

**AC-4: Enter 후 새 블록 타입 — heading은 paragraph로**
- Given: 블록 B(type='heading1', text='Title'), 캐럿이 끝(offset=5)
- When: `splitBlock(doc, B.id, 5)`를 호출한다
- Then: 새 블록의 `type === 'paragraph'`이고 B의 `type === 'heading1'`은 유지된다

**AC-5: Enter 후 새 블록 타입 — bullet은 bullet 유지**
- Given: 블록 B(type='bullet', text='item'), 캐럿이 끝(offset=4)
- When: `splitBlock(doc, B.id, 4)`를 호출한다
- Then: 새 블록의 `type === 'bullet'`이다

**AC-6: Backspace 병합(이전 블록으로)**
- Given: 블록 A(text='foo')와 그 뒤 블록 B(text='bar')
- When: `mergeWithPrevious(doc, B.id)`를 호출한다
- Then: A.text === 'foobar', 문서에서 B가 제거되어 길이가 1 줄고, 반환 객체의 `caretBlockId === A.id`이고 `caretOffset === 3`이다

**AC-7: 첫 블록 Backspace는 no-op**
- Given: 문서의 첫 블록 F
- When: `mergeWithPrevious(doc, F.id)`를 호출한다
- Then: `null`이 반환된다(병합할 이전 블록 없음)

**AC-8: 빈 블록 Backspace는 그 블록을 삭제**
- Given: 블록 A(text='x')와 그 뒤 빈 블록 B(text='')
- When: `mergeWithPrevious(doc, B.id)`를 호출한다
- Then: B가 제거되고 A.text === 'x'(불변), `caretBlockId === A.id`, `caretOffset === 1`이다

**AC-9: 블록 타입 변경**
- Given: 블록 B(type='paragraph', text='hi')
- When: `setType(doc, B.id, 'heading2')`를 호출한다
- Then: B.type === 'heading2', B.text === 'hi'(불변)이다

**AC-10: 마크다운 단축 — heading**
- Given: 블록 B(type='paragraph', text='# Title')
- When: `applyMarkdownShortcut(doc, B.id)`를 호출한다
- Then: B.type === 'heading1', B.text === 'Title'(접두사 '# ' 제거)이다

**AC-11: 마크다운 단축 — bullet**
- Given: 블록 B(type='paragraph', text='- milk')
- When: `applyMarkdownShortcut(doc, B.id)`를 호출한다
- Then: B.type === 'bullet', B.text === 'milk'이다

**AC-12: 마크다운 단축 미매칭은 no-op**
- Given: 블록 B(type='paragraph', text='plain text')
- When: `applyMarkdownShortcut(doc, B.id)`를 호출한다
- Then: `null`이 반환된다

### 에디터 컴포넌트 (apps/web/components/editor/Editor.tsx)

**AC-13: 모델에서 파생 렌더링**
- Given: blocks=[{heading1,'Title'},{paragraph,'body'},{bullet,'item'}]로 Editor를 렌더한다
- When: 초기 렌더가 완료된다
- Then: 'Title'이 h1 요소로, 'body'가 문단 요소로, 'item'이 리스트아이템(`role="listitem"` 또는 li)으로 표시된다

**AC-14: 타이핑이 onChange로 전달**
- Given: 빈 paragraph 블록 1개로 Editor를 렌더하고 onChange 스파이를 전달한다
- When: 해당 블록에 'hello'를 입력(input 이벤트)한다
- Then: onChange가 호출되고 마지막 호출 인자의 해당 블록 text === 'hello'이다

**AC-15: Enter가 블록을 추가**
- Given: 블록 1개(text='ab', 캐럿 끝)로 Editor를 렌더한다
- When: Enter 키를 누른다
- Then: onChange 마지막 인자의 블록 개수가 2이다

**AC-16: 빈 블록에서 Backspace가 블록을 제거**
- Given: 블록 2개([text='a'],[text=''(빈), 캐럿 offset 0])로 Editor를 렌더한다
- When: 두 번째 블록에서 Backspace를 누른다
- Then: onChange 마지막 인자의 블록 개수가 1이다

### 자동저장 훅 (apps/web/src/lib/editor/useAutosave.ts)

**AC-17: debounce 후 1회 저장**
- Given: `useAutosave(save, 500)` 훅을 렌더하고 가짜 타이머를 사용한다
- When: 콘텐츠를 1회 변경한 뒤 타이머를 500ms 진행시킨다
- Then: save가 정확히 1회 호출된다

**AC-18: 연속 변경은 마지막 기준 1회만 저장**
- Given: `useAutosave(save, 500)`, 가짜 타이머
- When: 변경 → 300ms 경과 → 다시 변경 → 추가로 500ms 경과
- Then: save가 정확히 1회 호출되고 마지막 콘텐츠로 호출된다

**AC-19: 저장 상태 전이**
- Given: `useAutosave(save, 500)`가 status를 노출한다(초기 'idle')
- When: 콘텐츠 변경 후 debounce가 만료되어 save(Promise)가 진행·완료된다
- Then: 저장 진행 중 status === 'saving'였다가 완료 후 status === 'saved'가 된다

## 확인이 필요한 사항 (해소됨)

**Q1 — US-EDIT-02 자동저장의 영속화 처리 → [결정: 후보 A]**
debounce 메커니즘(500ms) + 저장 상태 표시까지 P3에서 구현하고, 실제 백엔드 호출은 **save-port 인터페이스** 뒤로 격리하여 P5(CrdtOp/Snapshot)에서 연결한다. AC-17~19가 이 결정을 반영한다. (사용자 승인 2026-06-18)
