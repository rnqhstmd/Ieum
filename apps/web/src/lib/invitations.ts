import { apiGet, apiPost, apiDelete } from './api';
import { invitationListSchema, invitationSchema } from './schemas';
import type { Invitation, MemberRole } from './types';

/** 초대 목록 — GET /api/workspaces/{wsId}/invitations (OWNER 전용) */
export async function listInvitations(wsId: string): Promise<Invitation[]> {
  const data = await apiGet<unknown>(`/api/workspaces/${wsId}/invitations`);
  return invitationListSchema.parse(data);
}

/** 초대 생성 — POST /api/workspaces/{wsId}/invitations (OWNER 전용, 실제 이메일 발송) */
export async function createInvitation(
  wsId: string,
  input: { email: string; role: MemberRole },
): Promise<Invitation> {
  const data = await apiPost<unknown>(`/api/workspaces/${wsId}/invitations`, input);
  return invitationSchema.parse(data);
}

/** 초대 철회 — DELETE /api/workspaces/{wsId}/invitations/{invitationId} (OWNER, PENDING) */
export async function revokeInvitation(wsId: string, invitationId: string): Promise<void> {
  await apiDelete<void>(`/api/workspaces/${wsId}/invitations/${invitationId}`);
}
