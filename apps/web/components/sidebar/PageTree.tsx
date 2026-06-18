'use client';

import type { Page } from '@/src/lib/types';
import PageTreeNode from './PageTreeNode';

interface Props {
  pages: Page[];
  onNavigate: (id: string) => void;
  onCreateChild?: (parentId: string) => void;
}

export default function PageTree({ pages, onNavigate, onCreateChild }: Props) {
  if (pages.length === 0) {
    return (
      <p className="px-2.5 py-2 text-[13px] text-faint">페이지가 없습니다. 새 페이지를 만들어 보세요.</p>
    );
  }
  return (
    <ul role="tree" aria-label="페이지 트리">
      {pages.map((p) => (
        <PageTreeNode key={p.id} page={p} depth={0} onNavigate={onNavigate} onCreateChild={onCreateChild} />
      ))}
    </ul>
  );
}
