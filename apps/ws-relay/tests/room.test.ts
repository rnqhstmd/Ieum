import { describe, it, expect } from 'vitest';
import { toWire, makeInlineInsertOp } from '@ieum/crdt';
import { RoomRegistry } from '../src/room.js';
import type { ClientHandle } from '../src/room.js';
import type { JoinAckMsg, OpAckMsg, OpMsg } from '../src/protocol.js';

// T2 / AC-2,3,4,9: RoomRegistry는 send를 수행하지 않고 Dispatch[]를 반환한다(순수 라우팅).
describe('RoomRegistry', () => {
  const PAGE = 'pg_test001';
  function opMsg(siteId: string, seq: number): OpMsg {
    const env = toWire(
      makeInlineInsertOp({ counter: seq, siteId }, null, '안', { counter: 99, siteId }),
      seq,
      siteId,
    );
    return { type: 'op', pageId: PAGE, op: env };
  }
  const A: ClientHandle = { id: 'a' };
  const B: ClientHandle = { id: 'b' };

  it('AC-2: join 시 발신자에게 join-ack(connectedClients=room size)를 반환한다', () => {
    const reg = new RoomRegistry();
    const d1 = reg.join(A, PAGE);
    // P6: join은 join-ack 외 presence-update도 반환하므로 join-ack를 find로 견고화(불변식: [0]=join-ack).
    const ack1 = d1.find((d) => d.message.type === 'join-ack')!;
    expect(ack1.target).toBe(A);
    const ack = ack1.message as JoinAckMsg;
    expect(ack.type).toBe('join-ack');
    expect(ack.pageId).toBe(PAGE);
    expect(ack.connectedClients).toBe(1);

    const d2 = reg.join(B, PAGE);
    const ack2 = d2.find((d) => d.message.type === 'join-ack')!.message as JoinAckMsg;
    expect(ack2.connectedClients).toBe(2);
  });

  it('AC-3/BR-2: op는 같은 room의 다른 클라이언트에 broadcast되고 발신자는 제외된다', () => {
    const reg = new RoomRegistry();
    reg.join(A, PAGE);
    reg.join(B, PAGE);
    const dispatches = reg.handleOp(A, opMsg('site_a', 1));

    const broadcastTargets = dispatches.filter((d) => d.message.type === 'op').map((d) => d.target);
    expect(broadcastTargets).toContain(B);
    expect(broadcastTargets).not.toContain(A);
    const broadcast = dispatches.find((d) => d.message.type === 'op')!.message as OpMsg;
    expect(broadcast.op.siteId).toBe('site_a');
  });

  it('AC-4: op 발신자에게 op-ack(siteId, seq)를 반환한다', () => {
    const reg = new RoomRegistry();
    reg.join(A, PAGE);
    reg.join(B, PAGE);
    const dispatches = reg.handleOp(A, opMsg('site_a', 7));
    const ackDispatch = dispatches.find((d) => d.message.type === 'op-ack');
    expect(ackDispatch).toBeDefined();
    expect(ackDispatch!.target).toBe(A);
    const ack = ackDispatch!.message as OpAckMsg;
    expect(ack.siteId).toBe('site_a');
    expect(ack.seq).toBe(7);
  });

  it('AC-9/BR-6: 혼자 접속 시 op는 broadcast 0이어도 op-ack를 반환하고 throw하지 않는다', () => {
    const reg = new RoomRegistry();
    reg.join(A, PAGE);
    let dispatches: ReturnType<RoomRegistry['handleOp']> = [];
    expect(() => {
      dispatches = reg.handleOp(A, opMsg('site_a', 1));
    }).not.toThrow();
    expect(dispatches.filter((d) => d.message.type === 'op')).toHaveLength(0);
    expect(dispatches.filter((d) => d.message.type === 'op-ack')).toHaveLength(1);
  });

  it('보안: join한 room과 다른 pageId op는 broadcast하지 않고 op-ack만 반환한다(교차 주입 차단)', () => {
    const reg = new RoomRegistry();
    reg.join(A, PAGE); // A는 pg_test001에 join
    reg.join(B, 'pg_other'); // B는 다른 room
    // A가 자신이 join하지 않은 pg_other로 op를 보내도 B에게 broadcast되면 안 된다.
    const spoof: OpMsg = { ...opMsg('site_a', 1), pageId: 'pg_other' };
    const dispatches = reg.handleOp(A, spoof);
    expect(dispatches.filter((d) => d.message.type === 'op')).toHaveLength(0);
    expect(dispatches.filter((d) => d.message.type === 'op-ack')).toHaveLength(1);
  });

  it('보안: join하지 않은 클라이언트의 op는 op-ack만 반환한다', () => {
    const reg = new RoomRegistry();
    reg.join(B, PAGE);
    const C: ClientHandle = { id: 'c' }; // join 안 함
    const dispatches = reg.handleOp(C, opMsg('site_c', 1));
    expect(dispatches.filter((d) => d.message.type === 'op')).toHaveLength(0);
    expect(dispatches.filter((d) => d.message.type === 'op-ack')).toHaveLength(1);
  });

  it('leave 후에는 broadcast 대상에서 제외되고 roomSize가 감소한다', () => {
    const reg = new RoomRegistry();
    reg.join(A, PAGE);
    reg.join(B, PAGE);
    expect(reg.roomSize(PAGE)).toBe(2);
    reg.leave(B);
    expect(reg.roomSize(PAGE)).toBe(1);
    const dispatches = reg.handleOp(A, opMsg('site_a', 1));
    expect(dispatches.filter((d) => d.message.type === 'op')).toHaveLength(0);
  });
});
