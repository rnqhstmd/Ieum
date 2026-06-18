'use client';

import { useState } from 'react';
import type { Page } from '@/src/lib/types';

interface Props {
  page: Page;
  depth: number;
  onNavigate: (id: string) => void;
  onCreateChild?: (parentId: string) => void;
}

export default function PageTreeNode({ page, depth, onNavigate, onCreateChild }: Props) {
  const hasChildren = !!page.children && page.children.length > 0;
  const [expanded, setExpanded] = useState(true);

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
        <span aria-hidden className="text-[14px]">
          {page.icon ?? '📄'}
        </span>
        <button type="button" onClick={() => onNavigate(page.id)} className="flex-1 truncate text-left">
          {page.title}
        </button>
        {onCreateChild && (
          <button
            type="button"
            aria-label={`${page.title} 하위 추가`}
            onClick={() => onCreateChild(page.id)}
            className="flex-none text-faint opacity-0 transition group-hover:opacity-100"
          >
            <span aria-hidden>＋</span>
          </button>
        )}
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
            />
          ))}
        </ul>
      )}
    </li>
  );
}
