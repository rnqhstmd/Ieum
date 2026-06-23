import { describe, it, expect } from 'vitest';
import { toWire, makeInlineInsertOp } from '@ieum/crdt';
import { parseServerMessage } from '../protocol';
import type { OpMsg, OpBatchMsg } from '../protocol';

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

  it('join-ack(clientId 포함) / op-ack를 파싱한다', () => {
    const ack = parseServerMessage(
      JSON.stringify({ type: 'join-ack', pageId: 'p', connectedClients: 2, clientId: 'c1' }),
    ) as { type: 'join-ack'; clientId: string } | null;
    expect(ack).not.toBeNull();
    expect(ack!.clientId).toBe('c1'); // P6 커서: localClientId 채널
    expect(parseServerMessage(JSON.stringify({ type: 'op-ack', siteId: 's', seq: 1 }))).not.toBeNull();
  });

  it('P6: clientId 없는 join-ack는 null이다', () => {
    expect(parseServerMessage(JSON.stringify({ type: 'join-ack', pageId: 'p', connectedClients: 2 }))).toBeNull();
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

// P6 라이브 커서 / AC-10 채널: cursor-update 파싱.
describe('parseServerMessage — cursor-update', () => {
  const blockId = { counter: 0, siteId: 'genesis' };

  it('cursor-update(anchorId null/RgaId)를 파싱한다', () => {
    const m1 = parseServerMessage(
      JSON.stringify({ type: 'cursor-update', clientId: 'c2', blockId, anchorId: null }),
    ) as { type: 'cursor-update'; clientId: string; anchorId: unknown } | null;
    expect(m1).not.toBeNull();
    expect(m1!.clientId).toBe('c2');
    expect(m1!.anchorId).toBeNull();

    const anchorId = { counter: 7, siteId: 'site_b' };
    const m2 = parseServerMessage(
      JSON.stringify({ type: 'cursor-update', clientId: 'c2', blockId, anchorId }),
    ) as { anchorId: unknown } | null;
    expect(m2).not.toBeNull();
    expect((m2 as { anchorId: unknown }).anchorId).toEqual(anchorId);
  });

  it('blockId가 RgaId가 아니거나 clientId 누락이면 null', () => {
    expect(
      parseServerMessage(JSON.stringify({ type: 'cursor-update', clientId: 'c2', blockId: { counter: 'x' }, anchorId: null })),
    ).toBeNull();
    expect(parseServerMessage(JSON.stringify({ type: 'cursor-update', blockId, anchorId: null }))).toBeNull();
  });

  it('보안: cursor-update의 __proto__는 null이며 prototype을 오염시키지 않는다', () => {
    const raw = '{"type":"cursor-update","clientId":"c2","blockId":{"counter":0,"siteId":"g"},"anchorId":null,"__proto__":{"polluted":1}}';
    expect(parseServerMessage(raw)).toBeNull();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('보안(C1/C2): counter 비정수·음수·무한 또는 siteId 과길이는 null', () => {
    expect(parseServerMessage(JSON.stringify({ type: 'cursor-update', clientId: 'c2', blockId: { counter: 1.5, siteId: 'g' }, anchorId: null }))).toBeNull();
    expect(parseServerMessage('{"type":"cursor-update","clientId":"c2","blockId":{"counter":1e999,"siteId":"g"},"anchorId":null}')).toBeNull();
    const longSite = 's'.repeat(100);
    expect(parseServerMessage(JSON.stringify({ type: 'cursor-update', clientId: 'c2', blockId: { counter: 0, siteId: longSite }, anchorId: null }))).toBeNull();
  });
});

// P9 / AC-A2,A4,A5: op-batch 메시지 파싱
describe('parseServerMessage — op-batch', () => {
  const validEnv = toWire(
    makeInlineInsertOp({ counter: 1, siteId: 'site_a' }, null, 'a', { counter: 0, siteId: 'genesis' }),
    1,
    'site_a',
  );

  it('유효한 op-batch를 OpBatchMsg로 파싱한다', () => {
    const raw = JSON.stringify({ type: 'op-batch', pageId: 'pg_1', ops: [validEnv] });
    const msg = parseServerMessage(raw) as OpBatchMsg | null;
    expect(msg).not.toBeNull();
    expect(msg!.type).toBe('op-batch');
    expect(msg!.pageId).toBe('pg_1');
    expect(msg!.ops).toHaveLength(1);
    expect(msg!.ops[0]!.siteId).toBe('site_a');
  });

  it('빈 ops 배열인 op-batch도 유효하게 파싱된다(AC-A4)', () => {
    const raw = JSON.stringify({ type: 'op-batch', pageId: 'pg_1', ops: [] });
    const msg = parseServerMessage(raw) as OpBatchMsg | null;
    expect(msg).not.toBeNull();
    expect(msg!.ops).toHaveLength(0);
  });

  it('pageId가 없는 op-batch는 null이다', () => {
    const raw = JSON.stringify({ type: 'op-batch', ops: [validEnv] });
    expect(parseServerMessage(raw)).toBeNull();
  });

  it('ops가 배열이 아닌 op-batch는 null이다', () => {
    expect(parseServerMessage(JSON.stringify({ type: 'op-batch', pageId: 'pg_1', ops: null }))).toBeNull();
    expect(parseServerMessage(JSON.stringify({ type: 'op-batch', pageId: 'pg_1', ops: 'bad' }))).toBeNull();
    expect(parseServerMessage(JSON.stringify({ type: 'op-batch', pageId: 'pg_1' }))).toBeNull();
  });

  it('ops 배열 안에 봉투 필드(siteId/seq/opType/payload) 위반 항목이 있으면 null이다', () => {
    const badEnv = { siteId: 'site_a', seq: 1 }; // opType/payload 누락
    expect(parseServerMessage(JSON.stringify({ type: 'op-batch', pageId: 'pg_1', ops: [badEnv] }))).toBeNull();
  });

  it('보안: op-batch에 __proto__ 키가 있으면 null이며 prototype을 오염시키지 않는다', () => {
    const raw = '{"type":"op-batch","pageId":"pg_1","ops":[],"__proto__":{"polluted":1}}';
    expect(parseServerMessage(raw)).toBeNull();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  // C3: payload 내부 위험 키 — 봉투 최상위가 아닌 payload 객체 안의 위험 키도 차단한다.
  // JSON.stringify는 __proto__를 자동 삭제하므로 raw 문자열을 직접 주입한다.
  it('보안(C3): op-batch의 ops 항목 payload에 __proto__ 키가 있으면 null이다', () => {
    const raw = '{"type":"op-batch","pageId":"pg_1","ops":[{"siteId":"site_a","seq":1,"opType":"insert","payload":{"data":"x","__proto__":{"polluted":99}}}]}';
    expect(parseServerMessage(raw)).toBeNull();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('보안(C3): op-batch의 ops 항목 payload에 constructor 키가 있으면 null이다', () => {
    const envWithConstructorPayload = {
      siteId: 'site_a',
      seq: 1,
      opType: 'insert',
      payload: { constructor: { prototype: { polluted: 99 } } },
    };
    const raw = JSON.stringify({ type: 'op-batch', pageId: 'pg_1', ops: [envWithConstructorPayload] });
    expect(parseServerMessage(raw)).toBeNull();
  });
});
