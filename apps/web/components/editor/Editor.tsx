'use client';

// ─── P5/P6 CRDT 블록 에디터 (AC-7, FR-6 + 라이브 커서) ─────────────
// DocState 파생 EditorBlockView(id:RgaId)를 렌더한다. contenteditable은 입력 수단일
// 뿐 상태를 보유하지 않으며, 텍스트 변경은 onBlockInput(blockId,newText)으로만 전달한다.
// P6 커서: caret 이동을 50ms debounce 후 onCursorMove(blockId, offset)로 올리고(상위가
// anchorId 변환·전송), 원격 협업자 커서를 블록 안 절대 위치 오버레이로 렌더한다.

import { useEffect, useRef } from 'react';
import type { FormEvent, KeyboardEvent, ReactNode } from 'react';
import { idKey, idEquals } from '@ieum/crdt';
import type { EditorBlockView, RgaId } from '@ieum/crdt';
import type { CursorInfo, PresenceInfo } from '@/src/lib/realtime/protocol';

interface EditorProps {
  blocks: EditorBlockView[];
  onBlockInput: (blockId: RgaId, newText: string) => void;
  // P6 커서 (선택적 — 미주입 시 커서 비활성, 기존 호출부 호환)
  cursors?: CursorInfo[];
  presences?: PresenceInfo[];
  localClientId?: string | null;
  resolveCursorIndex?: (blockId: RgaId, anchorId: RgaId | null) => number;
  onCursorMove?: (blockId: RgaId, caretOffset: number) => void;
}

/** 현재 선택 영역의 블록 내 캐럿 offset. 미지원(jsdom) 시 fallback. */
function getCaretOffset(el: HTMLElement, fallback: number): number {
  try {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      // M2: startContainer가 블록 내 텍스트노드일 때만 startOffset이 가시 index. 그 외(빈 블록 등)는 fallback.
      if (el.contains(range.startContainer) && range.startContainer.nodeType === Node.TEXT_NODE) {
        return range.startOffset;
      }
    }
  } catch {
    /* selection 미지원 환경 */
  }
  return fallback;
}

const BLOCK_CLASS: Record<EditorBlockView['type'], string> = {
  paragraph: 'text-[15px] leading-7 text-body whitespace-pre-wrap',
  heading1: 'text-3xl font-bold text-ink mt-4 whitespace-pre-wrap',
  heading2: 'text-2xl font-semibold text-ink mt-3 whitespace-pre-wrap',
  heading3: 'text-xl font-semibold text-ink mt-2 whitespace-pre-wrap',
  bullet: 'text-[15px] leading-7 text-body whitespace-pre-wrap',
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
  overlays,
}: BlockViewProps) {
  const ref = useRef<HTMLElement | null>(null);
  const setRef = (el: HTMLElement | null) => {
    ref.current = el;
  };

  // 모델 → DOM 단방향 반영. 동일하면 건드리지 않아 캐럿 점프를 피한다.
  useEffect(() => {
    const el = ref.current;
    if (el && el.textContent !== block.text) el.textContent = block.text;
  }, [block.text]);

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
}: EditorProps) {
  // IME 조합 추적 — 조합 중 input/cursor는 무시한다.
  const composing = useRef(false);
  const cursorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusedBlock = useRef<string | null>(null);

  const handleInput = (blockId: RgaId, e: FormEvent<HTMLElement>) => {
    if (composing.current) return;
    onBlockInput(blockId, e.currentTarget.textContent ?? '');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLElement>, block: EditorBlockView) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Backspace') {
      const offset = getCaretOffset(e.currentTarget, block.text.length);
      if (offset === 0) e.preventDefault();
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
      const el = document.querySelector(`[data-block-id="${key}"]`);
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
