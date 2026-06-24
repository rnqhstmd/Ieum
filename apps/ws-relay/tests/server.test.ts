import { describe, it, expect, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { toWire, makeInlineInsertOp } from '@ieum/crdt';
import { createRelayServer } from '../src/server.js';
import type { RelayServer } from '../src/server.js';
import type { OpStore, AppendOutcome } from '../src/opStore.js';
import { InMemoryMembershipStore } from '../src/membershipStore.js';
import { makeToken } from './tokenFixture.js';

// stale 미수신 음성 단언 보조 여유분 — 동기 expect 전 비동기 메시지 안착 대기(ms).
const STALE_GRACE_MS = 80;

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
    await new Promise((r) => setTimeout(r, STALE_GRACE_MS)); // 전파 대기
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
    await new Promise((r) => setTimeout(r, STALE_GRACE_MS));
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
    await new Promise((r) => setTimeout(r, STALE_GRACE_MS));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.userId).toBe(U);
    a.close();
  });
});

// ─── WS-AUTH-01 HMAC 토큰 검증 + join 게이트 신원 확정 (RED) ──────────────
// createRelayServer opts에 authSecret?, now? 추가 예정.
// 아직 미구현이므로 이 suite 전체가 실패(RED) 상태여야 한다.
describe('relay server — HMAC 토큰 게이트 (WS-AUTH-01)', () => {
  const PAGE   = '550e8400-e29b-41d4-a716-446655440000';
  const SECRET = 'test-secret-key-32-bytes-long!!';
  const USERID = '11111111-1111-1111-1111-111111111111';
  const USER_B = '22222222-2222-2222-2222-222222222222';
  const NOW    = 1700000200; // 기준 now (토큰 exp=1700000300 보다 100초 전)

  // join 전송 후 join-ack 또는 close(code) 중 먼저 도착한 것을 반환.
  // token을 join 메시지에 포함.
  function joinWithToken(
    port: number,
    pageId: string,
    userId: string,
    token?: string,
  ): Promise<string> {
    return new Promise((resolve) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      ws.on('open', () => {
        const msg: Record<string, unknown> = { type: 'join', pageId, userId };
        if (token !== undefined) msg['token'] = token;
        ws.send(JSON.stringify(msg));
      });
      ws.on('message', (data) => {
        if (JSON.parse(data.toString()).type === 'join-ack') resolve('ack');
      });
      ws.on('close', (code) => resolve(`close:${code}`));
      ws.on('error', () => { /* close가 따라온다 */ });
    });
  }

  // recordingStore: append 호출 기록 (pageId, siteId, userId)
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
        async loadByPage() {
          return [];
        },
      },
    };
  }

  function opMsg(pageId: string, siteId: string, seq: number): string {
    const env = toWire(
      makeInlineInsertOp({ counter: seq, siteId }, null, '안', { counter: 99, siteId }),
      seq,
      siteId,
    );
    return JSON.stringify({ type: 'op', pageId, op: env });
  }

  // join-ack를 받을 때까지 기다렸다가 WebSocket을 반환.
  function joinAndWaitAck(
    port: number,
    pageId: string,
    userId: string,
    token?: string,
  ): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      ws.on('open', () => {
        const msg: Record<string, unknown> = { type: 'join', pageId, userId };
        if (token !== undefined) msg['token'] = token;
        ws.send(JSON.stringify(msg));
      });
      ws.on('message', (data) => {
        if (JSON.parse(data.toString()).type === 'join-ack') resolve(ws);
      });
      ws.on('close', (code) => reject(new Error(`unexpected close: ${code}`)));
      ws.on('error', reject);
    });
  }

  it('AC-01: 유효 token join → join-ack', async () => {
    const token = makeToken(SECRET, USERID, NOW + 200); // exp = NOW+200 > NOW
    server = await createRelayServer({ port: 0, authSecret: SECRET, now: () => NOW } as Parameters<typeof createRelayServer>[0]);
    expect(await joinWithToken(server.port, PAGE, USERID, token)).toBe('ack');
  });

  it('AC-01: 유효 token join → 이후 op가 token.userId로 태깅됨', async () => {
    const { store, calls } = recordingStore();
    const token = makeToken(SECRET, USERID, NOW + 200);
    server = await createRelayServer({
      port: 0,
      opStore: store,
      authSecret: SECRET,
      now: () => NOW,
    } as Parameters<typeof createRelayServer>[0]);
    const ws = await joinAndWaitAck(server.port, PAGE, USERID, token);
    ws.send(opMsg(PAGE, 'site_a', 1));
    await new Promise((r) => setTimeout(r, STALE_GRACE_MS));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.userId).toBe(USERID);
    ws.close();
  });

  it('AC-02: authSecret 설정 + token 없이 join → close(4001)', async () => {
    server = await createRelayServer({ port: 0, authSecret: SECRET, now: () => NOW } as Parameters<typeof createRelayServer>[0]);
    expect(await joinWithToken(server.port, PAGE, USERID, undefined)).toBe('close:4001');
  });

  it('AC-03: authSecret 설정 + 서명 위조 token → close(4001)', async () => {
    const forged = makeToken('wrong-secret', USERID, NOW + 200);
    server = await createRelayServer({ port: 0, authSecret: SECRET, now: () => NOW } as Parameters<typeof createRelayServer>[0]);
    expect(await joinWithToken(server.port, PAGE, USERID, forged)).toBe('close:4001');
  });

  it('AC-04: authSecret 설정 + 만료 token(exp≤now) → close(4001)', async () => {
    const expiredToken = makeToken(SECRET, USERID, NOW - 1); // exp < NOW → 만료
    server = await createRelayServer({ port: 0, authSecret: SECRET, now: () => NOW } as Parameters<typeof createRelayServer>[0]);
    expect(await joinWithToken(server.port, PAGE, USERID, expiredToken)).toBe('close:4001');
  });

  it('AC-05: token=A 유효 + join.userId=B → connUserId=A(token 우선, close 아님)', async () => {
    const { store, calls } = recordingStore();
    const tokenA = makeToken(SECRET, USERID, NOW + 200); // token은 USERID(A)
    server = await createRelayServer({
      port: 0,
      opStore: store,
      authSecret: SECRET,
      now: () => NOW,
    } as Parameters<typeof createRelayServer>[0]);
    // join.userId=USER_B(B)로 보내지만 token은 A
    const ws = await joinAndWaitAck(server.port, PAGE, USER_B, tokenA);
    ws.send(opMsg(PAGE, 'site_a', 1));
    await new Promise((r) => setTimeout(r, STALE_GRACE_MS));
    expect(calls).toHaveLength(1);
    // token에서 도출한 userId=USERID(A)로 태깅 — join.userId=USER_B(B) 무시
    expect(calls[0]!.userId).toBe(USERID);
    ws.close();
  });

  it('AC-08: authSecret 미설정 + token 없이 join → join-ack(trust-relay 기존 동작)', async () => {
    // authSecret 미주입: 기존 trust-relay 모드 — token 없어도 수락
    server = await createRelayServer({ port: 0 });
    expect(await joinWithToken(server.port, PAGE, USERID, undefined)).toBe('ack');
  });
});

