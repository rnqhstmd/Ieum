// ─── P5 relay 메시지 계약 (06-api-and-realtime.md §2) ─────────────
// 클라이언트↔서버 메시지 타입. op 필드는 @ieum/crdt WireEnvelope를 재사용한다
// (결정2: WireEnvelope.opType은 소문자 op.type — relay는 op를 불투명 전달).
// relay 서버는 @ieum/crdt를 타입 용도로만 import한다 (런타임 CRDT 미적용).

import type { WireEnvelope, RgaId } from '@ieum/crdt';

export interface JoinMsg {
  type: 'join';
  pageId: string;
  // WS-AUTH: 참여자의 인증 userId(웹이 /api/users/me로 얻어 trust-relay). 멤버십은 서버가
  // DB로 판정한다. 선택적 — 게이트 비활성(DB 미구성) 시 미사용. 신원 위조 방지는 후속.
  userId?: string;
  // P6: 참여 시 자신의 표시 이름(아바타용). 미제공 시 서버가 "익명 #N"으로 fallback(BR-4).
  presence?: { displayName?: string };
}

export interface JoinAckMsg {
  type: 'join-ack';
  pageId: string;
  connectedClients: number;
  // P6 커서: 서버가 부여한 clientId 회신 — 클라가 자기 커서를 렌더에서 제외(AC-7).
  clientId: string;
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

// ─── P6 라이브 커서 (US-PRES-02) ──────────────────────────────────
/** C→S: caret 위치 보고. clientId는 서버가 태깅(클라 미전송). anchorId=caret 직전 문자 id. */
export interface CursorMsg {
  type: 'cursor';
  pageId: string;
  blockId: RgaId;
  anchorId: RgaId | null;
}
/** S→C: 협업자 커서 broadcast (발신자 제외). 비영속(저장/roster 없음). */
export interface CursorUpdateMsg {
  type: 'cursor-update';
  clientId: string;
  blockId: RgaId;
  anchorId: RgaId | null;
}

/** S→C: 재접속 복원용 op 일괄 전송 (join 직후, loadByPage 결과). */
export interface OpBatchMsg {
  type: 'op-batch';
  pageId: string;
  ops: WireEnvelope[];
}

export type ClientToServer = JoinMsg | OpMsg | CursorMsg;
export type ServerToClient =
  | JoinAckMsg
  | OpMsg
  | OpAckMsg
  | PresenceUpdateMsg
  | PresenceLeaveMsg
  | CursorUpdateMsg
  | OpBatchMsg;

// presence displayName 상한 — 64KiB payload를 displayName으로 채워 broadcast 증폭(DoS)하는 것을 차단(S2).
const MAX_DISPLAY_NAME = 64;
// RgaId siteId 상한 — 커서 anchorId의 siteId로 대용량 문자열을 채워 broadcast 증폭하는 것을 차단(C2).
const MAX_SITE_ID = 64;

// prototype pollution 방어: JSON.parse는 __proto__ 등을 own 속성으로 만들 수 있다.
const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'];
function hasDangerousKey(o: object): boolean {
  return DANGEROUS_KEYS.some((k) => Object.prototype.hasOwnProperty.call(o, k));
}

/** RgaId 구조 검증 (커서 blockId/anchorId). proto 가드 + 범위/길이 가드(C1·C2). */
function isRgaId(v: unknown): v is RgaId {
  if (typeof v !== 'object' || v === null || hasDangerousKey(v)) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.counter === 'number' &&
    Number.isInteger(o.counter) && // C1: Infinity/NaN/소수 차단(JSON 직렬화 시 null화로 커서 점프 방지)
    o.counter >= 0 &&
    typeof o.siteId === 'string' &&
    o.siteId.length <= MAX_SITE_ID // C2: broadcast 증폭 차단
  );
}

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
    // userId(선택, trust-relay 신원): 문자열 + 길이 상한만 검증. 멤버십은 서버가 DB로 판정.
    const userId =
      typeof o.userId === 'string' && o.userId.length <= MAX_SITE_ID ? o.userId : undefined;
    // presence는 선택적. dangerous key는 즉시 null, 그 외 검증 실패는 presence만 버리고
    // join은 유효하게 둔다(서버가 BR-4 "익명 #N"으로 흡수).
    if (o.presence !== undefined && o.presence !== null) {
      if (typeof o.presence === 'object' && !Array.isArray(o.presence)) {
        if (hasDangerousKey(o.presence)) return null;
        const p = o.presence as Record<string, unknown>;
        // 길이 상한 초과 displayName은 버린다(서버가 BR-4 "익명 #N"으로 흡수, S2 증폭 차단).
        if (typeof p.displayName === 'string' && p.displayName.length <= MAX_DISPLAY_NAME) {
          return { type: 'join', pageId: o.pageId, userId, presence: { displayName: p.displayName } };
        }
      }
    }
    return { type: 'join', pageId: o.pageId, userId };
  }
  if (o.type === 'op') {
    if (typeof o.pageId !== 'string') return null;
    if (!isWireEnvelope(o.op) || hasDangerousKey(o.op)) return null;
    return { type: 'op', pageId: o.pageId, op: o.op };
  }
  if (o.type === 'cursor') {
    if (typeof o.pageId !== 'string') return null;
    if (!isRgaId(o.blockId)) return null;
    if (!(o.anchorId === null || isRgaId(o.anchorId))) return null;
    return {
      type: 'cursor',
      pageId: o.pageId,
      blockId: o.blockId,
      anchorId: o.anchorId as RgaId | null,
    };
  }
  return null;
}
