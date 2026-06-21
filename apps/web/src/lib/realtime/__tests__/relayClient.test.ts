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
});
