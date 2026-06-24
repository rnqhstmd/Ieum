import { describe, it, expect, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { toWire, makeInlineInsertOp } from '@ieum/crdt';
import { createRelayServer } from '../src/server.js';
import type { RelayServer } from '../src/server.js';
import type { OpStore, AppendOutcome } from '../src/opStore.js';
import { InMemoryMembershipStore } from '../src/membershipStore.js';

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
        async loadByPage() { return []; },
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

// WS-AUTH T3 / AC-3,4: membershipStore 주입 시 join이 멤버십 게이트를 통과해야 한다.
describe('relay server — 멤버십 게이트 (T3)', () => {
  const PAGE = '550e8400-e29b-41d4-a716-446655440000';
  const U = '11111111-1111-4111-8111-111111111111';
  const X = '99999999-9999-4999-8999-999999999999';

  // join 송신 후 join-ack 수신 또는 close(코드) 중 먼저 오는 것을 반환.
  function joinResult(port: number, pageId: string, userId: string): Promise<string> {
    return new Promise((resolve) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      ws.on('open', () => ws.send(JSON.stringify({ type: 'join', pageId, userId })));
      ws.on('message', (data) => {
        if (JSON.parse(data.toString()).type === 'join-ack') resolve('ack');
      });
      ws.on('close', (code) => resolve(`close:${code}`));
      ws.on('error', () => {
        /* close가 따라온다 */
      });
    });
  }

  it('AC-3: 멤버는 join-ack로 합류한다', async () => {
    const ms = new InMemoryMembershipStore();
    ms.allow(U, PAGE);
    server = await createRelayServer({ port: 0, membershipStore: ms });
    expect(await joinResult(server.port, PAGE, U)).toBe('ack');
  });

  it('AC-4: 비멤버는 close(4003)로 거부되고 join-ack가 없다', async () => {
    const ms = new InMemoryMembershipStore(); // X 미허용
    server = await createRelayServer({ port: 0, membershipStore: ms });
    expect(await joinResult(server.port, PAGE, X)).toBe('close:4003');
  });

  it('AC-4(S3): userId 없는 join은 게이트 활성 시 close(4003)', async () => {
    const ms = new InMemoryMembershipStore();
    ms.allow(U, PAGE);
    server = await createRelayServer({ port: 0, membershipStore: ms });
    const result = await new Promise<string>((resolve) => {
      const ws = new WebSocket(`ws://localhost:${server!.port}`);
      ws.on('open', () => ws.send(JSON.stringify({ type: 'join', pageId: PAGE }))); // userId 없음
      ws.on('message', (data) => {
        if (JSON.parse(data.toString()).type === 'join-ack') resolve('ack');
      });
      ws.on('close', (code) => resolve(`close:${code}`));
      ws.on('error', () => {});
    });
    expect(result).toBe('close:4003');
  });
});

