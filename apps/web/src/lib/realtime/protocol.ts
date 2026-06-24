// ─── P5 클라이언트 메시지 계약 (06-api-and-realtime.md §2) ────────
// 서버(@ieum/ws-relay protocol.ts)와 동일 계약. walking skeleton에선 복제하며
// 공유 패키지화는 범위 밖. op 필드는 @ieum/crdt WireEnvelope(결정2: 소문자 opType).

import type { WireEnvelope, RgaId } from '@ieum/crdt';

export interface JoinMsg {
  type: 'join';
  pageId: string;
  token?: string;
  userId?: string;
  // P6: 참여 시 표시 이름(아바타용). 서버가 색상을 할당한다.
  presence?: { displayName?: string };
}
export interface OpMsg {
  type: 'op';
  pageId: string;
  op: WireEnvelope;
}
export interface JoinAckMsg {
  type: 'join-ack';
  pageId: string;
  connectedClients: number;
  // P6 커서: 서버 부여 clientId — 자기 커서를 렌더에서 제외(AC-7).
  clientId: string;
}
export interface OpAckMsg {
  type: 'op-ack';
  siteId: string;
  seq: number;
}

// ─── P6 presence (아바타 목록) — ws-relay protocol.ts와 대칭 복제 ──
export interface PresenceInfo {
  clientId: string;
  displayName: string;
  color: string;
}
export interface PresenceUpdateMsg {
  type: 'presence-update';
  clientId: string;
  displayName: string;
  color: string;
}
export interface PresenceLeaveMsg {
  type: 'presence-leave';
  clientId: string;
}

// ─── P6 라이브 커서 (US-PRES-02) — ws-relay protocol.ts와 대칭 복제 ──
/** 원격 커서 1건. 색·이름은 미포함 — 렌더 시 PresenceInfo에서 lookup(단일 출처). */
export interface CursorInfo {
  clientId: string;
  blockId: RgaId;
  anchorId: RgaId | null;
}
/** C→S: caret 위치 보고(clientId 미전송 — 서버 태깅). */
export interface CursorMsg {
  type: 'cursor';
  pageId: string;
  blockId: RgaId;
  anchorId: RgaId | null;
}
/** S→C: 협업자 커서 broadcast(발신자 제외). */
export interface CursorUpdateMsg {
  type: 'cursor-update';
  clientId: string;
  blockId: RgaId;
  anchorId: RgaId | null;
}

export type ClientToServer = JoinMsg | OpMsg | CursorMsg;
export interface OpBatchMsg {
  type: 'op-batch';
  pageId: string;
  ops: WireEnvelope[];
}

export type ServerToClient =
  | JoinAckMsg
  | OpMsg
  | OpAckMsg
  | PresenceUpdateMsg
  | PresenceLeaveMsg
  | CursorUpdateMsg
  | OpBatchMsg;

// RgaId siteId 상한 — 커서 anchorId siteId로 대용량 문자열 broadcast 증폭 차단(C2).
const MAX_SITE_ID = 64;

// prototype pollution 방어: JSON.parse는 __proto__ 등을 own 속성으로 만들 수 있다.
const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'];
function hasDangerousKey(o: object): boolean {
  return DANGEROUS_KEYS.some((k) => Object.prototype.hasOwnProperty.call(o, k));
}

/** RgaId 구조 검증 (커서 blockId/anchorId). proto 가드 + 범위/길이 가드(C1·C2) — 서버와 대칭. */
function isRgaId(v: unknown): v is RgaId {
  if (typeof v !== 'object' || v === null || hasDangerousKey(v)) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.counter === 'number' &&
    Number.isInteger(o.counter) && // C1: Infinity/NaN/소수 차단
    o.counter >= 0 &&
    typeof o.siteId === 'string' &&
    o.siteId.length <= MAX_SITE_ID // C2
  );
}

/** op 봉투(WireEnvelope) 구조 검증 — 서버 parseClientMessage와 대칭. */
function isWireEnvelope(v: unknown): v is WireEnvelope {
  if (typeof v !== 'object' || v === null || hasDangerousKey(v)) return false;
  const o = v as Record<string, unknown>;
  if (
    typeof o.siteId !== 'string' ||
    !Number.isInteger(o.seq) ||
    typeof o.opType !== 'string' ||
    typeof o.payload !== 'object' ||
    o.payload === null
  ) return false;
  if (hasDangerousKey(o.payload as object)) return false;
  return true;
}

/** 서버→클라 메시지 파싱. 실패·미검증 입력 시 null. */
export function parseServerMessage(raw: string): ServerToClient | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || hasDangerousKey(parsed)) return null;
  const o = parsed as Record<string, unknown>;
  switch (o.type) {
    case 'join-ack':
      return typeof o.pageId === 'string' &&
        typeof o.connectedClients === 'number' &&
        typeof o.clientId === 'string'
        ? (o as unknown as JoinAckMsg)
        : null;
    case 'op':
      // op 봉투(WireEnvelope)의 필수 필드만 검증한다. 메시지에 규격 외 추가 필드가 있어도
      // 소비자(onRemoteOp)는 msg.op만 사용하므로 무해 — relay는 신뢰 환경(BR-5). 엄격 검증은 인증 슬라이스에서.
      return typeof o.pageId === 'string' && isWireEnvelope(o.op)
        ? (o as unknown as OpMsg)
        : null;
    case 'op-ack':
      return typeof o.siteId === 'string' && typeof o.seq === 'number'
        ? (o as unknown as OpAckMsg)
        : null;
    case 'presence-update':
      // color는 서버가 PRESENCE_COLORS에서 할당하므로 hex(#RRGGBB)만 허용 — inline style 주입 표면 차단(S3).
      return typeof o.clientId === 'string' &&
        typeof o.displayName === 'string' &&
        typeof o.color === 'string' &&
        /^#[0-9A-Fa-f]{6}$/.test(o.color)
        ? (o as unknown as PresenceUpdateMsg)
        : null;
    case 'presence-leave':
      return typeof o.clientId === 'string' ? (o as unknown as PresenceLeaveMsg) : null;
    case 'cursor-update':
      return typeof o.clientId === 'string' &&
        isRgaId(o.blockId) &&
        (o.anchorId === null || isRgaId(o.anchorId))
        ? (o as unknown as CursorUpdateMsg)
        : null;
    case 'op-batch':
      return typeof o.pageId === 'string' &&
        Array.isArray(o.ops) &&
        (o.ops as unknown[]).every(isWireEnvelope)
        ? (o as unknown as OpBatchMsg)
        : null;
    default:
      return null;
  }
}
