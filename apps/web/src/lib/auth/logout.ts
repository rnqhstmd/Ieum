import { apiPost } from '../api';

/** 로그아웃 — POST /api/auth/logout (204 No Content, 세션 클리어) */
export async function logout(): Promise<void> {
  await apiPost<void>('/api/auth/logout');
}
