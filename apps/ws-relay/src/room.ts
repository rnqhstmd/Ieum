// ─── P5 relay 순수 라우팅 (RoomRegistry) ─────────────────────────
// transport(ws) 비의존. join/op/leave 처리 결과로 "누구에게 무엇을 보낼지"를
// Dispatch[]로 반환만 한다(직접 send 안 함) → fake ClientHandle로 단위 테스트.
// P6: presence(아바타 목록) 상태/색상 슬롯을 registry가 소유하며, ClientHandle은 불투명 유지.

import type { ServerToClient, OpMsg, PresenceInfo, PresenceUpdateMsg } from './protocol.js';

/** 불투명 클라이언트 식별자 — server.ts가 실제 소켓과 매핑한다. */
export interface ClientHandle {
  id: string;
}

/** send 지시: 특정 클라이언트에게 보낼 메시지 1건. */
export interface Dispatch {
  target: ClientHandle;
  message: ServerToClient;
}

// P6 presence 색상 팔레트 (07-collaboration-crdt.md:531 정본). 접속 순서대로 슬롯 할당.
export const PRESENCE_COLORS = [
  '#E57373', '#64B5F6', '#81C784', '#FFD54F',
  '#BA68C8', '#4DB6AC', '#FF8A65', '#90A4AE',
] as const;

function presenceUpdate(info: PresenceInfo): PresenceUpdateMsg {
  return {
    type: 'presence-update',
    clientId: info.clientId,
    displayName: info.displayName,
    color: info.color,
  };
}

export class RoomRegistry {
  /** pageId → 참여 클라이언트 집합 (참조 동일성). */
  private readonly rooms = new Map<string, Set<ClientHandle>>();
  /** clientId → 해당 클라이언트가 속한 pageId (leave 시 역참조). */
  private readonly clientRoom = new Map<string, string>();
  /** clientId → presence 정보 (DB 비영속, 연결 수명 메모리). */
  private readonly presence = new Map<string, PresenceInfo>();
  /** pageId → (clientId → 색상 슬롯 index). room 단위 슬롯 소유, leave 시 반환. */
  private readonly colorSlots = new Map<string, Map<string, number>>();
  /** pageId → "익명 #N" fallback 단조 카운터 (room별 격리). */
  private readonly anonCounters = new Map<string, number>();

  join(client: ClientHandle, pageId: string, presence?: { displayName?: string }): Dispatch[] {
    let room = this.rooms.get(pageId);
    if (!room) {
      room = new Set<ClientHandle>();
      this.rooms.set(pageId, room);
    }
    // 발신자 추가 전의 기존 접속자 — roster(발신자에게) + broadcast(기존자에게) 대상.
    const peers = [...room];
    room.add(client);
    this.clientRoom.set(client.id, pageId);

    const color = this.assignColor(pageId, client.id);
    const displayName = this.resolveDisplayName(pageId, presence?.displayName);
    const selfInfo: PresenceInfo = { clientId: client.id, displayName, color };
    this.presence.set(client.id, selfInfo);

    const dispatches: Dispatch[] = [];
    // [0] join-ack — 불변식: 항상 Dispatch[0] (server.test/room.test의 join-ack 가정 보존).
    dispatches.push({
      target: client,
      message: { type: 'join-ack', pageId, connectedClients: room.size },
    });
    // self presence-update — 서버 할당 color를 발신자에게 회신(AC-7/BR-6, self/peer 동일 경로).
    dispatches.push({ target: client, message: presenceUpdate(selfInfo) });
    // roster — 기존 접속자 presence를 발신자에게(AC-2/FR-3).
    for (const peer of peers) {
      const info = this.presence.get(peer.id);
      if (info) dispatches.push({ target: client, message: presenceUpdate(info) });
    }
    // broadcast — 발신자 presence를 기존 접속자에게(AC-1/FR-2, peer 루프라 발신자 자동 제외).
    for (const peer of peers) {
      dispatches.push({ target: peer, message: presenceUpdate(selfInfo) });
    }
    return dispatches;
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

  /** disconnect 처리 — presence/슬롯 정리 후 남은 peer에게 presence-leave Dispatch[] 반환. */
  leave(client: ClientHandle): Dispatch[] {
    const pageId = this.clientRoom.get(client.id);
    if (pageId === undefined) return [];
    this.clientRoom.delete(client.id);
    this.presence.delete(client.id);
    // 색상 슬롯 반환(재입장 시 재사용, AC-6).
    const slots = this.colorSlots.get(pageId);
    if (slots) {
      slots.delete(client.id);
      if (slots.size === 0) this.colorSlots.delete(pageId);
    }
    const room = this.rooms.get(pageId);
    if (!room) return [];
    room.delete(client);

    const dispatches: Dispatch[] = [];
    for (const peer of room) {
      // room에서 client는 이미 제거됨 → 남은 peer에게만 (AC-3/FR-4).
      dispatches.push({ target: peer, message: { type: 'presence-leave', clientId: client.id } });
    }
    if (room.size === 0) {
      this.rooms.delete(pageId);
      this.anonCounters.delete(pageId);
    }
    return dispatches;
  }

  roomSize(pageId: string): number {
    return this.rooms.get(pageId)?.size ?? 0;
  }

  /** 접속 순서대로 빈 슬롯 0부터 할당, 없으면 modulo 재사용(07:538 정본). */
  private assignColor(pageId: string, clientId: string): string {
    let slots = this.colorSlots.get(pageId);
    if (!slots) {
      slots = new Map<string, number>();
      this.colorSlots.set(pageId, slots);
    }
    const used = new Set(slots.values());
    let slot = PRESENCE_COLORS.findIndex((_, i) => !used.has(i));
    // 8슬롯이 모두 차면(9명+) 색상을 의도적으로 순환 재사용한다(중복 허용) — 07:538 정본.
    if (slot === -1) slot = slots.size % PRESENCE_COLORS.length;
    slots.set(clientId, slot);
    return PRESENCE_COLORS[slot]!;
  }

  /**
   * 빈/미제공 displayName을 room별 "익명 #N"으로 흡수(BR-4).
   * 카운터(anonCounters)는 room별 단조 증가이며 room이 완전히 빌 때만(leave의 size===0) 리셋된다.
   * 따라서 (a) room이 안 비면 "익명 #N"이 계속 증가하고, (b) room이 빈 뒤 재입장하면 #1부터 재시작한다.
   * BR-4는 "비어있지 않은 문자열"만 요구하므로 번호 고유성은 스펙 밖(walking skeleton 수용, CR-1).
   */
  private resolveDisplayName(pageId: string, raw?: string): string {
    const trimmed = raw?.trim();
    if (trimmed) return trimmed;
    const n = (this.anonCounters.get(pageId) ?? 0) + 1;
    this.anonCounters.set(pageId, n);
    return `익명 #${n}`;
  }
}
