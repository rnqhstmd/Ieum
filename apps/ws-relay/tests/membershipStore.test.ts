import { describe, it, expect } from 'vitest';
import { InMemoryMembershipStore } from '../src/membershipStore.js';

// WS-AUTH T2 / AC-5(fake): InMemoryMembershipStore — allow한 (userId,pageId) 쌍만 멤버.
const U = '11111111-1111-4111-8111-111111111111';
const P = '33333333-3333-4333-8333-333333333333';
const X = '99999999-9999-4999-8999-999999999999';

describe('InMemoryMembershipStore', () => {
  it('allow한 (user,page)는 isMember true, 그 외는 false', async () => {
    const s = new InMemoryMembershipStore();
    s.allow(U, P);
    expect(await s.isMember(U, P)).toBe(true);
    expect(await s.isMember(X, P)).toBe(false); // 비멤버 user
    expect(await s.isMember(U, '44444444-4444-4444-8444-444444444444')).toBe(false); // 다른 page
  });
});
