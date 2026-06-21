# 설계 — P3 블록 에디터 (US-EDIT-01~03)

## 설계 규모: 중형 (신규 4 + 수정 1, 순수로직+React 컴포넌트+훅)

## 설계 원칙

1. **모델이 진실 원천 (architecture.md 준수)**: 편집은 순수 함수 블록 도큐먼트를 거쳐 새 배열을 만들고, 컴포넌트는 그 배열에서 단방향으로 파생 렌더한다. DOM/contenteditable은 입력 수단일 뿐 상태를 보유하지 않는다.
2. **격리로 testability 확보**: 순수 로직(document.ts)·훅(useAutosave)·컴포넌트(Editor)를 분리한다. Editor는 **controlled component**(props: `blocks`, `onChange`)로 두어 내부 상태가 없으므로 RTL로 결정론적 검증이 가능하다.
3. **CRDT 교체 가능성**: 블록 도큐먼트의 연산 인터페이스(`createEmptyDocument/updateText/splitBlock/mergeWithPrevious/setType`)는 추후 P4b 2-level 블록 RGA 구현으로 교체될 수 있도록 순수 함수 시그니처로 고정한다. `EditorBlock.type`은 `@ieum/crdt`의 `BlockType`을 재사용한다.
4. **영속화 격리 (Q1=A)**: 자동저장은 `save-port`(주입된 `save` 콜백) 뒤로 격리한다. P3은 메커니즘만, 실제 백엔드는 P5.

## 변경 범위

### 신규
- `apps/web/src/lib/editor/document.ts` — 순수 블록 도큐먼트 모델 + 연산 (AC-1~12)
- `apps/web/src/lib/editor/useAutosave.ts` — debounce 자동저장 훅 (AC-17~19)
- `apps/web/components/editor/Editor.tsx` — controlled 블록 에디터 컴포넌트 (AC-13~16)
- `apps/web/components/editor/EditorContainer.tsx` — (Should/FR-8) 상태+자동저장 보유 client 래퍼

### 수정
- `apps/web/app/(app)/page/[pageId]/page.tsx` — (Should/FR-8) 플레이스홀더 → `<EditorContainer pageId=.../>` 통합

### 테스트 (신규)
- `apps/web/src/lib/editor/__tests__/document.test.ts` (AC-1~12)
- `apps/web/src/lib/editor/__tests__/useAutosave.test.ts` (AC-17~19)
- `apps/web/components/editor/__tests__/Editor.test.tsx` (AC-13~16)

## 인터페이스 설계

### document.ts (순수)
```ts
import type { BlockType } from '@ieum/crdt';

export interface EditorBlock { id: string; type: BlockType; text: string; }
export type EditorDoc = EditorBlock[];

// 내부: newBlockId() — crypto.randomUUID() 우선, 없으면 카운터 폴백. 테스트는 반환된 id로 검증(예측 불필요).

export function createEmptyDocument(): EditorDoc;                       // AC-1
export function updateText(doc: EditorDoc, id: string, text: string): EditorDoc; // AC-2 (불변 — 새 배열)
export function splitBlock(doc: EditorDoc, id: string, caret: number):  // AC-3,4,5
  { doc: EditorDoc; newBlockId: string };
export function mergeWithPrevious(doc: EditorDoc, id: string):          // AC-6,7,8
  { doc: EditorDoc; caretBlockId: string; caretOffset: number } | null; // 첫 블록이면 null
export function setType(doc: EditorDoc, id: string, type: BlockType): EditorDoc;  // AC-9
export function applyMarkdownShortcut(doc: EditorDoc, id: string): EditorDoc | null; // AC-10,11,12 (미매칭 null)
```
- **splitBlock 타입 규칙**: 새(뒤) 블록 type = (현재가 `bullet`이면 `bullet`, 아니면 `paragraph`). 현재 블록 type은 유지. (AC-4 heading→paragraph, AC-5 bullet→bullet, FR-9)
- **mergeWithPrevious**: 대상 블록의 직전 블록 prev로 병합. `prev.text + cur.text`, cur 제거. `caretOffset = prev.text.length`(병합 전 길이). 직전 블록이 없으면(첫 블록) `null`.
- **applyMarkdownShortcut 매핑**: `'# '→heading1`, `'## '→heading2`, `'### '→heading3`, `'- '→bullet`. 매칭 시 type 변경 + 접두사 제거, 미매칭 `null`. 이미 해당 타입이어도 접두사만 있으면 변환(단순화: paragraph 가정 불필요, 접두사 기준).

### useAutosave.ts
```ts
export type SaveStatus = 'idle' | 'saving' | 'saved';
export function useAutosave<T>(
  save: (data: T) => void | Promise<void>,
  delayMs = 500,
): { status: SaveStatus; notifyChange: (data: T) => void };
```
- `notifyChange(data)`: 이전 타이머 취소 후 `delayMs` 타이머 재설정, 최신 data를 ref에 보관. (연속 변경 = 마지막 1회, AC-18)
- 타이머 만료: `status='saving'` → `await save(latest)` → `status='saved'`. (AC-17 1회, AC-19 전이)
- 구현: `useRef`(timer, latestData) + `useState`(status) + `useCallback`(notifyChange 안정 참조) + 언마운트 cleanup(타이머 클리어).

