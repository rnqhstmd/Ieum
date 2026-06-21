import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { usePageTitle } from '../usePageTitle';

// 자동저장 T2 / AC-4,5: 제목 로드(GET)·저장(PATCH)을 api 모킹으로 격리 검증.
vi.mock('@/src/lib/api', () => ({ apiGet: vi.fn(), apiPatch: vi.fn() }));
import { apiGet, apiPatch } from '@/src/lib/api';

const PAGE = 'p-1';
const WS = 'ws-1';

beforeEach(() => {
  vi.mocked(apiGet).mockReset();
  vi.mocked(apiPatch).mockReset();
});

describe('usePageTitle', () => {
  it('AC-5: 마운트 시 단일 페이지 GET으로 title을 로드한다', async () => {
    vi.mocked(apiGet).mockResolvedValue({ id: PAGE, title: '기존제목', icon: null, workspaceId: WS });
    const { result } = renderHook(() => usePageTitle(PAGE, ''));
    expect(apiGet).toHaveBeenCalledWith(`/api/pages/${PAGE}`);
    await waitFor(() => expect(result.current.title).toBe('기존제목'));
  });

  it('AC-4: saveTitle은 GET의 workspaceId로 PATCH 경로를 구성해 제목을 영속한다', async () => {
    vi.mocked(apiGet).mockResolvedValue({ id: PAGE, title: '기존제목', icon: null, workspaceId: WS });
    vi.mocked(apiPatch).mockResolvedValue({});
    const { result } = renderHook(() => usePageTitle(PAGE, ''));
    await waitFor(() => expect(result.current.title).toBe('기존제목')); // GET 완료(wsId 확보)
    await act(async () => {
      await result.current.saveTitle('새 제목');
    });
    expect(apiPatch).toHaveBeenCalledWith(`/api/workspaces/${WS}/pages/${PAGE}`, {
      title: '새 제목',
      icon: null,
    });
  });

  it('AC-4(보호): GET 완료 전(wsId 없음) saveTitle은 PATCH하지 않는다', async () => {
    vi.mocked(apiGet).mockReturnValue(new Promise(() => {})); // 미완료
    const { result } = renderHook(() => usePageTitle(PAGE, ''));
    await act(async () => {
      await result.current.saveTitle('x');
    });
    expect(apiPatch).not.toHaveBeenCalled();
  });
});
