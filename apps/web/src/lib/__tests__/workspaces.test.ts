import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listWorkspaces } from '@/src/lib/workspaces';

const jsonRes = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('listWorkspaces', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('AC-1: GET /api/workspaces를 credentials:include로 호출하고 Workspace[]로 파싱한다', async () => {
    const data = [
      { id: 'w1', name: '내 워크스페이스', type: 'PERSONAL', ownerId: 'u1', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'w2', name: '이음 팀', type: 'SHARED', ownerId: 'u2', createdAt: '2026-01-02T00:00:00Z' },
    ];
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(jsonRes(data));

    const result = await listWorkspaces();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/workspaces$/);
    expect(init?.method).toBe('GET');
    expect(init?.credentials).toBe('include');
    expect(result).toEqual(data);
  });

  it('AC-4: 스키마 위반 응답(type 누락)이면 검증 에러를 던진다', async () => {
    const bad = [{ id: 'w1', name: 'x', ownerId: 'u1', createdAt: '2026-01-01T00:00:00Z' }];
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonRes(bad));

    await expect(listWorkspaces()).rejects.toThrow();
  });
});
