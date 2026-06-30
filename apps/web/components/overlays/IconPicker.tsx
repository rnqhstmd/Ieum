'use client';

// 이모지 피커 그리드 — prop 주도 재사용형. 기본 이모지 셋 제공, 콜백 스텁.

const DEFAULT_EMOJIS = [
  '📄', '📝', '📌', '📁', '⭐', '🔥', '💡', '✅',
  '🎯', '🚀', '📊', '📈', '🗂️', '🔖', '🧩', '🎨',
  '🛠️', '📅', '🔔', '💬', '🧠', '🌱', '⚡', '🌟',
  '🎉', '📦', '🔍', '✏️', '📚', '🗒️', '🧭', '🏷️',
];

interface Props {
  emojis?: string[];
  selected?: string;
  onSelect?: (emoji: string) => void;
  onRandom?: () => void;
  onRemove?: () => void;
}

export default function IconPicker({
  emojis = DEFAULT_EMOJIS,
  selected,
  onSelect,
  onRandom,
  onRemove,
}: Props) {
  return (
    <div className="w-[340px] rounded-[12px] border border-hair bg-deep p-3">
      <div className="mb-2 flex items-center gap-2 rounded-lg border border-hair-2 px-2.5 py-2">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden className="flex-none text-faint">
          <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          aria-label="이모지 검색"
          placeholder="이모지 검색"
          className="flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-dim"
        />
      </div>

      <div className="grid grid-cols-8 gap-0.5">
        {emojis.map((emoji, i) => {
          const isSelected = selected ? emoji === selected : i === 0;
          return (
            <button
              key={`${emoji}-${i}`}
              type="button"
              aria-label={emoji}
              aria-pressed={isSelected}
              onClick={() => onSelect?.(emoji)}
              className={`flex aspect-square items-center justify-center rounded-md text-[19px] ${
                isSelected ? 'bg-hover' : 'hover:bg-hover'
              }`}
            >
              {emoji}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-hair-3 pt-2">
        <button type="button" onClick={onRandom} className="text-[12px] text-faint hover:text-body">
          랜덤
        </button>
        <button type="button" onClick={onRemove} className="text-[12px] text-faint hover:text-body">
          제거
        </button>
      </div>
    </div>
  );
}
