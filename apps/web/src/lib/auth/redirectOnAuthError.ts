import { ApiError } from '@/src/lib/api';

// 401(미인증) 공통 처리 — 여러 화면(대시보드·사이드바·설정·도움말)에서 반복되던
// "ApiError 401이면 /login으로 보낸다" 패턴을 단일 지점으로 모은다.

interface RouterLike {
  push: (href: string) => void;
}

/**
 * 에러가 401(미인증) ApiError이면 `/login`으로 이동시키고 `true`를 반환한다.
 * 그 외의 에러는 처리하지 않고 `false`를 반환하므로, 호출부에서 이어서 자체 처리하면 된다.
 */
export function redirectOnAuthError(e: unknown, router: RouterLike): boolean {
  if (e instanceof ApiError && e.status === 401) {
    router.push('/login');
    return true;
  }
  return false;
}
