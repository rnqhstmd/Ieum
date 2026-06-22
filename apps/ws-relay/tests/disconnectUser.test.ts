import { describe, it, expect, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { createRelayServer } from '../src/server.js';
import type { RelayServer } from '../src/server.js';
import { InMemoryMembershipStore } from '../src/membershipStore.js';

// T5 / AC-14,15: disconnectUser(userId) — userId 연결 추적 + 강제종료
// 실패 기대: RelayServer 인터페이스에 disconnectUser 미존재 → 런타임 TypeError

let server: RelayServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

/** join 후 join-ack 수신까지 대기하는 헬퍼 (server.test.ts 동일 스타일) */
function joinAndWaitAck(port: number, pageId: string, userId: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'join', pageId, userId })));
    ws.on('message', (data) => {
      if (JSON.parse(data.toString()).type === 'join-ack') resolve(ws);
    });
    ws.on('error', reject);
  });
}

/** WebSocket 'close' 이벤트가 발생할 때 {code, reason} 을 반환 */
function waitClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    ws.on('close', (code, reason) => resolve({ code, reason: reason.toString() }));
  });
}

describe('relay server — disconnectUser (T5)', () => {
  const PAGE = '550e8400-e29b-41d4-a716-446655440000';
  const U1 = '11111111-1111-4111-8111-111111111111';

  it('AC-14: 연결된 userId 소켓에 close(4003,"removed")를 전송하고 닫힌 소켓 수를 반환한다', async () => {
    const ms = new InMemoryMembershipStore();
    ms.allow(U1, PAGE);
    server = await createRelayServer({ port: 0, membershipStore: ms });

    // join 후 join-ack 수신
    const ws = await joinAndWaitAck(server.port, PAGE, U1);
    const closePromise = waitClose(ws);

    // disconnectUser 호출 — GREEN 전이므로 이 메서드는 존재하지 않아 TypeError 발생
    const disconnected = (server as unknown as { disconnectUser(userId: string): number }).disconnectUser(U1);

    // 반환값 ≥ 1
    expect(disconnected).toBeGreaterThanOrEqual(1);

    // 클라이언트에 close(4003) 이벤트 도달
    const { code } = await closePromise;
    expect(code).toBe(4003);
  });

  it('AC-15: 미연결 userId에 대해 disconnectUser는 0을 반환하고 예외를 던지지 않는다', async () => {
    server = await createRelayServer({ port: 0 });

    const result = (server as unknown as { disconnectUser(userId: string): number }).disconnectUser('nobody');
    expect(result).toBe(0);
  });

  it('(추적 해제) 정상 close 후 disconnectUser는 0을 반환한다', async () => {
    const ms = new InMemoryMembershipStore();
    ms.allow(U1, PAGE);
    server = await createRelayServer({ port: 0, membershipStore: ms });

    const ws = await joinAndWaitAck(server.port, PAGE, U1);
    const closePromise = waitClose(ws);

    // 클라이언트가 스스로 정상 종료
    ws.close();
    await closePromise;

    // 소켓이 닫혔으므로 userConnections에서 제거되어 0 반환
    await new Promise((r) => setTimeout(r, 30)); // close 이벤트 처리 대기
    const result = (server as unknown as { disconnectUser(userId: string): number }).disconnectUser(U1);
    expect(result).toBe(0);
  });
});
