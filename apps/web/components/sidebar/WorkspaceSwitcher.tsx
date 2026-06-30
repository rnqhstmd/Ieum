'use client';

import { useEffect, useRef, useState } from 'react';
import type { Workspace } from '@/src/lib/types';

interface Props {
  workspaces: Workspace[];
  currentId: string | null;
  onSelect: (id: string) => void;
}

/** 멤버수 데이터 미배선 → 부제는 type(개인/공유)만 */
function typeLabel(type: Workspace['type']) {
  return type === 'PERSONAL' ? '개인' : '공유';
}

export default function WorkspaceSwitcher({ workspaces, currentId, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLElement>(null);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const current = workspaces.find((w) => w.id === currentId) ?? null;
  const others = workspaces.filter((w) => w.id !== currentId);
  const hasOthers = others.length > 0;

  // 워크스페이스 미로딩 시 중립 플레이스홀더
  if (!current) {
    return (
      <div aria-label="워크스페이스" className="flex items-center gap-2.5 rounded-[7px] px-2.5 py-2">
        <span aria-hidden className="h-7 w-7 flex-none rounded-[7px] bg-hover" />
        <span className="text-[11px] text-faint">워크스페이스</span>
      </div>
    );
  }

  return (
    <nav ref={rootRef} aria-label="워크스페이스 전환" className="relative">
      <button
        type="button"
        onClick={hasOthers ? () => setOpen((o) => !o) : undefined}
        aria-expanded={hasOthers ? open : undefined}
        aria-haspopup={hasOthers ? 'menu' : undefined}
        className={`flex w-full items-center gap-2.5 rounded-[7px] px-2.5 py-2 text-left ${
          hasOthers ? 'hover:bg-hover' : 'cursor-default'
        }`}
      >
        <span
          aria-hidden
          className="flex h-7 w-7 flex-none items-center justify-center rounded-[7px] bg-accent text-[13px] font-bold text-black"
        >
          {[...current.name][0] ?? ''}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold text-ink">{current.name}</span>
          <span className="block truncate text-[11px] text-faint">{typeLabel(current.type)}</span>
        </span>
        {hasOthers && (
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`h-4 w-4 flex-none text-faint transition-transform ${open ? 'rotate-180' : ''}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </button>

      {open && others.length > 0 && (
        <div
          role="menu"
          className="absolute inset-x-0 top-full z-20 mt-1 flex flex-col gap-0.5 rounded-[7px] border border-hair-2 bg-deep p-1 shadow-lg shadow-black/40"
        >
          {others.map((w) => (
            <button
              key={w.id}
              type="button"
              role="menuitem"
              onClick={() => {
                onSelect(w.id);
                setOpen(false);
              }}
              className="flex items-center gap-2.5 rounded-[6px] px-2 py-1.5 text-left hover:bg-hover"
            >
              <span
                aria-hidden
                className="flex h-6 w-6 flex-none items-center justify-center rounded-[6px] bg-accent text-[11px] font-bold text-black"
              >
                {[...w.name][0] ?? ''}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-body">{w.name}</span>
              <span className="flex-none text-[10px] text-faint">{typeLabel(w.type)}</span>
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}
