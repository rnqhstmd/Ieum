'use client';

// ⌘K 커맨드 팔레트 — prop 주도 재사용형. 백드롭은 부모(absolute inset-0) 기준 스코프.
import { useEffect, useRef } from 'react';

interface CommandItem {
  // 리스트 key 안정화용 고유 식별자. 미지정 시 title로 폴백(쇼케이스 하위호환).
  id?: string;
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
  // 검색 input controlled 배선(전부 optional — 쇼케이스 하위호환).
  query?: string;
  onQueryChange?: (q: string) => void;
  // 키보드 네비 하이라이트 대상(그룹 가로지르는 전역 항목 인덱스). 미지정 시 첫 항목 하이라이트.
  activeIndex?: number;
  // 전체 항목이 0개일 때 리스트 영역에 보여줄 안내 문구(로딩/빈/검색무결과 구분). 미지정 시 빈 리스트만 렌더(쇼케이스 하위호환).
  emptyMessage?: string;
}

export default function CommandPalette({
  onClose,
  groups = [],
  query,
  onQueryChange,
  activeIndex,
  emptyMessage,
}: Props) {
  // autofocus는 CommandPalette가 소유(input이 여기 있으므로). 마운트 시 검색 input 포커스.
  const inputRef = useRef<HTMLInputElement>(null);
  // 하이라이트된 항목 버튼 ref — activeIndex 변경 시 뷰포트 안으로 스크롤한다.
  const activeItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // 방향키로 하이라이트가 뷰포트(max-h-[360px] overflow) 밖으로 나가면 보이도록 스크롤.
  // scrollIntoView는 브라우저에만 존재(jsdom 미구현)하므로 옵셔널 호출로 가드한다.
  useEffect(() => {
    activeItemRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex]);

  // 그룹을 가로지르는 전체 항목 수 — 0이면 emptyMessage 안내를 대신 렌더한다.
  const totalItems = groups.reduce((sum, group) => sum + group.items.length, 0);

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
            ref={inputRef}
            type="text"
            aria-label="명령 검색"
            placeholder="페이지 이동, 사람 찾기, 명령 실행…"
            value={query ?? ''}
            onChange={(e) => onQueryChange?.(e.target.value)}
            className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-dim"
          />
          <kbd className="flex-none rounded border border-hair-2 px-1.5 py-0.5 text-[10px] text-faint">ESC</kbd>
        </div>

        <div className="max-h-[360px] overflow-y-auto p-2">
          {totalItems === 0 && emptyMessage ? (
            <div className="px-3 py-6 text-center text-sm text-dim">{emptyMessage}</div>
          ) : (
            groups.map((group) => (
            <div key={group.label} className="mb-1 last:mb-0">
              <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[1.4px] text-label">
                {group.label}
              </div>
              {group.items.map((item) => {
                // activeIndex가 주어지면 전역 항목 인덱스와 비교, 미지정 시 기존처럼 첫 항목 하이라이트.
                const selected =
                  activeIndex === undefined ? itemIndex === 0 : itemIndex === activeIndex;
                itemIndex += 1;
                return (
                  <button
                    key={item.id ?? item.title}
                    ref={selected ? activeItemRef : undefined}
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
            ))
          )}
        </div>
      </div>
    </div>
  );
}
