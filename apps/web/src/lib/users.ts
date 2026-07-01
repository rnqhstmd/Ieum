import { apiGet } from './api';
import { meSchema } from './schemas';
import type { CurrentUser } from './types';

/** 현재 인증 사용자 — GET /api/users/me (역할 판정용; token은 사용하지 않음) */
export async function getCurrentUser(): Promise<CurrentUser> {
  const data = await apiGet<unknown>('/api/users/me');
  return meSchema.parse(data);
}