// ─── op-batch 견고화: op-batch-error + join-epoch 격리 ───────────────────────
// 아직 미구현 (op-batch-error 타입·epoch 격리 없음) → AC-1/AC-5/AC-6은 RED 상태여야 한다.
describe('op-batch 견고화 (op-batch-error + join-epoch)', () => {
  const PAGE = '550e8400-e29b-41d4-a716-446655440002';

  function makeOpEnvelope(siteId: string, seq: number) {
    return toWire(
      makeInlineInsertOp({ counter: seq, siteId }, null, '글', { counter: 99, siteId }),
      seq,
      siteId,
    );
  }

  /** 외부에서 resolve/reject 할 수 있는 Promise 팩토리 */
  function deferred<T>() {
    let resolve!: (v: T) => void;
    let reject!: (e?: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  }

  /** membershipStore 미주입(게이트 off) + 에러 throw 스토어 → op-batch-error 수신, op-batch 미수신 */
  it('AC-1: loadByPage가 throw → 클라에 op-batch-error 전송, op-batch(빈배치 포함) 미수신', async () => {
    const store: OpStore = {
      async append() { return 'persisted'; },
      async loadByPage() { throw new Error('DB 연결 실패'); },
    };
    server = await createRelayServer({ port: 0, opStore: store });

    const ws = new WebSocket(`ws://localhost:${server.port}`);

    let gotBatch = false;
    const errorReceived = new Promise<{ type: string; pageId: string }>((resolve, reject) => {
      ws.on('open', () => ws.send(JSON.stringify({ type: 'join', pageId: PAGE })));
      ws.on('message', (data) => {
        const m = JSON.parse(data.toString());
        if (m.type === 'op-batch-error') resolve(m);
        if (m.type === 'op-batch') { gotBatch = true; }
      });
      ws.on('error', reject);
    });

    const errMsg = await Promise.race([
      errorReceived,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('op-batch-error 수신 타임아웃')), 2000)),
    ]);

    expect(errMsg.type).toBe('op-batch-error');
    expect(errMsg.pageId).toBe(PAGE);

    // 80ms 추가 대기 후 op-batch가 오지 않아야 함
    await new Promise((r) => setTimeout(r, STALE_GRACE_MS));
    expect(gotBatch).toBe(false);

    ws.close();
  });

  /** loadByPage가 [] resolve → op-batch{ops:[]} 수신, op-batch-error 미수신 */
  it('AC-2: loadByPage가 [] resolve → op-batch{ops:[]} 수신, op-batch-error 미수신', async () => {
    const store: OpStore = {
      async append() { return 'persisted'; },
      async loadByPage() { return []; },
    };
    server = await createRelayServer({ port: 0, opStore: store });

    const ws = new WebSocket(`ws://localhost:${server.port}`);

    let gotBatchError = false;
    const batchReceived = new Promise<{ type: string; ops: unknown[] }>((resolve, reject) => {
      ws.on('open', () => ws.send(JSON.stringify({ type: 'join', pageId: PAGE })));
      ws.on('message', (data) => {
        const m = JSON.parse(data.toString());
        if (m.type === 'op-batch') resolve(m);
        if (m.type === 'op-batch-error') gotBatchError = true;
      });
      ws.on('error', reject);
    });

    const batch = await Promise.race([
      batchReceived,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('op-batch 수신 타임아웃')), 2000)),
    ]);

    expect(batch.type).toBe('op-batch');
    expect(batch.ops).toHaveLength(0);
    await new Promise((r) => setTimeout(r, STALE_GRACE_MS));
    expect(gotBatchError).toBe(false);

    ws.close();
  });

  /** loadByPage가 op 1건 배열 resolve → op-batch{ops}.length===1 */
  it('AC-3: loadByPage가 op 1건 resolve → op-batch.ops.length===1', async () => {
    const opB = makeOpEnvelope('site_z', 1);
    const store: OpStore = {
      async append() { return 'persisted'; },
      async loadByPage() { return [opB]; },
    };
    server = await createRelayServer({ port: 0, opStore: store });

    const ws = new WebSocket(`ws://localhost:${server.port}`);

    const batchReceived = new Promise<{ type: string; ops: unknown[] }>((resolve, reject) => {
      ws.on('open', () => ws.send(JSON.stringify({ type: 'join', pageId: PAGE })));
      ws.on('message', (data) => {
        const m = JSON.parse(data.toString());
        if (m.type === 'op-batch') resolve(m);
      });
      ws.on('error', reject);
    });

    const batch = await Promise.race([
      batchReceived,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('op-batch 수신 타임아웃')), 2000)),
    ]);

    expect(batch.ops).toHaveLength(1);

    ws.close();
  });

  /** deferred loadByPage → join 1회 → resolve → op-batch 수신(epoch 정상 경로) */
  it('AC-4: loadByPage deferred → resolve → op-batch 수신(epoch 일치)', async () => {
    const d = deferred<ReturnType<typeof makeOpEnvelope>[]>();
    const store: OpStore = {
      async append() { return 'persisted'; },
      loadByPage() { return d.promise; },
    };
    server = await createRelayServer({ port: 0, opStore: store });

    const ws = new WebSocket(`ws://localhost:${server.port}`);
    const batchReceived = new Promise<{ type: string; ops: unknown[] }>((resolve, reject) => {
      ws.on('open', () => ws.send(JSON.stringify({ type: 'join', pageId: PAGE })));
      ws.on('message', (data) => {
        const m = JSON.parse(data.toString());
        if (m.type === 'op-batch') resolve(m);
      });
      ws.on('error', reject);
    });

    // loadByPage 보류 중 → resolve 후 op-batch 수신
    await new Promise((r) => setTimeout(r, 20)); // join 처리 시간 여유
    d.resolve([makeOpEnvelope('site_q', 7)]);

    const batch = await Promise.race([
      batchReceived,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('op-batch 수신 타임아웃')), 2000)),
    ]);

    expect(batch.type).toBe('op-batch');
    expect(batch.ops).toHaveLength(1);

    ws.close();
  });

  /**
   * AC-5(핵심): 동일 소켓 재join → epoch 격리
   * - 첫 join의 loadByPage(defer1)가 늦게 resolve돼도 결과가 전송되지 않아야 함
   * - 두 번째 join의 loadByPage(defer2) 결과만 전송되어야 함
   */
  it('AC-5: 동일 소켓 재join 시 첫 loadByPage(defer1) 결과는 stale 격리 — 두 번째 결과만 수신', async () => {
    const opA = makeOpEnvelope('site_stale', 1);
    const opB = makeOpEnvelope('site_fresh', 2);

    const defer1 = deferred<ReturnType<typeof makeOpEnvelope>[]>();
    const defer2 = deferred<ReturnType<typeof makeOpEnvelope>[]>();

    // 첫 호출 시 firstCalled를 resolve
    const firstCalledDefer = deferred<void>();
    let callCount = 0;

    const store: OpStore = {
      async append() { return 'persisted'; },
      loadByPage() {
        callCount += 1;
        if (callCount === 1) {
          firstCalledDefer.resolve();
          return defer1.promise;
        }
        return defer2.promise;
      },
    };

    server = await createRelayServer({ port: 0, opStore: store });

    const ws = new WebSocket(`ws://localhost:${server.port}`);
    const receivedBatches: Array<{ type: string; ops: unknown[] }> = [];
    let batchCount = 0;

    // 두 번째 op-batch 수신 시 resolve되는 Promise
    const secondBatchReceived = new Promise<{ type: string; ops: unknown[] }>((resolve, reject) => {
      ws.on('open', () => ws.send(JSON.stringify({ type: 'join', pageId: PAGE })));
      ws.on('message', (data) => {
        const m = JSON.parse(data.toString());
        if (m.type === 'op-batch') {
          receivedBatches.push(m);
          batchCount += 1;
          if (batchCount >= 1) resolve(m); // 첫 op-batch 수신 시 즉시 resolve(두 번째 join의 결과여야 함)
        }
      });
      ws.on('error', reject);
    });

    // 첫 loadByPage 호출 확인 후 동일 소켓으로 재join
    await firstCalledDefer.promise;
    ws.send(JSON.stringify({ type: 'join', pageId: PAGE }));

    // 두 번째 join의 loadByPage(defer2)를 먼저 resolve → opB 담긴 op-batch가 와야 함
    defer2.resolve([opB]);

    const secondBatch = await Promise.race([
      secondBatchReceived,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('두 번째 op-batch 수신 타임아웃')), 2000)),
    ]);

    // 두 번째 join 결과(opB)를 받았는지 확인
    expect(secondBatch.ops).toHaveLength(1);
    expect((secondBatch.ops[0] as { siteId: string }).siteId).toBe('site_fresh');

    // 이제 defer1(stale)을 resolve → 80ms 대기 → stale op-batch 미수신 단언
    defer1.resolve([opA]);
    await new Promise((r) => setTimeout(r, STALE_GRACE_MS));

    // stale op-batch(opA)는 수신되지 않아야 함 → receivedBatches에 opA가 없어야 함
    const staleReceived = receivedBatches.some((b) =>
      b.ops.some((op) => (op as { siteId: string }).siteId === 'site_stale'),
    );
    expect(staleReceived).toBe(false);

    ws.close();
  });

  /**
   * AC-6: AC-5와 동일 구조, defer1을 reject →
   * 재join 후 defer1 reject → stale op-batch-error 미수신
   */
  it('AC-6: 동일 소켓 재join 후 첫 loadByPage reject → stale op-batch-error 미수신', async () => {
    const opB = makeOpEnvelope('site_fresh', 2);

    const defer1 = deferred<ReturnType<typeof makeOpEnvelope>[]>();
    const defer2 = deferred<ReturnType<typeof makeOpEnvelope>[]>();

    const firstCalledDefer = deferred<void>();
    let callCount = 0;

    const store: OpStore = {
      async append() { return 'persisted'; },
      loadByPage() {
        callCount += 1;
        if (callCount === 1) {
          firstCalledDefer.resolve();
          return defer1.promise;
        }
        return defer2.promise;
      },
    };

    server = await createRelayServer({ port: 0, opStore: store });

    const ws = new WebSocket(`ws://localhost:${server.port}`);
    let staleBatchErrorReceived = false;
    let secondBatchReceived = false;

    const secondBatchPromise = new Promise<void>((resolve, reject) => {
      ws.on('open', () => ws.send(JSON.stringify({ type: 'join', pageId: PAGE })));
      ws.on('message', (data) => {
        const m = JSON.parse(data.toString());
        if (m.type === 'op-batch') {
          secondBatchReceived = true;
          resolve();
        }
        // op-batch-error: 두 번째 join 결과(op-batch) 수신 후 도착하면 stale → 선등록 리스너가 포착
        if (m.type === 'op-batch-error') staleBatchErrorReceived = true;
      });
      ws.on('error', reject);
    });

    // 첫 loadByPage 호출 후 재join
    await firstCalledDefer.promise;
    ws.send(JSON.stringify({ type: 'join', pageId: PAGE }));

    // 두 번째 join의 loadByPage(defer2) 먼저 resolve → op-batch 수신
    defer2.resolve([opB]);

    await Promise.race([
      secondBatchPromise,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('두 번째 op-batch 수신 타임아웃')), 2000)),
    ]);

    expect(secondBatchReceived).toBe(true);

    // defer1을 reject → 80ms 대기 → stale op-batch-error 미수신 단언
    // (staleBatchErrorReceived 감시는 secondBatchPromise 리스너에서 이미 선등록됨)
    defer1.reject(new Error('DB 오류'));
    await new Promise((r) => setTimeout(r, STALE_GRACE_MS));

    expect(staleBatchErrorReceived).toBe(false);

    ws.close();
  });
});

