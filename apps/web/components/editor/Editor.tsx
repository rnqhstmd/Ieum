'use client';

// ─── P5/P6 CRDT 블록 에디터 (AC-7, FR-6 + 라이브 커서) ─────────────
// DocState 파생 EditorBlockView(id:RgaId)를 렌더한다. contenteditable은 입력 수단일
// 뿐 상태를 보유하지 않으며, 텍스트 변경은 onBlockInput(blockId,newText)으로만 전달한다.
// P6 커서: caret 이동을 50ms debounce 후 onCursorMove(blockId, offset)로 올리고(상위가
// anchorId 변환·전송), 원격 협업자 커서를 블록 안 절대 위치 오버레이로 렌더한다.

import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent, ReactNode } from 'react';
import { idKey, idEquals } from '@ieum/crdt';
import type { BlockType, EditorBlockView, RgaId } from '@ieum/crdt';
import type { CursorInfo, PresenceInfo } from '@/src/lib/realtime/protocol';
import { detectBlockTypeShortcut } from '@/src/lib/editor/crdtDocument';
import BlockTypeMenu, { BLOCK_TYPE_ITEMS } from '@/components/editor/BlockTypeMenu';

// data-block-id 셀렉터 단일 출처. 화살표 탐색·selectionchange 양쪽에서 재사용.
const blockSelector = (key: string): string => `[data-block-id="${key}"]`;

interface EditorProps {
  blocks: EditorBlockView[];
  onBlockInput: (blockId: RgaId, newText: string) => void;
  // P6 커서 (선택적 — 미주입 시 커서 비활성, 기존 호출부 호환)
  cursors?: CursorInfo[];
  presences?: PresenceInfo[];
  localClientId?: string | null;
  resolveCursorIndex?: (blockId: RgaId, anchorId: RgaId | null) => number;
  onCursorMove?: (blockId: RgaId, caretOffset: number) => void;
  // P9 구조 편집 (선택적)
  onEnter?: (blockId: RgaId, offset: number) => void;
  onBackspace?: (blockId: RgaId) => void;
  onSetType?: (blockId: RgaId, type: BlockType) => void;
}

export type ArrowDir = 'prev' | 'next';
export function resolveArrowDirection(key: string, offset: number, textLength: number): ArrowDir | null {
  if ((key === 'ArrowUp' || key === 'ArrowLeft') && offset === 0) return 'prev';
  if ((key === 'ArrowDown' || key === 'ArrowRight') && offset === textLength) return 'next';
  return null;
}

