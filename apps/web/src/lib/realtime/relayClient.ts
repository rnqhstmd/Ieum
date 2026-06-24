// ─── P5 클라이언트 relay 세션 (순수, Transport 주입) ─────────────
// join/op 송신과 수신 메시지 라우팅. React 무관 — useCrdtDocument가 배선한다.

import type { WireEnvelope, RgaId } from '@ieum/crdt';
import type { Transport } from './transport';
import { parseServerMessage } from './protocol';
import type { PresenceInfo, CursorInfo } from './protocol';

export interface RelayClientHandlers {
  /** 원격 op 수신 → 훅이 applyDocOp. */
  onRemoteOp(env: WireEnvelope): void;
  /** P6 커서: clientId(서버 부여)는 자기 커서 렌더 제외에 사용. */
  onJoinAck?(connectedClients: number, clientId: string): void;
  onOpAck?(siteId: string, seq: number): void;
  /** P6: 접속자 참여/갱신 → usePresence 맵 갱신. */
  onPresenceUpdate?(info: PresenceInfo): void;
  /** P6: 접속자 이탈 → usePresence 맵 제거. */
  onPresenceLeave?(clientId: string): void;
  /** P6 커서: 협업자 커서 위치 수신 → useCursor 맵 갱신. */
  onCursorUpdate?(info: CursorInfo): void;
  /** P9: op-batch 수신 → 훅이 일괄 applyDocOp. */
  onOpBatch?(ops: WireEnvelope[], pageId: string): void;
  /** A: op-batch-error 수신 → 훅이 restoreError=true. */
  onOpBatchError?(pageId: string): void;
}

export interface RelayClient {
  join(pageId: string): void;
  sendOp(env: WireEnvelope): void;
  /** P6 커서: caret 위치 전송(anchorId=직전 문자 id). */
  sendCursor(blockId: RgaId, anchorId: RgaId | null): void;
  dispose(): void;
}

export function createRelayClient(
  transport: Transport,
  pageId: string,
  handlers: RelayClientHandlers,
  // getUserId: join 시점에 현재 userId를 읽는다(비동기 /me fetch와 연결 타이밍 디커플).
  // getToken: join 시점에 현재 token을 읽는다.
  // ready: 팩토리 함수. 주어지면 auto-join을 이 함수 호출 완료 후로 미룬다 — 매 onOpen마다 재호출.
  // 실패(reject) 시 join을 전송하지 않는다. 미설정이면 즉시 join.
  opts?: {
    displayName?: string;
    getUserId?: () => string | undefined;
    getToken?: () => string | undefined;
    ready?: () => Promise<unknown>;
  },
): RelayClient {
  const unsubscribers: Array<() => void> = [];

  unsubscribers.push(
    transport.onMessage((data) => {
      const msg = parseServerMessage(data);
      if (!msg) return;
      switch (msg.type) {
        case 'op':
          handlers.onRemoteOp(msg.op);
          break;
        case 'join-ack':
          handlers.onJoinAck?.(msg.connectedClients, msg.clientId);
          break;
        case 'op-ack':
          handlers.onOpAck?.(msg.siteId, msg.seq);
          break;
        case 'presence-update':
          handlers.onPresenceUpdate?.({
            clientId: msg.clientId,
            displayName: msg.displayName,
            color: msg.color,
          });
          break;
        case 'presence-leave':
          handlers.onPresenceLeave?.(msg.clientId);
          break;
        case 'cursor-update':
          handlers.onCursorUpdate?.({
            clientId: msg.clientId,
            blockId: msg.blockId,
            anchorId: msg.anchorId,
          });
          break;
        case 'op-batch':
          handlers.onOpBatch?.(msg.ops, msg.pageId);
          break;
        case 'op-batch-error':
          handlers.onOpBatchError?.(msg.pageId);
          break;
      }
    }),
  );

  function join(page: string): void {
    // WS-AUTH: userId(있으면)·token(있으면)·presence(displayName 있으면)를 실어 보낸다.
    const msg: { type: 'join'; pageId: string; userId?: string; token?: string; presence?: { displayName: string } } = {
      type: 'join',
      pageId: page,
    };
    const userId = opts?.getUserId?.();
    if (userId) msg.userId = userId;
    const token = opts?.getToken?.();
    if (token) msg.token = token;
    if (opts?.displayName) msg.presence = { displayName: opts.displayName };
    transport.send(JSON.stringify(msg));
  }

  // 연결되면 자동으로 room 참여. ready 팩토리가 있으면 매 onOpen마다 재호출 후 join한다.
  // 실패(reject) 시 join 미전송 — 인증 실패.
  unsubscribers.push(
    transport.onOpen(() => {
      if (opts?.ready) {
        void opts.ready().then(() => join(pageId)).catch(() => { /* 인증 실패: join skip */ });
      } else {
        join(pageId);
      }
    }),
  );

  return {
    join,
    sendOp(env) {
      transport.send(JSON.stringify({ type: 'op', pageId, op: env }));
    },
    sendCursor(blockId, anchorId) {
      transport.send(JSON.stringify({ type: 'cursor', pageId, blockId, anchorId }));
    },
    dispose() {
      for (const unsub of unsubscribers.splice(0)) unsub();
      transport.close();
    },
  };
}
