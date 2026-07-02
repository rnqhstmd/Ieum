import { describe, it, expect, vi } from 'vitest';
import { redirectOnAuthError } from '../redirectOnAuthError';
import { ApiError } from '@/src/lib/api';

describe('redirectOnAuthError', () => {
  it('401 ApiError면 /login으로 push하고 true를 반환한다', () => {
    const push = vi.fn();
    const handled = redirectOnAuthError(new ApiError(401, '미인증'), { push });
    expect(handled).toBe(true);
    expect(push).toHaveBeenCalledWith('/login');
  });

  it('401이 아닌 ApiError(500)면 push하지 않고 false를 반환한다', () => {
    const push = vi.fn();
    const handled = redirectOnAuthError(new ApiError(500, '서버 오류'), { push });
    expect(handled).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it('ApiError가 아닌 일반 에러면 push하지 않고 false를 반환한다', () => {
    const push = vi.fn();
    const handled = redirectOnAuthError(new Error('network'), { push });
    expect(handled).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });
});