// op-batch 재접속 복원 (AC-A1, AC-A3, AC-A4)
describe('relay server — op-batch 재접속 복원', () => {
  const PAGE = '550e8400-e29b-41d4-a716-446655440001';

  function makeOpEnvelope(siteId: string, seq: number) {
    return toWire(
      makeInlineInsertOp({ counter: seq, siteId }, null, '나', { counter: 99, siteId }),
      seq,
      siteId,
    );
  }

  function opMessage(pageId: string, siteId: string, seq: number): string {
    const env = makeOpEnvelope(siteId, seq);
    return JSON.stringify({ type: 'op', pageId, op: env });
  }

  /** join 후 join-ack 수신 시점에 resolve되는 Promise<WebSocket> */
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

  it('AC-A1: loadByPage가 ops 3건 반환 → join 소켓이 op-batch(ops 길이 3, serverSeq ASC) 수신', async () => {
    const ops = [
      makeOpEnvelope('site_h', 1),
      makeOpEnvelope('site_h', 2),
      makeOpEnvelope('site_h', 3),
    ];
    const store: OpStore = {
      async append() { return 'persisted'; },
      async loadByPage() { return ops; },
    };
    server = await createRelayServer({ port: 0, opStore: store });
    const ws = new WebSocket(`ws://localhost:${server.port}`);

    const batch = await new Promise<{ type: string; pageId: string; ops: unknown[] }>((resolve, reject) => {
      ws.on('open', () => ws.send(JSON.stringify({ type: 'join', pageId: PAGE })));
      ws.on('message', (data) => {
        const m = JSON.parse(data.toString());
        if (m.type === 'op-batch') resolve(m);
      });
      ws.on('error', reject);
    });

    expect(batch.type).toBe('op-batch');
    expect(batch.pageId).toBe(PAGE);
    expect(batch.ops).toHaveLength(3);
    expect((batch.ops[0] as { seq: number }).seq).toBe(1);
    expect((batch.ops[1] as { seq: number }).seq).toBe(2);
    expect((batch.ops[2] as { seq: number }).seq).toBe(3);
    ws.close();
  });

  it('AC-A4: loadByPage가 [] 반환 → join 소켓이 op-batch{ops:[]} 수신', async () => {
    const store: OpStore = {
      async append() { return 'persisted'; },
      async loadByPage() { return []; },
    };
    server = await createRelayServer({ port: 0, opStore: store });
    const ws = new WebSocket(`ws://localhost:${server.port}`);

    const batch = await new Promise<{ type: string; ops: unknown[] }>((resolve, reject) => {
      ws.on('open', () => ws.send(JSON.stringify({ type: 'join', pageId: PAGE })));
      ws.on('message', (data) => {
        const m = JSON.parse(data.toString());
        if (m.type === 'op-batch') resolve(m);
      });
      ws.on('error', reject);
    });

    expect(batch.type).toBe('op-batch');
    expect(batch.ops).toHaveLength(0);
    ws.close();
  });

  it('AC-A3(유실방지/BR-2): loadByPage 진행 중 broadcast op도 신규 소켓이 수신(선등록)', async () => {
    // deferred: loadByPage를 수동으로 resolve하여 타이밍을 결정론적으로 제어
    let resolveBatch!: (ops: ReturnType<typeof makeOpEnvelope>[]) => void;
    const batchPromise = new Promise<ReturnType<typeof makeOpEnvelope>[]>((res) => {
      resolveBatch = res;
    });

    const store: OpStore = {
      async append() { return 'persisted'; },
      loadByPage() { return batchPromise; },
    };
    server = await createRelayServer({ port: 0, opStore: store });

    // 클라 A: 기존 room 멤버 (join 완료)
    const wsA = await connectAndJoin(server.port, PAGE);

    // 클라 B: join 송신 → loadByPage 보류 상태로 대기 중
    const wsB = new WebSocket(`ws://localhost:${server.port}`);
    const bReceivedMessages: unknown[] = [];
    const bGotRealtime = new Promise<void>((resolve) => {
      wsB.on('message', (data) => {
        const m = JSON.parse(data.toString());
        bReceivedMessages.push(m);
        if (m.type === 'op') resolve(); // 실시간 op 수신 확인
      });
    });
    await new Promise<void>((resolve, reject) => {
      wsB.on('open', () => {
        wsB.send(JSON.stringify({ type: 'join', pageId: PAGE }));
        resolve();
      });
      wsB.on('error', reject);
    });

    // loadByPage 보류 중 클라 A가 op 송신 → B는 선등록 덕에 이 broadcast를 받아야 함
    wsA.send(opMessage(PAGE, 'site_a', 1));
    await bGotRealtime; // 실시간 op 수신 확인

    // 이제 loadByPage resolve → op-batch 전송
    const historyOps = [makeOpEnvelope('site_old', 10)];
    resolveBatch(historyOps);

    // B가 op-batch도 수신할 때까지 대기
    const bGotBatch = await new Promise<{ type: string; ops: unknown[] }>((resolve) => {
      const check = () => {
        const found = bReceivedMessages.find((m: unknown) => (m as { type: string }).type === 'op-batch');
        if (found) {
          resolve(found as { type: string; ops: unknown[] });
        } else {
          setTimeout(check, 10);
        }
      };
      check();
    });

    // B는 실시간 op(broadcast)와 op-batch 모두 수신해야 함(유실 없음)
    const realtimeOps = bReceivedMessages.filter((m) => (m as { type: string }).type === 'op');
    expect(realtimeOps).toHaveLength(1);
    expect(bGotBatch.type).toBe('op-batch');
    expect(bGotBatch.ops).toHaveLength(1);

    wsA.close();
    wsB.close();
  });
});

// WS-AUTH T4 / AC-6,7: 인가 합류 page로만 영속(교차 room 마감) + 연결 userId를 append에 태깅.
describe('relay server — op 인가·태깅 (T4)', () => {
  const PAGE = '550e8400-e29b-41d4-a716-446655440000';
  const OTHER = '66666666-6666-4666-8666-666666666666';
  const U = '11111111-1111-4111-8111-111111111111';

  function recordingStore(): {
    store: OpStore;
    calls: Array<{ pageId: string; siteId: string; userId: string | null }>;
  } {
    const calls: Array<{ pageId: string; siteId: string; userId: string | null }> = [];
    return {
      calls,
      store: {
        async append(pageId, op, userId) {
          calls.push({ pageId, siteId: op.siteId, userId: userId ?? null });
          return 'persisted';
        },
        async loadByPage() { return []; },
      },
    };
  }

  function joinMember(port: number, pageId: string, userId: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      ws.on('open', () => ws.send(JSON.stringify({ type: 'join', pageId, userId })));
      ws.on('message', (data) => {
        if (JSON.parse(data.toString()).type === 'join-ack') resolve(ws);
      });
      ws.on('error', reject);
    });
  }

  function opMsg(pageId: string, siteId: string, seq: number): string {
    const env = toWire(
      makeInlineInsertOp({ counter: seq, siteId }, null, '안', { counter: 99, siteId }),
      seq,
      siteId,
    );
    return JSON.stringify({ type: 'op', pageId, op: env });
  }

  it('AC-7: 인가 합류 page와 다른 pageId op는 영속되지 않는다(append 미호출)', async () => {
    const { store, calls } = recordingStore();
    const ms = new InMemoryMembershipStore();
    ms.allow(U, PAGE);
    server = await createRelayServer({ port: 0, opStore: store, membershipStore: ms });
    const a = await joinMember(server.port, PAGE, U); // P에 인가 합류
    a.send(opMsg(OTHER, 'site_a', 1)); // 합류하지 않은 다른 page로 op
    await new Promise((r) => setTimeout(r, 80));
    expect(calls).toHaveLength(0);
    a.close();
  });

  it('AC-6(배선): 영속 op에 연결의 인증 userId가 append에 전달된다', async () => {
    const { store, calls } = recordingStore();
    const ms = new InMemoryMembershipStore();
    ms.allow(U, PAGE);
    server = await createRelayServer({ port: 0, opStore: store, membershipStore: ms });
    const a = await joinMember(server.port, PAGE, U);
    a.send(opMsg(PAGE, 'site_a', 1));
    await new Promise((r) => setTimeout(r, 80));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.userId).toBe(U);
    a.close();
  });
});
