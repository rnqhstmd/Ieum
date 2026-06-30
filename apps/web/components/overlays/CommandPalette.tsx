'use client';

// ⌘K 커맨드 팔레트 — prop 주도 재사용형. 백드롭은 부모(absolute inset-0) 기준 스코프.
import { useEffect } from 'react';

interface CommandItem {
  icon?: string;
  title: string;
  meta?: string;
  kbd?: string;
  onSelect?: () => void;
}

interface CommandGroup {
  label: string;
  items: CommandItem[];
}

interface Props {
  onClose?: () => void;
  groups?: CommandGroup[];
}

export default function CommandPalette({ onClose, groups = [] }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  let itemIndex = 0;

  return (
    <div
      className="absolute inset-0 flex justify-center bg-black/55 pt-16"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="명령 팔레트"
        onClick={(e) => e.stopPropagation()}
        className="h-fit w-[600px] max-w-[calc(100%-32px)] overflow-hidden rounded-[14px] border border-hair bg-deep"
      >
        <div className="flex items-center gap-3 border-b border-hair-3 px-4 py-3.5">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden className="flex-none text-faint">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            aria-label="명령 검색"
            placeholder="페이지 이동, 사람 찾기, 명령 실행…"
            className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-dim"
          />
          <kbd className="flex-none rounded border border-hair-2 px-1.5 py-0.5 text-[10px] text-faint">ESC</kbd>
        </div>

        <div className="max-h-[360px] overflow-y-auto p-2">
          {groups.map((group) => (
            <div key={group.label} className="mb-1 last:mb-0">
              <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[1.4px] text-label">
                {group.label}
              </div>
              {group.items.map((item) => {
                const selected = itemIndex === 0;
                itemIndex += 1;
                return (
                  <button
                    key={item.title}
                    type="button"
                    onClick={item.onSelect}
                    className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left ${
                      selected ? 'bg-hover' : 'hover:bg-hover'
                    }`}
                  >
                    {item.icon && (
                      <span aria-hidden className="w-5 flex-none text-center text-[15px]">
                        {item.icon}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{item.title}</span>
                    {item.meta && <span className="flex-none text-xs text-faint">{item.meta}</span>}
                    {item.kbd && (
                      <kbd className="flex-none rounded border border-hair-2 px-1.5 py-0.5 text-[10px] text-faint">
                        {item.kbd}
                      </kbd>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
