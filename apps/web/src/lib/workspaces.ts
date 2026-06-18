import { apiGet } from './api';
import { workspaceListSchema } from './schemas';
import type { Workspace } from './types';

/** 내 워크스페이스 목록 — GET /api/workspaces */
export async function listWorkspaces(): Promise<Workspace[]> {
  const data = await apiGet<unknown>('/api/workspaces');
  return workspaceListSchema.parse(data);
}
