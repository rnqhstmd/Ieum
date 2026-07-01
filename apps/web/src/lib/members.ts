import { apiGet, apiPatch, apiDelete } from './api';
import { membershipListSchema, membershipSchema } from './schemas';
import type { MemberRole, Membership } from './types';

/** 워크스페이스 멤버 목록 — GET /api/workspaces/{wsId}/members */
export async function listMembers(wsId: string): Promise<Membership[]> {
  const data = await apiGet<unknown>(`/api/workspaces/${wsId}/members`);
  return membershipListSchema.parse(data);
}

/** 멤버 역할 변경 — PATCH /api/workspaces/{wsId}/members/{userId}/role (OWNER 전용) */
export async function updateMemberRole(
  wsId: string,
  userId: string,
  role: MemberRole,
): Promise<Membership> {
  const data = await apiPatch<unknown>(`/api/workspaces/${wsId}/members/${userId}/role`, { role });
  return membershipSchema.parse(data);
}

/** 멤버 내보내기 — DELETE /api/workspaces/{wsId}/members/{userId} (OWNER 전용) */
export async function removeMember(wsId: string, userId: string): Promise<void> {
  await apiDelete<void>(`/api/workspaces/${wsId}/members/${userId}`);
}

/** 워크스페이스 나가기 — DELETE /api/workspaces/{wsId}/members/me */
export async function leaveWorkspace(wsId: string): Promise<void> {
  await apiDelete<void>(`/api/workspaces/${wsId}/members/me`);
}