function placeCaret(el: HTMLElement, atEnd: boolean): void {
  try {
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(!atEnd);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {
    /* jsdom 등 selection 미지원 */
  }
}

/** 블록 내 특정 offset에 caret 배치(Backspace 병합 지점 복원용). */
function placeCaretAt(el: HTMLElement, offset: number): void {
  try {
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    const node = el.firstChild;
    if (node && node.nodeType === Node.TEXT_NODE) {
      range.setStart(node, Math.min(offset, node.textContent?.length ?? 0));
      range.collapse(true);
    } else {
      range.selectNodeContents(el);
      range.collapse(offset === 0);
    }
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {
    /* jsdom 등 selection 미지원 */
  }
}

/** 현재 선택 영역의 블록 내 캐럿 offset. 미지원(jsdom) 시 fallback. */
function getCaretOffset(el: HTMLElement, fallback: number): number {
  try {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      // 캐럿이 이 블록 안에 있을 때만 정밀 offset을 계산한다(el.contains 가드: 다른 블록 selection으로 인한
      // cross-block offset 오염 방지 — P6 커서, PR #12 M2). startContainer가 요소 노드(focus·placeCaret 직후의
      // P)든 텍스트 노드든, selectNodeContents(el)+setEnd(startContainer, startOffset)로 블록 시작~caret 텍스트
      // 길이를 계산하므로 시작(offset 0)·끝·중간 모두 정확하다. range.startOffset(노드 내 상대값)과 달리
      // 멀티 텍스트노드·빈 블록·IME 조합에서도 정확.
      // ※nodeType===3 가드는 placeCaret 직후(startContainer=요소노드) offset 0을 fallback(text.length)으로
      //   오판해 연속/역방향 화살표 탐색·Enter/Backspace를 깨뜨려 제거함(cross-review/PR #29).
      if (el.contains(range.startContainer)) {
        const pre = range.cloneRange();
        pre.selectNodeContents(el);
        pre.setEnd(range.startContainer, range.startOffset);
        return pre.toString().length;
      }
    }
  } catch {
    /* selection 미지원 환경 */
  }
  return fallback;
}

// 빈 블록에 타입별 희미한 라벨(empty:before placeholder) — 변환 후 블록 타입/커서 위치를 알기 쉽게.
const PH = 'empty:before:text-faint empty:before:pointer-events-none';
const BLOCK_CLASS: Record<EditorBlockView['type'], string> = {
  paragraph: 'text-[15px] leading-7 text-body whitespace-pre-wrap',
  heading1: `text-3xl font-bold text-ink mt-4 whitespace-pre-wrap ${PH} empty:before:content-['제목_1']`,
  heading2: `text-2xl font-semibold text-ink mt-3 whitespace-pre-wrap ${PH} empty:before:content-['제목_2']`,
  heading3: `text-xl font-semibold text-ink mt-2 whitespace-pre-wrap ${PH} empty:before:content-['제목_3']`,
  bullet: `text-[15px] leading-7 text-body whitespace-pre-wrap ${PH} empty:before:content-['리스트']`,
  code: `text-[14px] leading-7 font-mono text-ink bg-hover/60 rounded px-2 py-1 whitespace-pre-wrap ${PH} empty:before:content-['코드']`,
};

interface BlockViewProps {
  block: EditorBlockView;
  onInput: (e: FormEvent<HTMLElement>) => void;
  onCompositionStart: () => void;
  onCompositionEnd: (e: { currentTarget: HTMLElement }) => void;
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
  onCaret: (el: HTMLElement) => void; // P6: caret 이동 캡처(keyUp/click)
  onFocus: () => void;
  onBlur: () => void;
  onBeforeEnter: (el: HTMLElement) => void; // beforeinput insertParagraph(IME 안전 Enter 분할)
  menuNode: ReactNode; // 블록 타입 드롭다운(열린 블록에만 전달)
  overlays: ReactNode; // P6: 원격 커서 오버레이(contentEditable 형제로 렌더 — 편집 대상 아님)
}

function BlockView({
  block,
  onInput,
  onCompositionStart,
  onCompositionEnd,
  onKeyDown,
  onCaret,
  onFocus,
  onBlur,
  onBeforeEnter,
  menuNode,
  overlays,
}: BlockViewProps) {
  const ref = useRef<HTMLElement | null>(null);
  const beforeEnterRef = useRef(onBeforeEnter);
  beforeEnterRef.current = onBeforeEnter;
  const setRef = (el: HTMLElement | null) => {
    ref.current = el;
  };

  // 모델 → DOM 단방향 반영. 동일하면 건드리지 않아 캐럿 점프를 피한다.
  useEffect(() => {
    const el = ref.current;
    if (el && el.textContent !== block.text) el.textContent = block.text;
  }, [block.text]);

  // ⚠️ IME 안전 Enter: 한글 조합 중 keydown은 key='Process'(keyCode 229)라 'Enter'로 잡히지 않는다.
  // beforeinput의 insertParagraph는 조합 확정 후 발생하므로 한·영 무관하게 Enter를 포착한다.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e: Event) => {
      if ((e as InputEvent).inputType === 'insertParagraph') {
        e.preventDefault();
        beforeEnterRef.current(el);
      }
    };
    el.addEventListener('beforeinput', handler);
    return () => el.removeEventListener('beforeinput', handler);
  }, []);

  const common = {
    'data-block-id': idKey(block.id),
    contentEditable: true,
    suppressContentEditableWarning: true,
    onInput,
    onCompositionStart,
    onCompositionEnd,
    onKeyDown,
    onKeyUp: (e: KeyboardEvent<HTMLElement>) => onCaret(e.currentTarget),
    onClick: (e: { currentTarget: HTMLElement }) => onCaret(e.currentTarget),
    onFocus,
    onBlur,
    className: `${BLOCK_CLASS[block.type]} px-1 outline-none focus:bg-hover/40 rounded`,
  } as const;

  const editable =
    block.type === 'heading1' ? (
      <h1 ref={setRef} {...common} />
    ) : block.type === 'heading2' ? (
      <h2 ref={setRef} {...common} />
    ) : block.type === 'heading3' ? (
      <h3 ref={setRef} {...common} />
    ) : block.type === 'bullet' ? (
      <ul className="list-disc pl-6">
        <li ref={setRef} {...common} />
      </ul>
    ) : (
      <p ref={setRef} {...common} />
    );

  // 커서 오버레이는 contentEditable 형제(absolute)로 — 편집 콘텐츠/textContent 관리에 영향 없음.
  return (
    <div className="relative">
      {editable}
      {menuNode}
      {overlays}
    </div>
  );
}

