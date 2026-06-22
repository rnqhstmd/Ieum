import { describe, it, expect, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { createRelayServer } from '../src/server.js';
import type { RelayServer } from '../src/server.js';
import { InMemoryMembershipStore } from '../src/membershipStore.js';

// T6 / AC-14,15: createRelayServer adminPort 옵션 통합 배선 검증
// RED 근거: RelayServer 인터페이스에 adminPort 필드 없음 +
//           createRelayServer opts에 adminPort 없음 → admin 서버 미기동 → fetch 실패

const PAGE = '550e8400-e29b-41d4-a716-446655440000';
const U1 = '11111111-1111-4111-8111-111111111111';

// RelayServer + adminPort 확장 타입 (GREEN 이후 인터페이스에 추가될 것)
type RelayServerWithAdmin = RelayServer & { adminPort: number };

let server: RelayServerWithAdmin | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

/** join 후 join-ack 수신까지 대기하는 헬퍼 */
function joinAndWaitAck(port: number, pageId: string, userId: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'join', pageId, userId })));
    ws.on('message', (data) => {
      if (JSON.parse(data.toString()).type === 'join-ack') resolve(ws);
    });
    ws.on('error', reject);
  });
}

/** WebSocket 'close' 이벤트 대기 */
function waitClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    ws.on('close', (code, reason) => resolve({ code, reason: reason.toString() }));
  });
}

describe('createRelayServer — adminPort 통합 배선 (T6)', () => {
  it('adminPort 옵션을 주면 RelayServer가 숫자 타입의 adminPort를 노출한다', async () => {
    const ms = new InMemoryMembershipStore();
    ms.allow(U1, PAGE);

    // RED: createRelayServer opts에 adminPort 없음 → 타입 에러 or 런타임 무시
    server = (await createRelayServer({
      port: 0,
      adminPort: 0,
      membershipStore: ms,
    } as Parameters<typeof createRelayServer>[0] & { adminPort: number })) as RelayServerWithAdmin;

    // adminPort가 배선되지 않았으므로 undefined → 이 assertion에서 RED
    expect(typeof server.adminPort).toBe('number');
    expect(server.adminPort).toBeGreaterThan(0);
  });

  it('AC-14: WS 연결 후 admin DELETE → ws 소켓 close(4003,"removed")', async () => {
    const ms = new InMemoryMembershipStore();
    ms.allow(U1, PAGE);

    server = (await createRelayServer({
      port: 0,
      adminPort: 0,
      membershipStore: ms,
    } as Parameters<typeof createRelayServer>[0] & { adminPort: number })) as RelayServerWithAdmin;

    // adminPort 미노출이면 여기서 빠르게 실패
    expect(typeof server.adminPort).toBe('number');

    // ws 클라이언트 연결 + join-ack 수신
    const ws = await joinAndWaitAck(server.port, PAGE, U1);
    const closePromise = waitClose(ws);

    // admin DELETE 요청 — adminPort가 undefined면 URL이 깨져 fetch 실패
    const res = await fetch(
      `http://127.0.0.1:${server.adminPort}/admin/connections/${U1}`,
      { method: 'DELETE', signal: AbortSignal.timeout(3000) },
    );
    expect(res.status).toBe(204);

    // ws 클라이언트가 close(4003) 수신 (타임아웃 3s)
    const { code } = await Promise.race([
      closePromise,
      new Promise<{ code: number; reason: string }>(
        (_, reject) => setTimeout(() => reject(new Error('ws close timeout')), 3000),
      ),
    ]);
    expect(code).toBe(4003);
  });

  it('AC-15: 미연결 userId admin DELETE → 204, 오류 없음', async () => {
    const ms = new InMemoryMembershipStore();

    server = (await createRelayServer({
      port: 0,
      adminPort: 0,
      membershipStore: ms,
    } as Parameters<typeof createRelayServer>[0] & { adminPort: number })) as RelayServerWithAdmin;

    expect(typeof server.adminPort).toBe('number');

    const res = await fetch(
      `http://127.0.0.1:${server.adminPort}/admin/connections/99999999-9999-9999-9999-999999999999`,
      { method: 'DELETE', signal: AbortSignal.timeout(3000) },
    );
    expect(res.status).toBe(204);
  });

  it('RelayServer.close()가 ws + admin 서버를 모두 닫는다', async () => {
    const ms = new InMemoryMembershipStore();

    server = (await createRelayServer({
      port: 0,
      adminPort: 0,
      membershipStore: ms,
    } as Parameters<typeof createRelayServer>[0] & { adminPort: number })) as RelayServerWithAdmin;

    expect(typeof server.adminPort).toBe('number');
    const adminPort = server.adminPort;
    const wsPort = server.port;

    // close 호출
    await server.close();
    server = undefined;

    // admin 서버가 닫혔으면 연결 거부
    await expect(
      fetch(`http://127.0.0.1:${adminPort}/admin/connections/x`, {
        method: 'DELETE',
        signal: AbortSignal.timeout(1000),
      }),
    ).rejects.toThrow();

    // ws 서버도 닫혔으면 연결 거부
    await expect(
      new Promise<void>((_, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${wsPort}`);
        ws.on('error', reject);
        ws.on('open', () => reject(new Error('ws still open')));
        setTimeout(() => reject(new Error('ws timeout')), 1000);
      }),
    ).rejects.toThrow();
  });
});
