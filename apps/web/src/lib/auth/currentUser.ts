// ─── WS-AUTH: 현재 인증 사용자 id 조회 ───────────────────────────
// Spring /api/users/me(세션 쿠키 인증)에서 실 userId를 얻어 WS join에 trust-relay한다.
// 미인증(401)·네트워크 오류는 null — relay 멤버십 게이트가 비멤버로 처리(close 4003).

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

export async function fetchCurrentUserId(): Promise<string | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/users/me`, { credentials: 'include' });
    if (!res.ok) return null;
    const body = (await res.json()) as { id?: unknown };
    return typeof body.id === 'string' ? body.id : null;
  } catch {
    return null;
  }
}
