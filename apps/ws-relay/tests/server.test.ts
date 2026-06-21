import { describe, it, expect, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { createRelayServer } from '../src/server.js';
import type { RelayServer } from '../src/server.js';

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
        ws.on('message', (data) => resolve(JSON.parse(data.toString())));
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
