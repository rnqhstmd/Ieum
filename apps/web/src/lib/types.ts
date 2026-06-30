/** P2 도메인 타입 — 백엔드 DTO와 1:1 대응 (Jackson 직렬화: UUID/Instant → string) */

export type WorkspaceType = 'PERSONAL' | 'SHARED';

export interface Workspace {
  id: string;
  name: string;
  type: WorkspaceType;
  ownerId: string;
  createdAt: string;
}

export interface Page {
  id: string;
  workspaceId: string;
  parentPageId: string | null;
  title: string;
  icon: string | null;
  position: number;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  /** 트리 조회 시 하위 페이지, 단건/리프는 null */
  children: Page[] | null;
}

export interface CreatePageInput {
  parentPageId: string | null;
  title: string;
  icon?: string | null;
  position: number;
}

/** 페이지 부분 갱신 입력 — 미전달 필드는 변경하지 않음(PATCH) */
export interface UpdatePageInput {
  title?: string;
  icon?: string | null;
}

// ─── 멤버십 / 초대 (P? 멤버 관리) — 백엔드 DTO와 1:1 대응 ──────────────

/** 멤버 역할 — MembershipDto.role / CreateInvitationRequest.role */
export type MemberRole = 'OWNER' | 'MEMBER';

/** 초대 상태 — InvitationDto.status */
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';

/** 워크스페이스 멤버십 — GET /api/workspaces/{wsId}/members (MembershipDto) */
export interface Membership {
  membershipId: string;
  userId: string;
  userEmail: string;
  userName: string;
  role: MemberRole;
  joinedAt: string;
}

/** 초대 — GET /api/workspaces/{wsId}/invitations (InvitationDto) */
export interface Invitation {
  id: string;
  workspaceId: string;
  email: string;
  invitedById: string;
  role: MemberRole;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
}

/** 현재 인증 사용자 — GET /api/users/me (MeResponse). token은 역할 판정에 사용하지 않음 */
export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  token: string;
}
