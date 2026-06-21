import { describe, it, expect, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { toWire, makeInlineInsertOp } from '@ieum/crdt';
import { createRelayServer } from '../src/server.js';
import type { RelayServer } from '../src/server.js';
import type { OpStore, AppendOutcome } from '../src/opStore.js';

// T6 / AC-1: 실제 ws 서버 기동 → 연결 수락. port:0(OS 임의 포트) + teardown으로 flaky 최소화.
let server: RelayServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

function open(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.on('open', () => resolve());
    ws.on('error', reject);
  });
}

describe('relay server (ws 어댑터)', () => {
  it('AC-1: 클라이언트의 WebSocket 연결을 수락한다', async () => {
    server = await createRelayServer({ port: 0 });
    expect(server.port).toBeGreaterThan(0);
    const ws = new WebSocket(`ws://localhost:${server.port}`);
    await open(ws);
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it('join 메시지에 join-ack로 응답한다 (서버↔RoomRegistry 배선)', async () => {
    server = await createRelayServer({ port: 0 });
    const ws = new WebSocket(`ws://localhost:${server.port}`);
    const ack = await new Promise<{ type: string; pageId: string; connectedClients: number }>(
      (resolve, reject) => {
        ws.on('open', () => ws.send(JSON.stringify({ type: 'join', pageId: 'pg_x' })));
        // P6: join 응답에 join-ack + (self) presence-update가 함께 오므로 join-ack를 선택 수신.
        ws.on('message', (data) => {
          const m = JSON.parse(data.toString());
          if (m.type === 'join-ack') resolve(m);
        });
        ws.on('error', reject);
      },
    );
    expect(ack.type).toBe('join-ack');
    expect(ack.pageId).toBe('pg_x');
    expect(ack.connectedClients).toBe(1);
    ws.close();
  });

  it('보안: 연결 수 상한 초과 시 새 연결을 닫는다', async () => {
    server = await createRelayServer({ port: 0, maxConnections: 1 });
    const ws1 = new WebSocket(`ws://localhost:${server.port}`);
    await open(ws1);
    const ws2 = new WebSocket(`ws://localhost:${server.port}`);
    const closed = await new Promise<boolean>((resolve) => {
      ws2.on('close', () => resolve(true));
      ws2.on('open', () => {
        // 열렸더라도 서버가 즉시 닫으면 close 이벤트가 따라온다.
      });
      ws2.on('error', () => resolve(true));
    });
    expect(closed).toBe(true);
    ws1.close();
  });

  it('내성: 클라이언트가 비정상 종료(terminate)해도 서버가 계속 동작한다', async () => {
    server = await createRelayServer({ port: 0 });
    const ws1 = new WebSocket(`ws://localhost:${server.port}`);
    await open(ws1);
    ws1.terminate(); // 비정상 종료 → 서버 소켓 error/close
    await new Promise((r) => setTimeout(r, 30));
    // 서버가 살아있어야 새 연결을 수락한다.
    const ws2 = new WebSocket(`ws://localhost:${server.port}`);
    await open(ws2);
    expect(ws2.readyState).toBe(WebSocket.OPEN);
    ws2.close();
  });
});

// T3 / AC-1,6,8: op 영속화 배선 — append 선행 후 outcome으로 dispatch (server 어댑터).
describe('relay server — op 영속화 배선 (T3)', () => {
  const PAGE = '550e8400-e29b-41d4-a716-446655440000';

  function fakeStore(outcome: AppendOutcome): {
    store: OpStore;
    calls: Array<{ pageId: string; siteId: string; seq: number }>;
  } {
    const calls: Array<{ pageId: string; siteId: string; seq: number }> = [];
    return {
      calls,
      store: {
        async append(pageId, op) {
          calls.push({ pageId, siteId: op.siteId, seq: op.seq });
          return outcome;
        },
      },
    };
  }

  function connectAndJoin(port: number, pageId: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      ws.on('open', () => ws.send(JSON.stringify({ type: 'join', pageId })));
      ws.on('message', (data) => {
        if (JSON.parse(data.toString()).type === 'join-ack') resolve(ws);
      });
      ws.on('error', reject);
    });
  }

  function opMessage(pageId: string, siteId: string, seq: number): string {
    const env = toWire(
      makeInlineInsertOp({ counter: seq, siteId }, null, '안', { counter: 99, siteId }),
      seq,
      siteId,
    );
    return JSON.stringify({ type: 'op', pageId, op: env });
  }

  it('AC-1: 유효 op는 opStore.append(pageId,op) 호출 후 peer에 broadcast된다', async () => {
    const { store, calls } = fakeStore('persisted');
    server = await createRelayServer({ port: 0, opStore: store });
    const a = await connectAndJoin(server.port, PAGE);
    const b = await connectAndJoin(server.port, PAGE);
    const gotOp = new Promise<{ op: { siteId: string } }>((resolve) => {
      b.on('message', (data) => {
        const m = JSON.parse(data.toString());
        if (m.type === 'op') resolve(m);
      });
    });
    a.send(opMessage(PAGE, 'site_a', 1));
    const m = await gotOp;
    expect(m.op.siteId).toBe('site_a');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ pageId: PAGE, siteId: 'site_a', seq: 1 });
    a.close();
    b.close();
  });

  it('AC-6: opStore가 rejected면 broadcast/op-ack 없음(미영속 무전파)', async () => {
    const { store } = fakeStore('rejected');
    server = await createRelayServer({ port: 0, opStore: store });
    const a = await connectAndJoin(server.port, PAGE);
    const b = await connectAndJoin(server.port, PAGE);
    let gotOp = false;
    let gotAck = false;
    b.on('message', (data) => {
      if (JSON.parse(data.toString()).type === 'op') gotOp = true;
    });
    a.on('message', (data) => {
      if (JSON.parse(data.toString()).type === 'op-ack') gotAck = true;
    });
    a.send(opMessage(PAGE, 'site_a', 1));
    await new Promise((r) => setTimeout(r, 80)); // 전파 대기
    expect(gotOp).toBe(false);
    expect(gotAck).toBe(false);
    a.close();
    b.close();
  });

  it('AC-8: opStore 미주입 시 InMemoryOpStore로 동작 — UUID page op가 broadcast된다', async () => {
    server = await createRelayServer({ port: 0 }); // 기본 InMemoryOpStore
    const a = await connectAndJoin(server.port, PAGE);
    const b = await connectAndJoin(server.port, PAGE);
    const gotOp = new Promise<{ op: { siteId: string } }>((resolve) => {
      b.on('message', (data) => {
        const m = JSON.parse(data.toString());
        if (m.type === 'op') resolve(m);
      });
    });
    a.send(opMessage(PAGE, 'site_a', 1));
    const m = await gotOp;
    expect(m.op.siteId).toBe('site_a');
    a.close();
    b.close();
  });
});
