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
