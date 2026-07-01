'use client';

// ─── 블록 타입 선택 드롭다운 (presentational) ──────────────────────
// 빈 블록에서 '#' 또는 '/' 입력 시 Editor가 띄운다. 상태(열림·활성 index)는 Editor가
// 보유하고, 이 컴포넌트는 렌더와 hover/click 콜백만 담당한다(키보드 네비는 Editor).

import type { BlockType } from '@ieum/crdt';

export interface BlockTypeItem {
  type: BlockType;
  label: string;
  badge: string;
}

/** 드롭다운 항목 정의(순서 = 표시 순서). */
export const BLOCK_TYPE_ITEMS: BlockTypeItem[] = [
  { type: 'paragraph', label: '본문', badge: '¶' },
  { type: 'heading1', label: '제목 1', badge: 'H1' },
  { type: 'heading2', label: '제목 2', badge: 'H2' },
  { type: 'heading3', label: '제목 3', badge: 'H3' },
  { type: 'bullet', label: '글머리', badge: '•' },
  { type: 'code', label: '코드', badge: '</>' },
];

interface Props {
  activeIndex: number;
  onSelect: (type: BlockType) => void;
  onHover: (index: number) => void;
}

export default function BlockTypeMenu({ activeIndex, onSelect, onHover }: Props) {
  return (
    <div
      role="listbox"
      aria-label="블록 타입"
      data-testid="block-type-menu"
      className="absolute left-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-lg border border-faint bg-deep py-1 shadow-lg"
    >
      {BLOCK_TYPE_ITEMS.map((item, i) => (
        <button
          key={item.type}
          type="button"
          role="option"
          aria-selected={i === activeIndex}
          data-type={item.type}
          onMouseEnter={() => onHover(i)}
          // mousedown(+preventDefault)로 처리해 contenteditable의 blur보다 먼저 선택을 확정한다.
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(item.type);
          }}
          className={`flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm transition ${
            i === activeIndex ? 'bg-hover text-ink' : 'text-body hover:bg-hover/50'
          }`}
        >
          <span className="w-8 flex-none text-center text-xs text-faint">{item.badge}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}
