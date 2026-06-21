// ─── P5 클라이언트 메시지 계약 (06-api-and-realtime.md §2) ────────
// 서버(@ieum/ws-relay protocol.ts)와 동일 계약. walking skeleton에선 복제하며
// 공유 패키지화는 범위 밖. op 필드는 @ieum/crdt WireEnvelope(결정2: 소문자 opType).

import type { WireEnvelope } from '@ieum/crdt';

export interface JoinMsg {
  type: 'join';
  pageId: string;
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

/** op 봉투(WireEnvelope) 구조 검증 — 서버 parseClientMessage와 대칭. */
function isWireEnvelope(v: unknown): v is WireEnvelope {
  if (typeof v !== 'object' || v === null || hasDangerousKey(v)) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.siteId === 'string' &&
    typeof o.seq === 'number' &&
    typeof o.opType === 'string' &&
    typeof o.payload === 'object' &&
    o.payload !== null
  );
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
      return typeof o.pageId === 'string' && typeof o.connectedClients === 'number'
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
    default:
      return null;
  }
}
