import { describe, it, expect } from 'vitest';
import { toWire, makeInlineInsertOp } from '@ieum/crdt';
import { parseServerMessage } from '../protocol';
import type { OpMsg } from '../protocol';

// 보안: 서버→클라 메시지 파싱은 op 봉투 구조를 검증하고 prototype pollution을 차단한다.
describe('parseServerMessage', () => {
  const env = toWire(
    makeInlineInsertOp({ counter: 1, siteId: 'site_a' }, null, '안', { counter: 9, siteId: 'site_a' }),
    1,
    'site_a',
  );

  it('유효한 op 메시지를 OpMsg로 파싱한다', () => {
    const msg = parseServerMessage(JSON.stringify({ type: 'op', pageId: 'pg_x', op: env }));
    expect(msg).not.toBeNull();
    expect((msg as OpMsg).op.payload).toEqual(env.payload);
  });

  it('join-ack / op-ack를 파싱한다', () => {
    expect(parseServerMessage(JSON.stringify({ type: 'join-ack', pageId: 'p', connectedClients: 2 }))).not.toBeNull();
    expect(parseServerMessage(JSON.stringify({ type: 'op-ack', siteId: 's', seq: 1 }))).not.toBeNull();
  });

  it('보안: op 봉투 필드(siteId/seq/opType/payload)가 불완전하면 null을 반환한다', () => {
    expect(parseServerMessage(JSON.stringify({ type: 'op', pageId: 'p', op: { siteId: 's' } }))).toBeNull();
    expect(parseServerMessage(JSON.stringify({ type: 'op', pageId: 'p', op: { siteId: 's', seq: 1, opType: 'insert' } }))).toBeNull();
  });

  it('잘못된 JSON / 알 수 없는 타입은 null', () => {
    expect(parseServerMessage('{bad')).toBeNull();
    expect(parseServerMessage(JSON.stringify({ type: 'bogus' }))).toBeNull();
  });

  it('보안: __proto__ 키를 포함한 메시지는 null이며 prototype을 오염시키지 않는다', () => {
    const raw = '{"type":"op-ack","siteId":"s","seq":1,"__proto__":{"polluted":1}}';
    expect(parseServerMessage(raw)).toBeNull();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

// P6 / AC-4,5: presence 메시지 파싱 (아바타 목록).
describe('parseServerMessage — presence', () => {
  it('AC-4: presence-update를 파싱한다 (clientId/displayName/color)', () => {
    const raw = JSON.stringify({
      type: 'presence-update',
      clientId: 'c2',
      displayName: '사용자 #c3d4',
      color: '#64B5F6',
    });
    const msg = parseServerMessage(raw) as
      | { type: 'presence-update'; clientId: string; displayName: string; color: string }
      | null;
    expect(msg).not.toBeNull();
    expect(msg!.type).toBe('presence-update');
    expect(msg!.clientId).toBe('c2');
    expect(msg!.displayName).toBe('사용자 #c3d4');
    expect(msg!.color).toBe('#64B5F6');
  });

  it('AC-5: presence-leave를 파싱한다 (clientId)', () => {
    const raw = JSON.stringify({ type: 'presence-leave', clientId: 'c1' });
    const msg = parseServerMessage(raw) as { type: 'presence-leave'; clientId: string } | null;
    expect(msg).not.toBeNull();
    expect(msg!.type).toBe('presence-leave');
    expect(msg!.clientId).toBe('c1');
  });

  it('필드가 불완전한 presence 메시지는 null이다', () => {
    expect(
      parseServerMessage(JSON.stringify({ type: 'presence-update', clientId: 'c2', displayName: 'x' })),
    ).toBeNull(); // color 누락
    expect(parseServerMessage(JSON.stringify({ type: 'presence-leave' }))).toBeNull(); // clientId 누락
  });

  it('보안(S3): presence-update의 color가 hex(#RRGGBB)가 아니면 null이다', () => {
    expect(
      parseServerMessage(
        JSON.stringify({ type: 'presence-update', clientId: 'c2', displayName: 'x', color: 'red' }),
      ),
    ).toBeNull();
    expect(
      parseServerMessage(
        JSON.stringify({ type: 'presence-update', clientId: 'c2', displayName: 'x', color: 'javascript:alert(1)' }),
      ),
    ).toBeNull();
    // 유효 hex는 통과한다.
    expect(
      parseServerMessage(
        JSON.stringify({ type: 'presence-update', clientId: 'c2', displayName: 'x', color: '#E57373' }),
      ),
    ).not.toBeNull();
  });

  it('보안: presence 메시지의 __proto__는 null이며 prototype을 오염시키지 않는다', () => {
    const raw = '{"type":"presence-leave","clientId":"c1","__proto__":{"polluted":1}}';
    expect(parseServerMessage(raw)).toBeNull();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
