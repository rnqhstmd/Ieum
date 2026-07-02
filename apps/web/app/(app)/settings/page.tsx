'use client';

// 설정 페이지 — 계정 정보(읽기전용)와 테마 전환, 로그아웃을 제공한다.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser } from '@/src/lib/users';
import { logout } from '@/src/lib/auth/logout';
import { useTheme } from '@/src/lib/theme/useTheme';
import { ApiError } from '@/src/lib/api';

type Status = 'loading' | 'ready' | 'error';

export default function SettingsPage() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [account, setAccount] = useState<{ name: string; email: string } | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  // 마운트 시 실데이터 조회
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const me = await getCurrentUser();
        if (!active) return;
        setAccount({ name: me.name, email: me.email });
        setStatus('ready');
      } catch (e) {
        if (!active) return;
        if (e instanceof ApiError && e.status === 401) {
          router.push('/login');
          return;
        }
        setStatus('error');
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/login');
    } catch {
      // 로그아웃 실패 시 세션 유지(무시)
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-lg font-semibold text-ink">설정</h1>
      {status === 'loading' && <p className="text-faint">불러오는 중…</p>}
      {status === 'error' && (
        <p role="alert" className="text-sm text-danger">
          계정 정보를 불러오지 못했습니다.
        </p>
      )}
      {status === 'ready' && account && (
        <div>
          <p>{account.name}</p>
          <p>{account.email}</p>
          <button type="button" onClick={toggleTheme}>
            테마 <span>{theme}</span>
          </button>
          <button type="button" onClick={handleLogout}>
            로그아웃
          </button>
        </div>
      )}
    </div>
  );
}
