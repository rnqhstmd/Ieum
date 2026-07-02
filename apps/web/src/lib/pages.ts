import { apiGet, apiPost, apiPatch, apiDelete } from './api';
import { pageListSchema, pageSchema } from './schemas';
import type { CreatePageInput, Page, UpdatePageInput } from './types';

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

/** 페이지 제목/아이콘 변경 — PATCH /api/workspaces/{wsId}/pages/{pageId} */
export async function updatePage(
  wsId: string,
  pageId: string,
  input: UpdatePageInput,
): Promise<Page> {
  const data = await apiPatch<unknown>(`/api/workspaces/${wsId}/pages/${pageId}`, input);
  return pageSchema.parse(data);
}

/** 페이지 아카이브(soft delete) — DELETE /api/workspaces/{wsId}/pages/{pageId} */
export async function archivePage(wsId: string, pageId: string): Promise<void> {
  await apiDelete<void>(`/api/workspaces/${wsId}/pages/${pageId}`);
}

/**
 * 페이지 트리를 평탄한 배열로 전개한다(전위 순회).
 * 각 노드를 방문한 뒤 children을 재귀적으로 이어붙여 부모→자식 순서를 보존한다.
 * children이 null이거나 비어 있으면 해당 노드만 포함한다.
 */
export function flattenPageTree(pages: Page[]): Page[] {
  const flat: Page[] = [];
  for (const page of pages) {
    flat.push(page);
    if (page.children) flat.push(...flattenPageTree(page.children));
  }
  return flat;
}
