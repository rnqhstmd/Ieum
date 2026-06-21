// ─── P5 relay ws 어댑터 (transport) ──────────────────────────────
// `ws` WebSocketServer를 순수 RoomRegistry에 배선한다. 메시지 수신 → 파싱 →
// registry 호출 → 반환된 Dispatch[]를 실제 소켓으로 send. RoomRegistry는 DI로 주입 가능.
// BR-5: walking skeleton은 인증을 목 처리(연결 수락)한다 — 정식 검증은 후속 슬라이스.

import { WebSocketServer, WebSocket } from 'ws';
import { RoomRegistry } from './room.js';
import type { ClientHandle } from './room.js';
import { parseClientMessage } from './protocol.js';

export interface RelayServer {
  close(): Promise<void>;
  port: number;
}

// 보안 하드닝 기본값 (walking skeleton, localhost 전용).
const DEFAULT_HOST = '127.0.0.1'; // BR-5를 코드로 강제: 외부 인터페이스에 바인딩하지 않음
const DEFAULT_MAX_PAYLOAD = 64 * 1024; // op 메시지는 수 KB — 대용량 payload DoS 차단
const DEFAULT_MAX_CONNECTIONS = 100; // 무제한 연결(Map 증가) DoS 차단

export function createRelayServer(opts: {
  port: number;
  registry?: RoomRegistry;
  host?: string;
  maxConnections?: number;
  maxPayload?: number;
}): Promise<RelayServer> {
  const registry = opts.registry ?? new RoomRegistry();
  const maxConnections = opts.maxConnections ?? DEFAULT_MAX_CONNECTIONS;
  const wss = new WebSocketServer({
    port: opts.port,
    host: opts.host ?? DEFAULT_HOST,
    maxPayload: opts.maxPayload ?? DEFAULT_MAX_PAYLOAD,
  });
  const sockets = new Map<string, WebSocket>();
  let nextId = 0;

  wss.on('connection', (socket) => {
    // 연결 수 상한 초과 시 즉시 닫는다(1013 = Try Again Later).
    if (sockets.size >= maxConnections) {
      socket.close(1013, 'server full');
      return;
    }
    const handle: ClientHandle = { id: `c${++nextId}` };
    sockets.set(handle.id, socket);

    // 소켓 수준 error 핸들러: 미등록 시 Node가 uncaughtException으로 프로세스를 종료한다.
    socket.on('error', () => {
      // 네트워크 오류/비정상 종료는 무시한다(close 이벤트에서 정리). 프로세스 보호.
    });

    socket.on('message', (raw: { toString(): string }) => {
      const msg = parseClientMessage(raw.toString());
      if (!msg) return; // 잘못된 JSON/규격 외 메시지는 무시
      const dispatches =
        msg.type === 'join' ? registry.join(handle, msg.pageId) : registry.handleOp(handle, msg);
      for (const d of dispatches) {
        const target = sockets.get(d.target.id);
        if (target && target.readyState === WebSocket.OPEN) {
          target.send(JSON.stringify(d.message));
        }
      }
    });

    socket.on('close', () => {
      registry.leave(handle);
      sockets.delete(handle.id);
    });
  });

  return new Promise((resolve, reject) => {
    wss.on('listening', () => {
      const addr = wss.address();
      const port = typeof addr === 'object' && addr !== null ? addr.port : opts.port;
      resolve({
        port,
        close: () =>
          new Promise<void>((res, rej) => {
            for (const socket of sockets.values()) socket.terminate();
            wss.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
    wss.on('error', reject);
  });
}