// ─── WS-AUTH-04 정합: authSecret 설정 + membershipStore 미주입 조합에서
//     토큰 신원 확정 후 disconnectUser가 소켓을 강제종료해야 한다 (G1 RED)
//
// 버그: join 게이트 else(membershipGate 없음) 경로에서 connUserId만 설정하고
//       userConnections 맵에 소켓을 등록하지 않아 disconnectUser(userId)가 0을 반환한다.
describe('relay server — authSecret+membershipStore 미주입 시 userConnections 등록 (G1)', () => {
  const PAGE   = '550e8400-e29b-41d4-a716-446655440000';
  const SECRET = 'test-secret-key-32-bytes-long!!';
  const USERID = '11111111-1111-1111-1111-111111111111';
  // 골든벡터 토큰: now=1700000299 에서 유효 (exp=1700000300)
  const VALID_TOKEN =
    'eyJ1c2VySWQiOiIxMTExMTExMS0xMTExLTExMTEtMTExMS0xMTExMTExMTExMTEiLCJleHAiOjE3MDAwMDAzMDB9' +
    '.sdCpy_TTmL271ycglxyEpQmvxuMVgKSthO61r7UWRBs';
  const NOW = 1700000299; // exp(1700000300) > NOW → 유효

  it('G1: authSecret 설정 + membershipStore 미주입 + 유효 token join → disconnectUser(USERID)가 1 반환하고 소켓을 닫는다', async () => {
    // membershipStore 미주입: 게이트 off 경로 (else 블록)
    server = await createRelayServer({
      port: 0,
      authSecret: SECRET,
      now: () => NOW,
    } as Parameters<typeof createRelayServer>[0]);

    // 유효 토큰으로 join → join-ack 수신
    const ws = await new Promise<WebSocket>((resolve, reject) => {
      const c = new WebSocket(`ws://localhost:${server!.port}`);
      c.on('open', () =>
        c.send(JSON.stringify({ type: 'join', pageId: PAGE, userId: USERID, token: VALID_TOKEN })),
      );
      c.on('message', (data) => {
        if (JSON.parse(data.toString()).type === 'join-ack') resolve(c);
      });
      c.on('close', (code) => reject(new Error(`unexpected close: ${code}`)));
      c.on('error', reject);
    });

    const closePromise = new Promise<number>((resolve) => {
      ws.on('close', (code) => resolve(code));
    });

    // disconnectUser 호출 — 버그 시 userConnections 미등록으로 0 반환 (RED)
    const count = (server as unknown as { disconnectUser(userId: string): number }).disconnectUser(USERID);

    // 기대: 1 이상 반환 + 소켓 close(4003)
    // 현재 구현에서는 0 반환 → assertion 실패 → RED
    expect(count).toBeGreaterThanOrEqual(1);

    const code = await Promise.race([
      closePromise,
      new Promise<number>((_, rej) => setTimeout(() => rej(new Error('ws close timeout')), 2000)),
    ]);
    expect(code).toBe(4003);
  });
});
