// ─── P5 relay 순수 라우팅 (RoomRegistry) ─────────────────────────
// transport(ws) 비의존. join/op 처리 결과로 "누구에게 무엇을 보낼지"를
// Dispatch[]로 반환만 한다(직접 send 안 함) → fake ClientHandle로 단위 테스트.

import type { ServerToClient, OpMsg } from './protocol.js';

/** 불투명 클라이언트 식별자 — server.ts가 실제 소켓과 매핑한다. */
export interface ClientHandle {
  id: string;
}

/** send 지시: 특정 클라이언트에게 보낼 메시지 1건. */
export interface Dispatch {
  target: ClientHandle;
  message: ServerToClient;
}

export class RoomRegistry {
  /** pageId → 참여 클라이언트 집합 (참조 동일성). */
  private readonly rooms = new Map<string, Set<ClientHandle>>();
  /** clientId → 해당 클라이언트가 속한 pageId (leave 시 역참조). */
  private readonly clientRoom = new Map<string, string>();

  join(client: ClientHandle, pageId: string): Dispatch[] {
    let room = this.rooms.get(pageId);
    if (!room) {
      room = new Set<ClientHandle>();
      this.rooms.set(pageId, room);
    }
    room.add(client);
    this.clientRoom.set(client.id, pageId);
    return [{ target: client, message: { type: 'join-ack', pageId, connectedClients: room.size } }];
  }

  handleOp(client: ClientHandle, msg: OpMsg): Dispatch[] {
    const dispatches: Dispatch[] = [];
    // op-ack는 발신자에게 항상 반환 (AC-4, AC-9: broadcast 대상이 없어도).
    dispatches.push({
      target: client,
      message: { type: 'op-ack', siteId: msg.op.siteId, seq: msg.op.seq },
    });
    // 보안: 클라이언트가 **실제 join한 room**으로만 broadcast한다. msg.pageId가 join한
    // room과 다르면(또는 join 안 했으면) broadcast하지 않는다(교차 room op 주입 차단).
    const joinedPage = this.clientRoom.get(client.id);
    if (joinedPage !== undefined && joinedPage === msg.pageId) {
      const room = this.rooms.get(joinedPage);
      if (room) {
        for (const peer of room) {
          if (peer === client) continue; // AC-3/BR-2: 발신자 제외
          dispatches.push({ target: peer, message: msg });
        }
      }
    }
    return dispatches;
  }

  leave(client: ClientHandle): void {
    const pageId = this.clientRoom.get(client.id);
    if (pageId === undefined) return;
    this.clientRoom.delete(client.id);
    const room = this.rooms.get(pageId);
    if (!room) return;
    room.delete(client);
    if (room.size === 0) this.rooms.delete(pageId);
  }

  roomSize(pageId: string): number {
    return this.rooms.get(pageId)?.size ?? 0;
  }
}
