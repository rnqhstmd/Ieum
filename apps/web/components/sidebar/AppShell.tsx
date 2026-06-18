'use client';

import { useState } from 'react';
import Sidebar from './Sidebar';

/** 앱 셸 — 데스크탑 2-pane(고정 사이드바) / 모바일 드로어(햄버거 토글) */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-surface text-body">
      {/* 모바일 상단바 (md 미만) */}
      <div className="fixed inset-x-0 top-0 z-30 flex items-center gap-3 border-b border-hair-3 bg-deep px-4 py-3 md:hidden">
        <button
          type="button"
          aria-label="사이드바 열기"
          aria-expanded={open}
          aria-controls="app-sidebar"
          onClick={() => setOpen(true)}
          className="text-ink"
        >
          <span aria-hidden>☰</span>
        </button>
        <span className="text-sm font-extrabold tracking-[1.5px] text-ink">IEUM</span>
      </div>

      {/* 드로어 오버레이 */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/55 md:hidden"
          aria-hidden
          onClick={() => setOpen(false)}
        />
      )}

      {/* 사이드바: 데스크탑 고정 / 모바일 드로어(슬라이드) */}
      <div
        id="app-sidebar"
        className={`fixed inset-y-0 left-0 z-40 transition-transform md:static md:z-auto md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar onNavigate={() => setOpen(false)} />
      </div>

      <main className="min-w-0 flex-1 overflow-auto pt-14 md:pt-0">{children}</main>
    </div>
  );
}
