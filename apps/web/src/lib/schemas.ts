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
export const pageSchema: z.ZodType<Page> = z.lazy(() =>
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
    children: z.array(pageSchema).nullable(),
  }),
);
export const pageListSchema = z.array(pageSchema);
