'use client';

// 계정 영역 — 계정 행(버튼) 클릭 시 AccountMenu 팝오버를 행 위로 토글한다.
// 마운트 시 getCurrentUser로 실데이터(name/email)를 채우고, 실패하면 기존 기본값을 유지한다.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser } from '@/src/lib/users';
import { logout } from '@/src/lib/auth/logout';
import { useTheme } from '@/src/lib/theme/useTheme';
import AccountMenu from '@/components/overlays/AccountMenu';

interface Props {
  name?: string;
  email?: string;
}

export default function AccountArea({ name = '내 계정', email }: Props) {
  const router = useRouter();
  const [account, setAccount] = useState<{ name: string; email?: string }>({ name, email });
  const [open, setOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);

  // 마운트 시 실데이터 조회(실패 시 기존 기본값 유지)
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const me = await getCurrentUser();
        if (!active) return;
        setAccount({ name: me.name, email: me.email });
      } catch {
        // 조회 실패 시 기본값 유지
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // 외부 클릭 / Escape 닫기
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const handleLogout = async () => {
    setOpen(false);
    try {
      await logout();
      router.push('/login');
    } catch {
      // 로그아웃 실패 시 세션 유지(무시)
    }
  };

  const handleSettings = () => router.push('/settings');
  const handleHelp = () => router.push('/help');

  return (
    <div ref={containerRef} className="relative mt-2.5">
      {open && (
        <div className="absolute bottom-full left-0 z-20 mb-2">
          <AccountMenu
            name={account.name}
            email={account.email}
            theme={theme}
            onSettings={handleSettings}
            onToggleTheme={toggleTheme}
            onHelp={handleHelp}
            onLogout={handleLogout}
          />
        </div>
      )}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-[9px] border-t border-hair-3 px-2 pb-1 pt-[11px] text-left hover:bg-hover"
      >
        <span
          aria-hidden
          className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-[#a99bff] text-[12px] font-bold text-black"
        >
          {[...account.name][0] ?? ''}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-ink">{account.name}</div>
          {account.email && <div className="truncate text-[11px] text-faint">{account.email}</div>}
        </div>
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 flex-none text-faint"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
    </div>
  );
}
