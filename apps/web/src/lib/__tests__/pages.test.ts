import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPageTree, createPage, updatePage, archivePage } from '@/src/lib/pages';

const node = (over: Record<string, unknown>) => ({
  id: 'x',
  workspaceId: 'w1',
  parentPageId: null,
  title: 'T',
  icon: null,
  position: 0,
  createdById: 'u1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  children: null,
  ...over,
});

const jsonRes = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('pages api', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('AC-2: getPageTree가 GET /api/workspaces/{wsId}/pages 호출 + 중첩 children을 보존 파싱한다', async () => {
    const tree = [node({ id: 'a', title: 'A', children: [node({ id: 'b', parentPageId: 'a', title: 'B' })] })];
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(jsonRes(tree));

    const result = await getPageTree('w1');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/workspaces\/w1\/pages$/);
    expect(init?.credentials).toBe('include');
    expect(result[0]?.id).toBe('a');
    expect(result[0]?.children?.[0]?.id).toBe('b');
  });

  it('AC-3: createPage가 POST + JSON 본문으로 호출하고 생성 Page를 반환한다', async () => {
    const created = node({ id: 'p9', title: '새 페이지' });
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(jsonRes(created));

    const result = await createPage('w1', { parentPageId: null, title: '새 페이지', position: 0 });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/workspaces\/w1\/pages$/);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toMatchObject({ title: '새 페이지', parentPageId: null, position: 0 });
    expect(result.id).toBe('p9');
  });

  it('AC-F1: updatePage가 PATCH + JSON 본문으로 호출하고 갱신 Page를 반환한다', async () => {
    const updated = node({ id: 'p1', title: '수정됨' });
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(jsonRes(updated));

    const result = await updatePage('w1', 'p1', { title: '수정됨' });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/workspaces\/w1\/pages\/p1$/);
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(String(init?.body))).toMatchObject({ title: '수정됨' });
    expect(result.id).toBe('p1');
  });

  it('AC-F2: archivePage가 DELETE로 호출한다', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));

    await archivePage('w1', 'p1');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/workspaces\/w1\/pages\/p1$/);
    expect(init?.method).toBe('DELETE');
  });

  it('PR리뷰: children 필드가 누락된 응답도 파싱한다(children → null)', async () => {
    const noChildren = {
      id: 'p',
      workspaceId: 'w1',
      parentPageId: null,
      title: 'T',
      icon: null,
      position: 0,
      createdById: 'u1',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      // children 필드 없음
    };
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonRes([noChildren]));

    const result = await getPageTree('w1');
    expect(result[0]?.children).toBeNull();
  });
});
