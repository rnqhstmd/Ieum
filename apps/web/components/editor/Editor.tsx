'use client';

// ─── P3 블록 에디터 (US-EDIT-01·03) ────────────────────────────────
// controlled 컴포넌트: 상태를 보유하지 않고 blocks/onChange만 받는다.
// 렌더는 blocks에서 단방향 파생(모델=진실 원천). contenteditable은 입력
// 수단일 뿐 상태를 보유하지 않으며, 편집은 순수 document 연산을 거친다.

import { useEffect, useRef } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import {
  type EditorBlock,
  updateText,
  splitBlock,
  mergeWithPrevious,
  applyMarkdownShortcut,
} from '@/src/lib/editor/document';

interface EditorProps {
  blocks: EditorBlock[];
  onChange: (blocks: EditorBlock[]) => void;
}

/** 현재 선택 영역의 블록 내 캐럿 offset. 미지원(jsdom) 시 fallback. */
function getCaretOffset(el: HTMLElement, fallback: number): number {
  try {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (el.contains(range.startContainer)) return range.startOffset;
    }
  } catch {
    /* selection 미지원 환경 */
  }
  return fallback;
}

const BLOCK_CLASS: Record<EditorBlock['type'], string> = {
  paragraph: 'text-[15px] leading-7 text-body',
  heading1: 'text-3xl font-bold text-ink mt-4',
  heading2: 'text-2xl font-semibold text-ink mt-3',
  heading3: 'text-xl font-semibold text-ink mt-2',
  bullet: 'text-[15px] leading-7 text-body',
};

interface BlockViewProps {
  block: EditorBlock;
  onInput: (id: string, text: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLElement>, block: EditorBlock) => void;
  registerRef: (id: string, el: HTMLElement | null) => void;
}

function BlockView({ block, onInput, onKeyDown, registerRef }: BlockViewProps) {
  const ref = useRef<HTMLElement | null>(null);

  // 모델 → DOM 단방향 반영. 동일하면 건드리지 않아 캐럿 점프를 피한다.
  useEffect(() => {
    const el = ref.current;
    if (el && el.textContent !== block.text) el.textContent = block.text;
  }, [block.text]);

  const setRef = (el: HTMLElement | null) => {
    ref.current = el;
    registerRef(block.id, el);
  };

  const common = {
    'data-block-id': block.id,
    contentEditable: true,
    suppressContentEditableWarning: true,
    onInput: (e: FormEvent<HTMLElement>) => onInput(block.id, e.currentTarget.textContent ?? ''),
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => onKeyDown(e, block),
    className: `${BLOCK_CLASS[block.type]} px-1 outline-none focus:bg-hover/40 rounded`,
  };

  switch (block.type) {
    case 'heading1':
      return <h1 ref={setRef} {...common} />;
    case 'heading2':
      return <h2 ref={setRef} {...common} />;
    case 'heading3':
      return <h3 ref={setRef} {...common} />;
    case 'bullet':
      return (
        <ul className="list-disc pl-6">
          <li ref={setRef} {...common} />
        </ul>
      );
    default:
      return <p ref={setRef} {...common} />;
  }
}

export default function Editor({ blocks, onChange }: EditorProps) {
  const refs = useRef<Map<string, HTMLElement>>(new Map());
  const pending = useRef<{ id: string; offset: number } | null>(null);

  const registerRef = (id: string, el: HTMLElement | null) => {
    if (el) refs.current.set(id, el);
    else refs.current.delete(id);
  };

  // split/merge 후 새 위치로 포커스·캐럿 복원(best-effort, 실브라우저 기준).
  useEffect(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    const el = refs.current.get(p.id);
    if (!el) return;
    el.focus();
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      if (el.firstChild) {
        const max = (el.textContent ?? '').length;
        range.setStart(el.firstChild, Math.min(p.offset, max));
      } else {
        range.setStart(el, 0);
      }
      range.collapse(true);
      sel?.removeAllRanges();
      sel?.addRange(range);
    } catch {
      /* caret 복원 미지원 환경 */
    }
  }, [blocks]);

  const handleInput = (id: string, text: string) => {
    const updated = updateText(blocks, id, text);
    // 블록 시작의 마크다운 접두사(# / ## / ### / - )를 타입으로 변환(FR-7).
    const shortcut = applyMarkdownShortcut(updated, id);
    if (shortcut) {
      // 타입 변경으로 블록 태그가 remount되므로 캐럿을 명시적으로 복원한다.
      const block = shortcut.find((b) => b.id === id);
      pending.current = { id, offset: block ? block.text.length : 0 };
      onChange(shortcut);
    } else {
      onChange(updated);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLElement>, block: EditorBlock) => {
    const el = e.currentTarget;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const offset = getCaretOffset(el, block.text.length);
      const { doc, newBlockId } = splitBlock(blocks, block.id, offset);
      pending.current = { id: newBlockId, offset: 0 };
      onChange(doc);
    } else if (e.key === 'Backspace') {
      const offset = getCaretOffset(el, block.text.length);
      if (offset === 0) {
        const res = mergeWithPrevious(blocks, block.id);
        if (res) {
          e.preventDefault();
          pending.current = { id: res.caretBlockId, offset: res.caretOffset };
          onChange(res.doc);
        }
      }
    }
  };

  return (
    <div className="space-y-1">
      {blocks.map((b) => (
        <BlockView
          key={b.id}
          block={b}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          registerRef={registerRef}
        />
      ))}
    </div>
  );
}
