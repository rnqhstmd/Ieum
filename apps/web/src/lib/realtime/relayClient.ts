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
  opts?: { displayName?: string },
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
      }
    }),
  );

  function join(page: string): void {
    // opts.displayName이 있으면 presence를 실어 보낸다(없으면 P5 그대로 — 회귀 방지).
    transport.send(
      JSON.stringify(
        opts?.displayName
          ? { type: 'join', pageId: page, presence: { displayName: opts.displayName } }
          : { type: 'join', pageId: page },
      ),
    );
  }

  // 연결되면 자동으로 room 참여.
  unsubscribers.push(transport.onOpen(() => join(pageId)));

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
