// ─── P5 relay 메시지 계약 (06-api-and-realtime.md §2) ─────────────
// 클라이언트↔서버 메시지 타입. op 필드는 @ieum/crdt WireEnvelope를 재사용한다
// (결정2: WireEnvelope.opType은 소문자 op.type — relay는 op를 불투명 전달).
// relay 서버는 @ieum/crdt를 타입 용도로만 import한다 (런타임 CRDT 미적용).

import type { WireEnvelope } from '@ieum/crdt';

export interface JoinMsg {
  type: 'join';
  pageId: string;
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

export type ClientToServer = JoinMsg | OpMsg;
export type ServerToClient = JoinAckMsg | OpMsg | OpAckMsg;

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
    return typeof o.pageId === 'string' ? { type: 'join', pageId: o.pageId } : null;
  }
  if (o.type === 'op') {
    if (typeof o.pageId !== 'string') return null;
    if (!isWireEnvelope(o.op) || hasDangerousKey(o.op)) return null;
    return { type: 'op', pageId: o.pageId, op: o.op };
  }
  return null;
}
