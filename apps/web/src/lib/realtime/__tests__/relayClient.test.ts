import { describe, it, expect, vi } from 'vitest';
import { toWire, makeInlineInsertOp } from '@ieum/crdt';
import type { WireEnvelope } from '@ieum/crdt';
import { createRelayClient } from '../relayClient';
import { createFakeTransport } from './fakeTransport';

// T3 / AC-5,6: 클라이언트 relay 세션 — Transport 주입으로 격리 검증.
const PAGE = 'pg_test001';
function env(siteId: string, seq: number): WireEnvelope {
  return toWire(
    makeInlineInsertOp({ counter: seq, siteId }, null, '안', { counter: 99, siteId }),
    seq,
    siteId,
  );
}

describe('relayClient', () => {
  it('onOpen 시 join 메시지를 자동 전송한다', () => {
    const t = createFakeTransport();
    createRelayClient(t, PAGE, { onRemoteOp: () => {} });
    t.emitOpen();
    expect(t.sent).toContain(JSON.stringify({ type: 'join', pageId: PAGE }));
  });

  // WS-AUTH T5 / AC-8: getUserId가 현재 userId를 주면 join에 trust-relay로 싣는다.
  it('AC-8: getUserId가 있으면 join 메시지에 userId를 포함한다', () => {
    const t = createFakeTransport();
    createRelayClient(t, PAGE, { onRemoteOp: () => {} }, { getUserId: () => 'U1' });
    t.emitOpen();
    expect(t.sent).toContain(JSON.stringify({ type: 'join', pageId: PAGE, userId: 'U1' }));
  });

  it('AC-8: getUserId가 undefined를 주면 userId 없이 join한다(회귀 방지)', () => {
    const t = createFakeTransport();
    createRelayClient(t, PAGE, { onRemoteOp: () => {} }, { getUserId: () => undefined });
    t.emitOpen();
    expect(t.sent).toContain(JSON.stringify({ type: 'join', pageId: PAGE }));
  });

  // WS-AUTH(레이스 수정): ready가 있으면 join을 ready 완료 후로 미뤄 userId를 보장한다.
  it('AC-8(레이스): ready가 있으면 join을 ready 완료 후로 미루고 그때 userId를 싣는다', async () => {
    const t = createFakeTransport();
    let resolveReady!: () => void;
    const readyPromise = new Promise<void>((r) => {
      resolveReady = r;
    });
    const ready = () => readyPromise; // WS-AUTH-01: ready는 팩토리(매 open마다 호출)
    let userId: string | undefined;
    createRelayClient(t, PAGE, { onRemoteOp: () => {} }, { getUserId: () => userId, ready });
    t.emitOpen();
    expect(t.sent).toHaveLength(0); // ready 전엔 join하지 않는다
    userId = 'U2'; // ready 완료 시점에 fetch된 userId
    resolveReady();
    await ready;
    await Promise.resolve();
    expect(t.sent).toContain(JSON.stringify({ type: 'join', pageId: PAGE, userId: 'U2' }));
  });

  it('AC-5: sendOp은 {type:"op",pageId,op:WireEnvelope} 형식으로 전송한다', () => {
    const t = createFakeTransport();
    const client = createRelayClient(t, PAGE, { onRemoteOp: () => {} });
    const e = env('site_a', 1);
    client.sendOp(e);
    const last = JSON.parse(t.sent[t.sent.length - 1]!);
    expect(last.type).toBe('op');
    expect(last.pageId).toBe(PAGE);
    expect(last.op).toEqual(e);
    expect(last.op.opType).toBe('insert');
    expect(last.op.payload).toEqual(e.payload);
  });

  it('AC-6: 수신한 op 메시지를 onRemoteOp(env)로 라우팅한다', () => {
    const t = createFakeTransport();
    const onRemoteOp = vi.fn();
    createRelayClient(t, PAGE, { onRemoteOp });
    const e = env('site_b', 3);
    t.emitMessage(JSON.stringify({ type: 'op', pageId: PAGE, op: e }));
    expect(onRemoteOp).toHaveBeenCalledTimes(1);
    expect(onRemoteOp).toHaveBeenCalledWith(e);
  });

  it('join-ack(clientId 포함) / op-ack를 핸들러로 라우팅한다', () => {
    const t = createFakeTransport();
    const onJoinAck = vi.fn();
    const onOpAck = vi.fn();
    createRelayClient(t, PAGE, { onRemoteOp: () => {}, onJoinAck, onOpAck });
    t.emitMessage(JSON.stringify({ type: 'join-ack', pageId: PAGE, connectedClients: 2, clientId: 'c1' }));
    t.emitMessage(JSON.stringify({ type: 'op-ack', siteId: 'site_a', seq: 5 }));
    expect(onJoinAck).toHaveBeenCalledWith(2, 'c1'); // P6: localClientId 채널
    expect(onOpAck).toHaveBeenCalledWith('site_a', 5);
  });

  it('dispose 후에는 수신 메시지를 라우팅하지 않고 transport를 닫는다', () => {
    const t = createFakeTransport();
    const onRemoteOp = vi.fn();
    const client = createRelayClient(t, PAGE, { onRemoteOp });
    client.dispose();
    expect(t.closed).toBe(true);
    t.emitMessage(JSON.stringify({ type: 'op', pageId: PAGE, op: env('site_b', 1) }));
    expect(onRemoteOp).not.toHaveBeenCalled();
  });

  // P6 라이브 커서
  it('AC-10: cursor-update를 onCursorUpdate(info)로 라우팅한다', () => {
    const t = createFakeTransport();
    const onCursorUpdate = vi.fn();
    createRelayClient(t, PAGE, { onRemoteOp: () => {}, onCursorUpdate });
    const blockId = { counter: 0, siteId: 'genesis' };
    const anchorId = { counter: 5, siteId: 'site_b' };
    t.emitMessage(JSON.stringify({ type: 'cursor-update', clientId: 'c2', blockId, anchorId }));
    expect(onCursorUpdate).toHaveBeenCalledTimes(1);
    expect(onCursorUpdate).toHaveBeenCalledWith({ clientId: 'c2', blockId, anchorId });
  });

  it('FR-1: sendCursor는 {type:"cursor",pageId,blockId,anchorId} 형식으로 전송한다', () => {
    const t = createFakeTransport();
    const client = createRelayClient(t, PAGE, { onRemoteOp: () => {} });
    const blockId = { counter: 0, siteId: 'genesis' };
    client.sendCursor(blockId, null);
    const last = JSON.parse(t.sent[t.sent.length - 1]!);
    expect(last).toEqual({ type: 'cursor', pageId: PAGE, blockId, anchorId: null });
  });

  // P6 presence (아바타 목록)
  it('AC-4: presence-update를 onPresenceUpdate(info)로 라우팅한다', () => {
    const t = createFakeTransport();
    const onPresenceUpdate = vi.fn();
    createRelayClient(t, PAGE, { onRemoteOp: () => {}, onPresenceUpdate });
    t.emitMessage(
      JSON.stringify({ type: 'presence-update', clientId: 'c2', displayName: '사용자 #c3d4', color: '#64B5F6' }),
    );
    expect(onPresenceUpdate).toHaveBeenCalledTimes(1);
    expect(onPresenceUpdate).toHaveBeenCalledWith({
      clientId: 'c2',
      displayName: '사용자 #c3d4',
      color: '#64B5F6',
    });
  });

  it('AC-5: presence-leave를 onPresenceLeave(clientId)로 라우팅한다', () => {
    const t = createFakeTransport();
    const onPresenceLeave = vi.fn();
    createRelayClient(t, PAGE, { onRemoteOp: () => {}, onPresenceLeave });
    t.emitMessage(JSON.stringify({ type: 'presence-leave', clientId: 'c1' }));
    expect(onPresenceLeave).toHaveBeenCalledWith('c1');
  });

  it('FR-1: opts.displayName이 있으면 join에 presence를 포함해 전송한다', () => {
    const t = createFakeTransport();
    createRelayClient(t, PAGE, { onRemoteOp: () => {} }, { displayName: '사용자 #a1b2' });
    t.emitOpen();
    const join = JSON.parse(t.sent[t.sent.length - 1]!);
    expect(join).toEqual({ type: 'join', pageId: PAGE, presence: { displayName: '사용자 #a1b2' } });
  });

  it('회귀가드: opts 미제공 시 join은 presence 없이 {type,pageId}만 전송한다', () => {
    const t = createFakeTransport();
    createRelayClient(t, PAGE, { onRemoteOp: () => {} });
    t.emitOpen();
    expect(t.sent).toContain(JSON.stringify({ type: 'join', pageId: PAGE }));
  });

  // P9 / AC-A2,A4,A5: op-batch 수신 시 onOpBatch 핸들러 라우팅
  // pageId 검증(C3): onOpBatch는 (ops, pageId) 2개 인자로 호출되어야 한다.
  it('P9: op-batch 메시지 수신 시 onOpBatch(ops, pageId)를 호출한다', () => {
    const t = createFakeTransport();
    const onOpBatch = vi.fn();
    createRelayClient(t, PAGE, { onRemoteOp: () => {}, onOpBatch });
    const e = env('site_b', 1);
    t.emitMessage(JSON.stringify({ type: 'op-batch', pageId: PAGE, ops: [e] }));
    expect(onOpBatch).toHaveBeenCalledTimes(1);
    expect(onOpBatch).toHaveBeenCalledWith([e], PAGE);
  });

  it('P9: op-batch ops 배열을 onOpBatch에 그대로 전달한다 (인자 구조 검증)', () => {
    const t = createFakeTransport();
    const onOpBatch = vi.fn();
    createRelayClient(t, PAGE, { onRemoteOp: () => {}, onOpBatch });
    const e1 = env('site_b', 1);
    const e2 = env('site_b', 2);
    t.emitMessage(JSON.stringify({ type: 'op-batch', pageId: PAGE, ops: [e1, e2] }));
    expect(onOpBatch).toHaveBeenCalledWith([e1, e2], PAGE);
  });

  it('P9: 빈 ops 배열 op-batch 수신 시 onOpBatch([], pageId)를 호출한다 (AC-A4)', () => {
    const t = createFakeTransport();
    const onOpBatch = vi.fn();
    createRelayClient(t, PAGE, { onRemoteOp: () => {}, onOpBatch });
    t.emitMessage(JSON.stringify({ type: 'op-batch', pageId: PAGE, ops: [] }));
    expect(onOpBatch).toHaveBeenCalledTimes(1);
    expect(onOpBatch).toHaveBeenCalledWith([], PAGE);
  });

  it('P9: onOpBatch 미제공 시 op-batch 수신해도 에러 없이 무시된다', () => {
    const t = createFakeTransport();
    const onRemoteOp = vi.fn();
    createRelayClient(t, PAGE, { onRemoteOp }); // onOpBatch 없음
    const e = env('site_b', 1);
    // 에러 없이 처리되어야 하며 onRemoteOp는 호출되지 않는다
    expect(() =>
      t.emitMessage(JSON.stringify({ type: 'op-batch', pageId: PAGE, ops: [e] })),
    ).not.toThrow();
    expect(onRemoteOp).not.toHaveBeenCalled();
  });

  // WS-AUTH-IDENTITY / AC-8: op-batch-error 수신 시 onOpBatchError 라우팅
  it('AC-8a: op-batch-error 수신 시 onOpBatchError(pageId)를 호출하고 onOpBatch는 호출하지 않는다', () => {
    const t = createFakeTransport();
    const onOpBatchError = vi.fn();
    const onOpBatch = vi.fn();
    createRelayClient(t, PAGE, { onRemoteOp: () => {}, onOpBatch, onOpBatchError });
    t.emitMessage(JSON.stringify({ type: 'op-batch-error', pageId: 'p1' }));
    expect(onOpBatchError).toHaveBeenCalledTimes(1);
    expect(onOpBatchError).toHaveBeenCalledWith('p1');
    expect(onOpBatch).not.toHaveBeenCalled();
  });

  it('AC-8b(회귀가드): onOpBatchError 미제공 시 op-batch-error 수신해도 에러 없이 무시된다', () => {
    const t = createFakeTransport();
    createRelayClient(t, PAGE, { onRemoteOp: () => {} }); // onOpBatchError 없음
    expect(() =>
      t.emitMessage(JSON.stringify({ type: 'op-batch-error', pageId: 'p1' })),
    ).not.toThrow();
  });
});
