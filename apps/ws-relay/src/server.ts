// ─── P5 relay ws 어댑터 (transport) ──────────────────────────────
// `ws` WebSocketServer를 순수 RoomRegistry에 배선한다. 메시지 수신 → 파싱 →
// registry 호출 → 반환된 Dispatch[]를 실제 소켓으로 send. RoomRegistry는 DI로 주입 가능.
// BR-5: walking skeleton은 인증을 목 처리(연결 수락)한다 — 정식 검증은 후속 슬라이스.

import { WebSocketServer, WebSocket } from 'ws';
import { RoomRegistry } from './room.js';
import type { ClientHandle } from './room.js';
import { parseClientMessage } from './protocol.js';
import type { OpBatchMsg, OpBatchErrorMsg } from './protocol.js';
import { InMemoryOpStore } from './opStore.js';
import type { OpStore } from './opStore.js';
import type { MembershipStore } from './membershipStore.js';
import { createAdminServer } from './adminServer.js';
import { verifyToken } from './wsToken.js';

export interface RelayServer {
  close(): Promise<void>;
  port: number;
  adminPort?: number;
  disconnectUser(userId: string): number;
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
  // op 영속화 store. 미주입 시 InMemoryOpStore(DB 미구성 fallback, AC-8/S3).
  opStore?: OpStore;
  // WS-AUTH-02 멤버십 게이트. 주입 시 join에 userId+멤버십 검증(비멤버 close 4003).
  // 미주입 시 게이트 off(DB 미구성 walking skeleton — 기존 동작 유지).
  membershipStore?: MembershipStore;
  // admin HTTP 서버 포트. 주입 시(0 포함) admin 서버 기동. 미주입 시 admin 미기동.
  adminPort?: number;
  // WS-AUTH-01: HMAC 토큰 검증 비밀키. 설정 시 join.token 필수 검증.
  authSecret?: string;
  // WS-AUTH-01: 현재 시각 공급자(Unix epoch 초). 기본값 Date.now()/1000. 테스트 주입용.
  now?: () => number;
}): Promise<RelayServer> {
  const registry = opts.registry ?? new RoomRegistry();
  const opStore: OpStore = opts.opStore ?? new InMemoryOpStore();
  const membershipGate = opts.membershipStore; // undefined = 게이트 off
  const authSecret = opts.authSecret;
  const nowFn = opts.now ?? (() => Math.floor(Date.now() / 1000));
  const maxConnections = opts.maxConnections ?? DEFAULT_MAX_CONNECTIONS;
  const wss = new WebSocketServer({
    port: opts.port,
    host: opts.host ?? DEFAULT_HOST,
    maxPayload: opts.maxPayload ?? DEFAULT_MAX_PAYLOAD,
  });
  const sockets = new Map<string, WebSocket>();
  const userConnections = new Map<string, Set<WebSocket>>();
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

    const sendAll = (dispatches: ReturnType<RoomRegistry['join']>) => {
      for (const d of dispatches) {
        const target = sockets.get(d.target.id);
        if (target && target.readyState === WebSocket.OPEN) {
          target.send(JSON.stringify(d.message));
        }
      }
    };

    // op-batch/op-batch-error 전송 헬퍼: 재join stale 격리.
    // myEpoch가 현재 joinEpoch와 다르면 조용히 폐기(재join으로 superseded된 결과).
    const sendIfCurrent = (myEpoch: number, message: OpBatchMsg | OpBatchErrorMsg): void => {
      if (joinEpoch !== myEpoch) return;
      const target = sockets.get(handle.id);
      if (target && target.readyState === WebSocket.OPEN) target.send(JSON.stringify(message));
    };

    // join·op는 비동기(멤버십 조회/영속화)이므로 소켓별 promise 체인으로 직렬화한다.
    // join이 op보다 먼저 처리되어 connPage가 설정되도록 FIFO를 보장한다. 소켓 간은 병렬.
    let socketChain: Promise<void> = Promise.resolve();
    let connUserId: string | null = null; // 인가된 연결 userId (WS-AUTH-03 op 태깅)
    let connPage: string | null = null; // 인가 합류한 page (교차 room 영속화 마감 기준)
    // op-batch 재join 격리: 연결-로컬 epoch 카운터. join마다 증가, stale 비동기 결과를 폐기.
    let joinEpoch = 0;
    socket.on('message', (raw: { toString(): string }) => {
      const msg = parseClientMessage(raw.toString());
      if (!msg) return; // 잘못된 JSON/규격 외 메시지는 무시
      if (msg.type === 'cursor') {
        sendAll(registry.handleCursor(handle, msg)); // P6 커서: broadcast(비영속, 게이트 무관)
        return;
      }
      if (msg.type === 'join') {
        const joinMsg = msg;
        socketChain = socketChain.then(async () => {
          // 비동기 socketChain 진입 시점에 소켓이 이미 닫혔으면(직전 처리 대기 중 close) 조기 반환 — 누수 방지(gemini).
          if (socket.readyState !== WebSocket.OPEN) return;
          // WS-AUTH-01: authSecret 설정 시 HMAC 토큰 검증 → identity 확정.
          let identity: string | undefined = joinMsg.userId;
          if (authSecret) {
            const v = verifyToken(joinMsg.token, authSecret, nowFn());
            if (v === null) {
              console.warn('[ws-relay] join rejected: invalid/expired/missing token');
              try { socket.close(4001, 'unauthorized'); } catch { /* 이미 닫힘 */ }
              return;
            }
            identity = v.userId; // token.userId 우선 — join.userId 무시
          }
          // WS-AUTH-02: 게이트 활성 시 identity+멤버십 검증, 실패하면 close(4003).
          if (membershipGate) {
            if (
              identity === undefined ||
              !(await membershipGate.isMember(identity, joinMsg.pageId))
            ) {
              try {
                socket.close(4003, 'forbidden');
              } catch {
                /* 이미 닫힘 */
              }
              return;
            }
          }
          // membershipGate await 중 소켓이 닫혔으면 등록 직전에 조기 반환 — close 핸들러가 이미 정리한 뒤
          // userConnections에 고아 등록되는 누수를 막는다(gemini HIGH의 실 누수 지점).
          if (socket.readyState !== WebSocket.OPEN) return;
          // 공통: 재-join 정리 + connUserId 설정 + userConnections 등록 (게이트 여부 무관)
          const newUserId = identity ?? null;
          if (connUserId !== null && connUserId !== newUserId) {
            const prevSet = userConnections.get(connUserId);
            if (prevSet) {
              prevSet.delete(socket);
              if (prevSet.size === 0) userConnections.delete(connUserId);
            }
          }
          connUserId = newUserId;
          if (connUserId) {
            if (!userConnections.has(connUserId)) userConnections.set(connUserId, new Set());
            userConnections.get(connUserId)!.add(socket);
          }
          connPage = joinMsg.pageId; // 게이트 off여도 교차 room 마감 기준으로 설정
          // (1) 선등록: broadcast 수신 가능 상태로 room에 먼저 등록 (socketChain 내 동기)
          sendAll(registry.join(handle, joinMsg.pageId, joinMsg.presence));
          // (2)(3) loadByPage + op-batch는 socketChain 밖에서 비동기 실행.
          // socketChain에 await를 걸지 않아 이후 op 메시지 처리가 블록되지 않는다(AC-A3 선등록).
          const pageIdForBatch = joinMsg.pageId;
          // epoch는 socketChain 동기 구간에서 캡처 — 재join FIFO로 직렬 증가 보장.
          const myEpoch = ++joinEpoch;
          void opStore.loadByPage(pageIdForBatch)
            .then((ops) => sendIfCurrent(myEpoch, { type: 'op-batch', pageId: pageIdForBatch, ops }))
            .catch((err) => {
              console.warn('[relay] loadByPage failed, sending op-batch-error', err);
              sendIfCurrent(myEpoch, { type: 'op-batch-error', pageId: pageIdForBatch });
            });
        }).catch(() => {
          // 체인 내 예기치 못한 예외가 socketChain을 영구 reject시켜 이후 메시지를 막는 것을 방지한다
          // (gemini CRITICAL). 인가 경로 오류이므로 연결을 1011로 안전하게 정리한다.
          try {
            socket.close(1011, 'internal error');
          } catch {
            /* 이미 닫힘 */
          }
        });
        return;
      }
      // op: 인가 합류 page로만 영속/전파(교차 room 마감 S1/AC-7) → append(userId 태깅) → dispatch.
      const opMsg = msg;
      socketChain = socketChain.then(async () => {
        if (connPage === null || opMsg.pageId !== connPage) return; // 미합류/교차 room: 무영속·무전파
        try {
          const outcome = await opStore.append(opMsg.pageId, opMsg.op, connUserId);
          sendAll(registry.handleOp(handle, opMsg, outcome));
        } catch {
          // 영속화 실패(연결 끊김 등): 무전파·무ack (S1). 프로세스 보호.
        }
      }).catch(() => {
        // 예기치 못한 예외로 socketChain이 reject되어 이후 op가 막히는 것을 방지(gemini CRITICAL).
        // 단일 op 실패는 연결을 끊지 않고 체인만 복구한다.
      });
    });

    socket.on('close', () => {
      // P6: leave가 남은 peer에게 보낼 presence-leave Dispatch[]를 반환 → send 배선.
      sendAll(registry.leave(handle));
      sockets.delete(handle.id);
      if (connUserId) {
        const set = userConnections.get(connUserId);
        if (set) {
          set.delete(socket);
          if (set.size === 0) userConnections.delete(connUserId);
        }
      }
    });
  });

  return new Promise((resolve, reject) => {
    wss.on('listening', () => {
      const addr = wss.address();
      const port = typeof addr === 'object' && addr !== null ? addr.port : opts.port;

      function disconnectUser(userId: string): number {
        const set = userConnections.get(userId);
        if (!set) return 0;
        let count = 0;
        for (const socket of set) {
          // 방어적: 이미 닫히는 중인 소켓은 건너뜀 (sendAll의 OPEN 체크와 일관)
          if (socket.readyState === WebSocket.OPEN) {
            socket.close(4003, 'removed');
            count++;
          }
        }
        userConnections.delete(userId);
        return count;
      }

      const adminReady: Promise<{ port: number; close: () => Promise<void> } | undefined> =
        opts.adminPort !== undefined
          ? createAdminServer({
              port: opts.adminPort,
              host: opts.host ?? DEFAULT_HOST,
              disconnectUser,
            })
          : Promise.resolve(undefined);

      adminReady.then((admin) => {
        resolve({
          port,
          adminPort: admin?.port,
          close: async () => {
            for (const socket of sockets.values()) socket.terminate();
            await new Promise<void>((res, rej) => wss.close((err) => (err ? rej(err) : res())));
            await opStore.close?.(); // PgOpStore 풀 정리(InMemory는 no-op).
            if (admin) await admin.close();
          },
          disconnectUser,
        });
      }).catch(reject);
    });
    wss.on('error', reject);
  });
}
