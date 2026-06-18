'use client';

import type { Workspace } from '@/src/lib/types';

interface Props {
  workspaces: Workspace[];
  currentId: string | null;
  onSelect: (id: string) => void;
}

export default function WorkspaceSwitcher({ workspaces, currentId, onSelect }: Props) {
  return (
    <nav aria-label="워크스페이스 전환" className="flex flex-col gap-0.5">
      <div className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[1.6px] text-label">
        워크스페이스
      </div>
      {workspaces.map((w) => (
        <button
          key={w.id}
          type="button"
          onClick={() => onSelect(w.id)}
          aria-current={w.id === currentId ? 'true' : undefined}
          className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm ${
            w.id === currentId ? 'bg-hover text-ink' : 'text-body hover:bg-hover'
          }`}
        >
          <span
            aria-hidden
            className="flex h-6 w-6 flex-none items-center justify-center rounded-md bg-accent text-[12px] font-bold text-black"
          >
            {[...w.name][0] ?? ''}
          </span>
          <span className="min-w-0 flex-1 truncate">{w.name}</span>
          <span className="flex-none text-[10px] text-faint">{w.type === 'PERSONAL' ? '개인' : '공유'}</span>
        </button>
      ))}
    </nav>
  );
}
