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
