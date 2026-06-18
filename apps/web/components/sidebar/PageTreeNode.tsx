'use client';

import { useState } from 'react';
import type { Page } from '@/src/lib/types';

interface Props {
  page: Page;
  depth: number;
  onNavigate: (id: string) => void;
  onCreateChild?: (parentId: string) => void;
  onRename?: (id: string, title: string) => void;
  onSetIcon?: (id: string, icon: string) => void;
  onArchive?: (id: string) => void;
}

export default function PageTreeNode({
  page,
  depth,
  onNavigate,
  onCreateChild,
  onRename,
  onSetIcon,
  onArchive,
}: Props) {
  const hasChildren = !!page.children && page.children.length > 0;
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState<'none' | 'title' | 'icon'>('none');

  const commitRename = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== page.title) onRename?.(page.id, trimmed);
    setEditing('none');
  };
  const commitIcon = (value: string) => {
    const v = value.trim();
    if (v) onSetIcon?.(page.id, v);
    setEditing('none');
  };

  return (
    <li role="none">
      <div
        role="treeitem"
        aria-expanded={hasChildren ? expanded : undefined}
        className="group flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13.5px] text-body hover:bg-hover"
        style={{ marginLeft: depth * 16 }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={expanded ? '접기' : '펼치기'}
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="flex h-3 w-3 flex-none items-center justify-center text-[10px] text-faint"
          >
            <span aria-hidden>{expanded ? '▾' : '▸'}</span>
          </button>
        ) : (
          <span className="inline-block w-3 flex-none" aria-hidden />
        )}

        {/* 아이콘 — onSetIcon 제공 시 클릭하여 이모지 직접 입력 */}
        {editing === 'icon' ? (
          <input
            aria-label="페이지 아이콘"
            defaultValue={page.icon ?? ''}
            autoFocus
            maxLength={8}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitIcon(e.currentTarget.value);
              else if (e.key === 'Escape') setEditing('none');
            }}
            onBlur={(e) => commitIcon(e.currentTarget.value)}
            className="w-9 flex-none rounded bg-hover px-1 text-[14px] text-ink outline-none"
          />
        ) : onSetIcon ? (
          <button
            type="button"
            aria-label={`${page.title} 아이콘 변경`}
            onClick={() => setEditing('icon')}
            className="flex-none text-[14px]"
          >
            <span aria-hidden>{page.icon ?? '📄'}</span>
          </button>
        ) : (
          <span aria-hidden className="flex-none text-[14px]">
            {page.icon ?? '📄'}
          </span>
        )}

        {/* 제목 — 편집 모드 시 인라인 입력 */}
        {editing === 'title' ? (
          <input
            aria-label="페이지 이름"
            defaultValue={page.title}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename(e.currentTarget.value);
              else if (e.key === 'Escape') setEditing('none');
            }}
            onBlur={(e) => commitRename(e.currentTarget.value)}
            className="min-w-0 flex-1 rounded bg-hover px-1 text-[13.5px] text-ink outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => onNavigate(page.id)}
            className="min-w-0 flex-1 truncate text-left"
          >
            {page.title}
          </button>
        )}

        {/* 행 액션 (hover 시 노출) */}
        <div className="flex flex-none items-center gap-1.5 opacity-0 transition group-hover:opacity-100">
          {onRename && (
            <button
              type="button"
              aria-label={`${page.title} 이름 변경`}
              onClick={() => setEditing('title')}
              className="text-faint hover:text-ink"
            >
              <span aria-hidden>✎</span>
            </button>
          )}
          {onArchive && (
            <button
              type="button"
              aria-label={`${page.title} 아카이브`}
              onClick={() => onArchive(page.id)}
              className="text-faint hover:text-danger"
            >
              <span aria-hidden>🗑</span>
            </button>
          )}
          {onCreateChild && (
            <button
              type="button"
              aria-label={`${page.title} 하위 추가`}
              onClick={() => onCreateChild(page.id)}
              className="text-faint hover:text-ink"
            >
              <span aria-hidden>＋</span>
            </button>
          )}
        </div>
      </div>

      {hasChildren && expanded && (
        <ul role="group">
          {page.children?.map((child) => (
            <PageTreeNode
              key={child.id}
              page={child}
              depth={depth + 1}
              onNavigate={onNavigate}
              onCreateChild={onCreateChild}
              onRename={onRename}
              onSetIcon={onSetIcon}
              onArchive={onArchive}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
