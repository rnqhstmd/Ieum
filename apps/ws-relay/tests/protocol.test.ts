import { describe, it, expect } from 'vitest';
import { toWire, makeInlineInsertOp } from '@ieum/crdt';
import { parseClientMessage } from '../src/protocol.js';
import type { JoinMsg, OpMsg } from '../src/protocol.js';

// T1 / BR-1, BR-3: 클라이언트→서버 메시지 파싱은 06-api §2 계약을 따른다.
describe('relay protocol — parseClientMessage', () => {
  const env = toWire(
    makeInlineInsertOp({ counter: 1, siteId: 'site_a' }, null, '안', { counter: 99, siteId: 'site_a' }),
    1,
    'site_a',
  );

  it('BR-1: 유효한 join 메시지를 JoinMsg로 파싱한다', () => {
    const raw = JSON.stringify({ type: 'join', pageId: 'pg_test001' });
    const msg = parseClientMessage(raw);
    expect(msg).not.toBeNull();
    expect(msg!.type).toBe('join');
    expect((msg as JoinMsg).pageId).toBe('pg_test001');
  });

  it('BR-1/BR-3: 유효한 op 메시지를 OpMsg로 파싱한다 (op는 WireEnvelope)', () => {
    const raw = JSON.stringify({ type: 'op', pageId: 'pg_test001', op: env });
    const msg = parseClientMessage(raw);
    expect(msg).not.toBeNull();
    expect(msg!.type).toBe('op');
    const op = (msg as OpMsg).op;
    expect(op.siteId).toBe('site_a');
    expect(op.seq).toBe(1);
    expect(op.opType).toBe('insert'); // WireEnvelope.opType = op.type (소문자, 결정2)
    expect(op.payload).toEqual(env.payload);
  });

  it('잘못된 JSON 문자열은 null을 반환한다', () => {
    expect(parseClientMessage('{not json')).toBeNull();
  });

  it('type 필드가 없으면 null을 반환한다', () => {
    expect(parseClientMessage(JSON.stringify({ pageId: 'pg_x' }))).toBeNull();
  });

  it('알 수 없는 type은 null을 반환한다 (서버→클라 타입 포함)', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'join-ack', pageId: 'pg_x' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: 'bogus' }))).toBeNull();
  });

  it('join에 pageId가 없으면 null을 반환한다', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'join' }))).toBeNull();
  });

  it('op에 op 봉투가 없으면 null을 반환한다', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'op', pageId: 'pg_x' }))).toBeNull();
  });

  it('보안: __proto__ 키를 포함한 메시지는 null을 반환하고 prototype을 오염시키지 않는다', () => {
    const raw = '{"type":"join","pageId":"x","__proto__":{"polluted":1}}';
    expect(parseClientMessage(raw)).toBeNull();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

// P6 / FR-1, BR-4: join 메시지의 presence 확장 (아바타 displayName 운반).
describe('relay protocol — parseClientMessage presence 확장', () => {
  type JoinWithPresence = { type: 'join'; pageId: string; presence?: { displayName?: string } };

  it('FR-1: join에 presence.displayName이 있으면 채택한다', () => {
    const raw = JSON.stringify({ type: 'join', pageId: 'pg_p', presence: { displayName: '사용자 #a1b2' } });
    const msg = parseClientMessage(raw) as JoinWithPresence | null;
    expect(msg).not.toBeNull();
    expect(msg!.type).toBe('join');
    expect(msg!.presence?.displayName).toBe('사용자 #a1b2');
  });

  it('BR-4: presence가 없는 join도 유효하다(presence는 undefined)', () => {
    const raw = JSON.stringify({ type: 'join', pageId: 'pg_p' });
    const msg = parseClientMessage(raw) as JoinWithPresence | null;
    expect(msg).not.toBeNull();
    expect(msg!.presence).toBeUndefined();
  });

  it('BR-4: presence.displayName이 문자열이 아니면 displayName을 버리되 join은 유효하다', () => {
    const raw = JSON.stringify({ type: 'join', pageId: 'pg_p', presence: { displayName: 123 } });
    const msg = parseClientMessage(raw) as JoinWithPresence | null;
    expect(msg).not.toBeNull();
    expect(msg!.type).toBe('join');
    expect(msg!.presence?.displayName).toBeUndefined();
  });

  it('보안: presence에 dangerous key가 있으면 null을 반환한다', () => {
    const raw = '{"type":"join","pageId":"x","presence":{"__proto__":{"polluted":1}}}';
    expect(parseClientMessage(raw)).toBeNull();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('보안(S2): 과도하게 긴 displayName(>64)은 버리고 join은 유효하게 둔다(브로드캐스트 증폭 차단)', () => {
    const long = 'x'.repeat(100);
    const raw = JSON.stringify({ type: 'join', pageId: 'pg_p', presence: { displayName: long } });
    const msg = parseClientMessage(raw) as JoinWithPresence | null;
    expect(msg).not.toBeNull();
    expect(msg!.type).toBe('join');
    expect(msg!.presence?.displayName).toBeUndefined();
  });

  it('방어(S2): presence가 배열이면 displayName 없이 join으로 처리한다', () => {
    const raw = JSON.stringify({ type: 'join', pageId: 'pg_p', presence: ['x'] });
    const msg = parseClientMessage(raw) as JoinWithPresence | null;
    expect(msg).not.toBeNull();
    expect(msg!.presence).toBeUndefined();
  });
});
