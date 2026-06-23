import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchCurrentUser } from '../currentUser';

// WS-AUTH-01 AC-09/AC-10: /api/users/me에서 {userId, token}을 얻는다.
// 401/오류 → null. token 없는 200 → {userId, token: null}.
afterEach(() => vi.unstubAllGlobals());

describe('fetchCurrentUser', () => {
  it('200 + {id, token} → {userId, token} 반환', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ id: 'U1', token: 'tok-abc', email: 'e@x', name: 'n' }),
      })),
    );
    expect(await fetchCurrentUser()).toEqual({ userId: 'U1', token: 'tok-abc' });
  });

  it('200 + {id} but token 없음 → {userId, token: null}', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ id: 'U1', email: 'e@x', name: 'n' }),
      })),
    );
    expect(await fetchCurrentUser()).toEqual({ userId: 'U1', token: null });
  });

  it('200 + id 없음 → null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ email: 'e@x' }),
      })),
    );
    expect(await fetchCurrentUser()).toBeNull();
  });

  it('401 → null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401 })));
    expect(await fetchCurrentUser()).toBeNull();
  });

  it('네트워크 오류 → null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network');
      }),
    );
    expect(await fetchCurrentUser()).toBeNull();
  });
});
