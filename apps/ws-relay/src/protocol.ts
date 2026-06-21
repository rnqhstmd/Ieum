// ─── P5 relay 메시지 계약 (06-api-and-realtime.md §2) ─────────────
// 클라이언트↔서버 메시지 타입. op 필드는 @ieum/crdt WireEnvelope를 재사용한다
// (결정2: WireEnvelope.opType은 소문자 op.type — relay는 op를 불투명 전달).
// relay 서버는 @ieum/crdt를 타입 용도로만 import한다 (런타임 CRDT 미적용).

import type { WireEnvelope } from '@ieum/crdt';

export interface JoinMsg {
  type: 'join';
  pageId: string;
  // P6: 참여 시 자신의 표시 이름(아바타용). 미제공 시 서버가 "익명 #N"으로 fallback(BR-4).
  presence?: { displayName?: string };
}

export interface JoinAckMsg {
  type: 'join-ack';
  pageId: string;
  connectedClients: number;
}

export interface OpMsg {
  type: 'op';
  pageId: string;
  op: WireEnvelope;
}

export interface OpAckMsg {
  type: 'op-ack';
  siteId: string;
  seq: number;
}

// ─── P6 presence (아바타 목록) ────────────────────────────────────
/** room 접속자 1명의 presence 정보 — DB 비영속(연결 수명 메모리). */
export interface PresenceInfo {
  clientId: string;
  displayName: string;
  color: string;
}
/** S→C: 접속자 참여/갱신 broadcast (발신자 제외, 단 self는 발신자에게 회신). */
export interface PresenceUpdateMsg {
  type: 'presence-update';
  clientId: string;
  displayName: string;
  color: string;
}
/** S→C: 접속자 이탈 broadcast. */
export interface PresenceLeaveMsg {
  type: 'presence-leave';
  clientId: string;
}

export type ClientToServer = JoinMsg | OpMsg;
export type ServerToClient = JoinAckMsg | OpMsg | OpAckMsg | PresenceUpdateMsg | PresenceLeaveMsg;

// presence displayName 상한 — 64KiB payload를 displayName으로 채워 broadcast 증폭(DoS)하는 것을 차단(S2).
const MAX_DISPLAY_NAME = 64;

// prototype pollution 방어: JSON.parse는 __proto__ 등을 own 속성으로 만들 수 있다.
const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'];
function hasDangerousKey(o: object): boolean {
  return DANGEROUS_KEYS.some((k) => Object.prototype.hasOwnProperty.call(o, k));
}

function isWireEnvelope(v: unknown): v is WireEnvelope {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.siteId === 'string' &&
    typeof o.seq === 'number' &&
    typeof o.opType === 'string' &&
    typeof o.payload === 'object' &&
    o.payload !== null
  );
}

/**
 * 원시 문자열을 ClientToServer 메시지로 파싱한다.
 * JSON 파싱 실패·타입 불일치·필수 필드 누락 시 null을 반환한다.
 * (서버→클라 타입 join-ack/op-ack는 클라이언트 입력으로 허용하지 않으므로 null.)
 */
export function parseClientMessage(raw: string): ClientToServer | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  if (hasDangerousKey(parsed)) return null;
  const o = parsed as Record<string, unknown>;

  if (o.type === 'join') {
    if (typeof o.pageId !== 'string') return null;
    // presence는 선택적. dangerous key는 즉시 null, 그 외 검증 실패는 presence만 버리고
    // join은 유효하게 둔다(서버가 BR-4 "익명 #N"으로 흡수).
    if (o.presence !== undefined && o.presence !== null) {
      if (typeof o.presence === 'object' && !Array.isArray(o.presence)) {
        if (hasDangerousKey(o.presence)) return null;
        const p = o.presence as Record<string, unknown>;
        // 길이 상한 초과 displayName은 버린다(서버가 BR-4 "익명 #N"으로 흡수, S2 증폭 차단).
        if (typeof p.displayName === 'string' && p.displayName.length <= MAX_DISPLAY_NAME) {
          return { type: 'join', pageId: o.pageId, presence: { displayName: p.displayName } };
        }
      }
    }
    return { type: 'join', pageId: o.pageId };
  }
  if (o.type === 'op') {
    if (typeof o.pageId !== 'string') return null;
    if (!isWireEnvelope(o.op) || hasDangerousKey(o.op)) return null;
    return { type: 'op', pageId: o.pageId, op: o.op };
  }
  return null;
}
