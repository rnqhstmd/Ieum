'use client';

import type { ReactNode } from 'react';
import EmptyState from '@/components/states/EmptyState';
import LoadingSkeleton from '@/components/states/LoadingSkeleton';
import Forbidden403 from '@/components/states/Forbidden403';
import ConnectionBanner from '@/components/states/ConnectionBanner';
import ErrorToast from '@/components/states/ErrorToast';
import ContextMenu from '@/components/states/ContextMenu';

const noop = () => {};

function Frame({
  label,
  className = '',
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[10px] font-semibold uppercase tracking-[1.6px] text-label">{label}</h2>
      <div className={`relative flex items-center justify-center rounded-xl border border-hair bg-surface p-10 ${className}`}>
        {children}
      </div>
    </section>
  );
}

function RenameIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}

function AddChildIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 6h10M4 12h6M14 12h6M17 9v6" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" />
    </svg>
  );
}

const contextMenuItems = [
  { icon: <RenameIcon />, label: '이름 변경', onClick: noop },
  { icon: <ImageIcon />, label: '아이콘 변경', onClick: noop },
  { icon: <AddChildIcon />, label: '하위 페이지 추가', onClick: noop },
  { icon: <ArchiveIcon />, label: '아카이브', destructive: true, onClick: noop },
];

export default function StatesShowcasePage() {
  return (
    <main className="min-h-screen bg-deep px-6 py-12 text-ink">
      <div className="mx-auto flex max-w-3xl flex-col gap-10">
        <header>
          <h1 className="text-2xl font-bold">States 쇼케이스</h1>
          <p className="mt-2 text-sm text-dim">상태·엣지 프레젠테이션 컴포넌트 갤러리</p>
        </header>

        <Frame label="Empty State" className="py-16">
          <EmptyState onCreate={noop} />
        </Frame>

        <Frame label="Loading Skeleton" className="h-[280px] overflow-hidden p-0">
          <LoadingSkeleton />
        </Frame>

        <Frame label="403 Forbidden" className="py-16">
          <Forbidden403 onRequestAccess={noop} />
        </Frame>

        <Frame label="Connection Banner — Offline" className="items-stretch p-0">
          <ConnectionBanner status="offline" />
        </Frame>

        <Frame label="Connection Banner — Reconnected">
          <ConnectionBanner status="reconnected" />
        </Frame>

        <Frame label="Error Toast">
          <ErrorToast onRetry={noop} onDismiss={noop} />
        </Frame>

        <Frame label="Context Menu">
          <ContextMenu items={contextMenuItems} onClose={noop} />
        </Frame>
      </div>
    </main>
  );
}
