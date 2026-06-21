import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchCurrentUserId } from '../currentUser';

// WS-AUTH T5 / AC-8: /api/users/me에서 trust-relay할 실 userId를 얻는다(401/오류 → null).
afterEach(() => vi.unstubAllGlobals());

describe('fetchCurrentUserId', () => {
  it('200 + {id} → id 반환', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ id: 'U1', email: 'e@x', name: 'n' }) })),
    );
    expect(await fetchCurrentUserId()).toBe('U1');
  });

  it('401 → null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401 })));
    expect(await fetchCurrentUserId()).toBeNull();
  });

  it('네트워크 오류 → null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network');
      }),
    );
    expect(await fetchCurrentUserId()).toBeNull();
  });
});
