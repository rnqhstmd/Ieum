'use client';

// ─── P5 CRDT 블록 에디터 (AC-7, FR-6) ──────────────────────────────
// DocState 파생 EditorBlockView(id:RgaId)를 렌더한다. contenteditable은 입력 수단일
// 뿐 상태를 보유하지 않으며, 텍스트 변경은 onBlockInput(blockId,newText)으로만 전달한다
// (diff→op는 상위 useCrdtDocument가 수행). walking skeleton: 구조 편집(Enter 분할/
// Backspace 병합)·마크다운 단축키는 비활성(블록 단위 op 전송은 후속 슬라이스).

import { useEffect, useRef } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { idKey } from '@ieum/crdt';
import type { EditorBlockView, RgaId } from '@ieum/crdt';

interface EditorProps {
  blocks: EditorBlockView[];
  onBlockInput: (blockId: RgaId, newText: string) => void;
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
}

function BlockView({ block, onInput, onCompositionStart, onCompositionEnd, onKeyDown }: BlockViewProps) {
  const ref = useRef<HTMLElement | null>(null);
  // 콜백 ref: HTMLElement를 받아 각 시맨틱 태그(h1/li/p…)에 공통 적용(타입 분산 회피).
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
    className: `${BLOCK_CLASS[block.type]} px-1 outline-none focus:bg-hover/40 rounded`,
  } as const;

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

export default function Editor({ blocks, onBlockInput }: EditorProps) {
  // IME 조합 추적 — 조합 중 input은 무시하고 compositionend에서 최종 텍스트만 emit.
  const composing = useRef(false);

  const handleInput = (blockId: RgaId, e: FormEvent<HTMLElement>) => {
    if (composing.current) return;
    onBlockInput(blockId, e.currentTarget.textContent ?? '');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLElement>, block: EditorBlockView) => {
    // 구조 편집 비활성: Enter(블록 분할)·블록 시작 Backspace(병합) 차단.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Backspace') {
      const offset = getCaretOffset(e.currentTarget, block.text.length);
      if (offset === 0) e.preventDefault();
    }
  };

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
        />
      ))}
    </div>
  );
}