### Editor.tsx (controlled)
```ts
interface EditorProps { blocks: EditorBlock[]; onChange: (blocks: EditorBlock[]) => void; }
```
- 각 블록을 타입별 시맨틱 태그로 렌더(`contentEditable`): heading1~3 → `<h1|h2|h3>`, bullet → `<ul><li>`, paragraph → `<p>`(또는 div[role]). 각 요소에 `data-block-id`.
- `onInput`: `el.textContent` 읽어 `updateText` → `onChange`. (AC-14)
- `onKeyDown`:
  - `Enter`(shift 아님): `preventDefault`, 캐럿 offset 계산 → `splitBlock` → `onChange`, 새 블록 포커스 예약. (AC-15)
  - `Backspace`: 캐럿이 offset 0(빈 블록 포함)이면 `preventDefault`, `mergeWithPrevious` → null 아니면 `onChange` + 캐럿 복원 예약. (AC-16)
- **캐럿 offset 헬퍼**: `window.getSelection()` 기반. 미지원/없음 시 Enter는 `textContent.length`(끝) 폴백, Backspace는 빈 블록(len 0)=start로 처리. (jsdom 한계 대응)
- **포커스/캐럿 복원**: `pendingFocusRef`(blockId, offset) + `useEffect`로 렌더 후 best-effort 복원. 테스트는 onChange의 블록 개수만 검증.
- 렌더는 `blocks` prop에서만 파생(AC-13). React key=block.id로 안정 렌더(불필요 리마운트로 인한 IME/포커스 손실 방지).

### EditorContainer.tsx (Should, FR-8)
- `'use client'`. `useState<EditorBlock[]>(createEmptyDocument())` + `useAutosave(savePort)`.
- `savePort` = P3 임시 no-op/콘솔(주입 가능). onChange → setState + notifyChange. status 배지 표시.
- `[pageId]/page.tsx`(server)는 pageId만 넘겨 렌더.

## 구현 순서 (RGR 태스크 — 각 RED→GREEN→REFACTOR)
- **T1**: document.ts — createEmptyDocument, updateText (AC-1, AC-2)
- **T2**: splitBlock (AC-3, AC-4, AC-5)
- **T3**: mergeWithPrevious (AC-6, AC-7, AC-8)
- **T4**: setType + applyMarkdownShortcut (AC-9, AC-10, AC-11, AC-12)
- **T5**: useAutosave (AC-17, AC-18, AC-19)
- **T6**: Editor 렌더+타이핑 (AC-13, AC-14)
- **T7**: Editor Enter/Backspace (AC-15, AC-16)
- **T8**: (Should) EditorContainer + 라우트 통합 (FR-8) — 신규 AC 없음, tsc+빌드 스모크

## 위험/주의
- jsdom의 Selection/caret API 한계 → 순수 모델(T1~T4)로 분할/병합 로직을 완전 커버하고, 컴포넌트 테스트(T6,T7)는 결정론적 `fireEvent`로 onChange 결과만 검증. 실브라우저 캐럿 복원은 best-effort.
- contenteditable controlled 렌더 시 커서 점프 가능 → key=block.id 고정 + 입력 중 불필요 재설정 회피로 완화.
- `crypto.randomUUID` 미존재 환경 → 카운터 폴백.

## Testability 평가 (test-architect)

### 컴포넌트별 테스트 전략
#### document.ts (순수 함수)
- 단위 테스트: 입력 doc → 출력 doc 직접 단언. 외부 의존 0. 새 블록 id는 반환값(newBlockId/caretBlockId)으로 검증해 비결정성 회피.
- 모의 대상: 없음. 격리 전략: 순수 함수(부수효과 없음).
- AC 매핑: AC-1~12.

#### useAutosave.ts (훅)
- 단위 테스트: `renderHook` + `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync`. save는 `vi.fn()` 스파이.
- 모의 대상: 타이머(fake), save 콜백(spy). 격리 전략: save-port 주입(DI).
- AC 매핑: AC-17(1회), AC-18(연속→1회), AC-19(status 전이).

#### Editor.tsx (controlled 컴포넌트)
- 단위 테스트: RTL `render` + `fireEvent.input/keyDown`. controlled라 onChange 스파이로 결과 단언.
- 모의 대상: onChange(spy). 격리 전략: 무상태 controlled — 부모 상태/네트워크 없음.
- AC 매핑: AC-13(파생렌더), AC-14(타이핑), AC-15(Enter), AC-16(Backspace).
- 한계: 실브라우저 selection/caret은 jsdom 미지원 → 폴백 경로로 결정론적 검증(분할/병합 로직 자체는 document.ts에서 완전 커버).

#### EditorContainer.tsx (Should)
- tsc + 빌드 스모크로 통합 검증(신규 AC 없음).

### Testability Score: 9/10
- 순수 모델·DI 훅·controlled 컴포넌트로 12/16 AC가 부수효과 0 환경에서 검증되고, 나머지도 spy/fake로 결정론적. 감점 1: contenteditable 실브라우저 캐럿은 단위로 완전 재현 불가(설계상 모델 테스트로 우회).

### 판정
✅ TESTABILITY PASS (9/10 ≥ 7) — red-writer는 위 격리 전략(순수함수/renderHook+fakeTimers/RTL controlled)에 따라 실패 테스트를 작성한다.
