// ─── WS-AUTH: 현재 인증 사용자 id + token 조회 ──────────────────────
// Spring /api/users/me(세션 쿠키 인증)에서 userId·token을 얻어 WS join에 사용한다.
// 미인증(401)·네트워크 오류는 null.

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

export interface CurrentUser {
  userId: string;
  token: string | null;
}

export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/users/me`, { credentials: 'include' });
    if (!res.ok) return null;
    const body = await res.json();
    if (typeof body?.id !== 'string') return null;
    return { userId: body.id, token: typeof body.token === 'string' ? body.token : null };
  } catch (e) {
    console.warn('[auth] fetchCurrentUser failed:', e);
    return null;
  }
}