export default function Editor({
  blocks,
  onBlockInput,
  cursors = [],
  presences = [],
  localClientId = null,
  resolveCursorIndex,
  onCursorMove,
  onEnter,
  onBackspace,
  onSetType,
}: EditorProps) {
  // IME 조합 추적 — 조합 중 input/cursor는 무시한다.
  const composing = useRef(false);
  const cursorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusedBlock = useRef<string | null>(null);
  const pendingSplitFocus = useRef<string | null>(null); // Enter 분할 후 포커스 이동 대상(원본 blockId)
  const pendingMergeFocus = useRef<{ key: string; offset: number } | null>(null); // Backspace 병합 후 이전 블록 caret
  const [menu, setMenu] = useState<{ blockKey: string; index: number } | null>(null);

  // 메뉴에서 타입 선택 → 타입 적용 + 트리거 문자('#'/'/') 제거 + 메뉴 닫기 + caret 유지.
  const selectType = (blockId: RgaId, type: BlockType) => {
    onSetType?.(blockId, type);
    onBlockInput(blockId, '');
    setMenu(null);
    const el = document.querySelector<HTMLElement>(blockSelector(idKey(blockId)));
    if (el) {
      el.focus();
      placeCaret(el, false);
    }
  };

  const handleInput = (blockId: RgaId, e: FormEvent<HTMLElement>) => {
    if (composing.current) return;
    const newText = e.currentTarget.textContent ?? '';
    // 빈 블록 트리거: '/' 또는 '#' 단독 입력 → 블록 타입 드롭다운
    if (newText === '/' || newText === '#') {
      setMenu({ blockKey: idKey(blockId), index: 0 });
      onBlockInput(blockId, newText);
      return;
    }
    const shortcut = detectBlockTypeShortcut(newText);
    if (shortcut) {
      setMenu(null);
      onBlockInput(blockId, newText.slice(shortcut.consumed));
      onSetType?.(blockId, shortcut.type);
      return;
    }
    if (menu) setMenu(null); // 트리거 외 입력 시 메뉴 닫기
    onBlockInput(blockId, newText);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLElement>, block: EditorBlockView) => {
    // 블록 타입 메뉴가 열려 있으면 키를 가로챈다(↑↓ 이동, Enter 선택, Esc 닫기).
    if (menu && menu.blockKey === idKey(block.id)) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMenu((m) => (m ? { ...m, index: (m.index + 1) % BLOCK_TYPE_ITEMS.length } : m));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMenu((m) => (m ? { ...m, index: (m.index - 1 + BLOCK_TYPE_ITEMS.length) % BLOCK_TYPE_ITEMS.length } : m));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const item = BLOCK_TYPE_ITEMS[menu.index];
        if (item) selectType(block.id, item.type);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMenu(null);
        return;
      }
    }
    // Enter는 여기서 처리하지 않는다 — 한글 조합 중 keydown은 key='Process'(keyCode 229)라 'Enter'로
    // 잡히지 않는다. 대신 BlockView의 beforeinput(insertParagraph)에서 IME 무관하게 분할한다.
    if (composing.current) return; // Backspace·화살표는 조합 중 IME가 처리하도록 무시한다
    if (e.key === 'Backspace') {
      const offset = getCaretOffset(e.currentTarget, block.text.length);
      if (offset === 0) {
        e.preventDefault();
        const idx = blocks.findIndex((bl) => idEquals(bl.id, block.id));
        const prev = blocks[idx - 1];
        if (prev) pendingMergeFocus.current = { key: idKey(prev.id), offset: prev.text.length };
        onBackspace?.(block.id);
      }
    }
    // 화살표 블록 간 탐색 (FR-1~8). 로컬 DOM 포커스 이동만 — onCursorMove를 직접 호출하지 않는다(BR-1).
    // 단 placeCaret이 대상 블록에 selection을 설정하면 selectionchange→scheduleCursor 경로로 커서 위치가
    // 브로드캐스트된다. 이는 커서가 실제로 새 블록으로 이동한 것을 반영하는 P6의 정상 동작이다(BR-1 충족).
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const offset = getCaretOffset(e.currentTarget, block.text.length);
      const dir = resolveArrowDirection(e.key, offset, block.text.length);
      if (!dir) return;
      const idx = blocks.findIndex((b) => idEquals(b.id, block.id));
      const target = dir === 'prev' ? blocks[idx - 1] : blocks[idx + 1];
      if (!target) return;
      const targetEl = document.querySelector<HTMLElement>(blockSelector(idKey(target.id)));
      if (targetEl) {
        e.preventDefault();
        targetEl.focus();
        placeCaret(targetEl, dir === 'prev');
      }
    }
  };

  // P6 FR-2/BR-3: caret 이동 → 50ms debounce → onCursorMove. FR-8: 포커스 블록만. composing 가드.
  const scheduleCursor = (block: EditorBlockView, el: HTMLElement) => {
    if (!onCursorMove || composing.current) return;
    if (focusedBlock.current !== idKey(block.id)) return; // FR-8
    const len = (el.textContent ?? '').length;
    const offset = Math.max(0, Math.min(getCaretOffset(el, len), len)); // M2: clamp
    if (cursorTimer.current) clearTimeout(cursorTimer.current);
    cursorTimer.current = setTimeout(() => onCursorMove(block.id, offset), 50);
  };

  const overlaysFor = (block: EditorBlockView): ReactNode =>
    cursors
      // blockId가 이 블록과 일치하는 커서만 렌더 → 존재하지 않는/삭제된 blockId 커서는 어느 블록에도
      // 매칭되지 않아 자동 제외(C5/C12 유령 블록 방어). 자기 커서 제외(AC-7)는 localClientId 비교 —
      // localClientId=null(join-ack 전)이어도 서버가 발신자를 제외(BR-8)하므로 자기 커서 수신 경로 없음(C11).
      .filter((c) => idEquals(c.blockId, block.id) && c.clientId !== localClientId)
      .map((c) => {
        const info = presences.find((p) => p.clientId === c.clientId);
        if (!info) return null; // lookup 실패 시 skip(presence-leave 1프레임 불일치 방어)
        const idx = resolveCursorIndex ? resolveCursorIndex(block.id, c.anchorId) : 0;
        // left를 `${idx}ch`로 근사한다. ch는 '0' 글자 폭 기준이라 가변폭 폰트에서는 위치가
        // 어긋난다(walking skeleton 수용 — 픽셀 정확도는 비목표). 정밀 좌표는 후속에서
        // Range.getBoundingClientRect로 측정한다(PR #12 리뷰).
        return (
          <span
            key={c.clientId}
            data-cursor-client-id={c.clientId}
            data-color={info.color}
            aria-hidden="true"
            className="pointer-events-none absolute top-0 select-none"
            style={{ left: `calc(${idx}ch + 0.25rem)` }}
          >
            <span
              className="inline-block h-5 w-0.5 align-text-bottom"
              style={{ backgroundColor: info.color }}
            />
            <span
              className="ml-0.5 whitespace-nowrap rounded px-1 align-top text-[10px] leading-none text-white"
              style={{ backgroundColor: info.color }}
            >
              {info.displayName}
            </span>
          </span>
        );
      });

  // FR-1: keyUp/click 외 selectionchange(전역 이벤트)에서도 포커스 블록의 caret을 캡처한다
  // (마우스 드래그 선택·화살표 외 선택 변경 포함). cursorTimer는 언마운트 시 정리(CR-2).
  useEffect(() => {
    if (!onCursorMove) return;
    const onSelectionChange = () => {
      const key = focusedBlock.current;
      if (!key) return;
      const block = blocks.find((b) => idKey(b.id) === key);
      if (!block) return;
      const el = document.querySelector(blockSelector(key));
      if (el instanceof HTMLElement) scheduleCursor(block, el);
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange);
      if (cursorTimer.current) clearTimeout(cursorTimer.current);
    };
    // blocks/onCursorMove 변경 시 재구독(최신 scheduleCursor 클로저 캡처). 나머지는 안정 ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, onCursorMove]);

  // 구조 편집(Enter 분할 / Backspace 병합) 후 caret 이동 — 이게 없으면 커서가 원래 자리에 남는다.
  useEffect(() => {
    // Enter 분할 → 새(다음) 블록 맨앞. splitBlock은 원본 블록 바로 다음에 새 블록을 넣는다.
    const splitFrom = pendingSplitFocus.current;
    if (splitFrom) {
      pendingSplitFocus.current = null;
      const idx = blocks.findIndex((bl) => idKey(bl.id) === splitFrom);
      const next = blocks[idx + 1];
      const el = next ? document.querySelector<HTMLElement>(blockSelector(idKey(next.id))) : null;
      if (el) {
        el.focus();
        placeCaret(el, false); // 새 블록 맨 앞
      }
      return;
    }
    // Backspace 병합 → 이전 블록의 병합 지점(원래 끝)으로 caret 이동.
    const merge = pendingMergeFocus.current;
    if (merge) {
      pendingMergeFocus.current = null;
      const el = document.querySelector<HTMLElement>(blockSelector(merge.key));
      if (el) {
        el.focus();
        placeCaretAt(el, merge.offset);
      }
    }
  }, [blocks]);

  return (
    <div role="group" aria-label="페이지 본문" className="space-y-1">
      {blocks.map((b) => (
        <BlockView
          key={idKey(b.id)}
          block={b}
          onInput={(e) => handleInput(b.id, e)}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={(e) => {
            composing.current = false;
            onBlockInput(b.id, e.currentTarget.textContent ?? '');
          }}
          onKeyDown={(e) => handleKeyDown(e, b)}
          onBeforeEnter={(el) => {
            pendingSplitFocus.current = idKey(b.id);
            onEnter?.(b.id, getCaretOffset(el, b.text.length));
          }}
          menuNode={
            menu && menu.blockKey === idKey(b.id) ? (
              <BlockTypeMenu
                activeIndex={menu.index}
                onSelect={(t) => selectType(b.id, t)}
                onHover={(i) => setMenu((m) => (m ? { ...m, index: i } : m))}
              />
            ) : null
          }
          onCaret={(el) => scheduleCursor(b, el)}
          onFocus={() => {
            focusedBlock.current = idKey(b.id);
          }}
          onBlur={() => {
            if (focusedBlock.current === idKey(b.id)) focusedBlock.current = null;
          }}
          overlays={overlaysFor(b)}
        />
      ))}
    </div>
  );
}
