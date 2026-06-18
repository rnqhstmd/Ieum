import { apiGet, apiPost } from './api';
import { pageListSchema, pageSchema } from './schemas';
import type { CreatePageInput, Page } from './types';

/** 워크스페이스 페이지 트리 — GET /api/workspaces/{wsId}/pages */
export async function getPageTree(wsId: string): Promise<Page[]> {
  const data = await apiGet<unknown>(`/api/workspaces/${wsId}/pages`);
  return pageListSchema.parse(data);
}

/** 페이지 생성 — POST /api/workspaces/{wsId}/pages */
export async function createPage(wsId: string, input: CreatePageInput): Promise<Page> {
  const data = await apiPost<unknown>(`/api/workspaces/${wsId}/pages`, input);
  return pageSchema.parse(data);
}
