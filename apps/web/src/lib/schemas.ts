import { z } from 'zod';
import type { Page } from './types';

/** 워크스페이스 응답 검증 */
export const workspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['PERSONAL', 'SHARED']),
  ownerId: z.string(),
  createdAt: z.string(),
});
export const workspaceListSchema = z.array(workspaceSchema);

/** 페이지 응답 검증 (children 재귀) */
export const pageSchema: z.ZodType<Page, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.object({
    id: z.string(),
    workspaceId: z.string(),
    parentPageId: z.string().nullable(),
    title: z.string(),
    icon: z.string().nullable(),
    position: z.number(),
    createdById: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    children: z.array(pageSchema).nullable().optional().default(null),
  }),
);
export const pageListSchema = z.array(pageSchema);

/** 현재 인증 사용자 응답 검증 — GET /api/users/me */
export const meSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  token: z.string(),
});

/** 멤버십 응답 검증 — MembershipDto */
export const membershipSchema = z.object({
  membershipId: z.string(),
  userId: z.string(),
  userEmail: z.string(),
  userName: z.string(),
  role: z.enum(['OWNER', 'MEMBER']),
  joinedAt: z.string(),
});
export const membershipListSchema = z.array(membershipSchema);

/** 초대 응답 검증 — InvitationDto */
export const invitationSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  email: z.string(),
  invitedById: z.string(),
  role: z.enum(['OWNER', 'MEMBER']),
  status: z.enum(['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED']),
  expiresAt: z.string(),
  createdAt: z.string(),
});
export const invitationListSchema = z.array(invitationSchema);
