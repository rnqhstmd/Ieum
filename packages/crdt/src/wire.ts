// ─── Wire 봉투 (op 전송 직렬화) ──────────────────────────────────
// op는 이미 JSON 안전한 평범한 객체이므로 봉투는 메타(siteId/seq/opType)만 덧입힌다.
// seq는 P5(relay/영속화)가 (pageId, siteId, seq) 유니크를 위해 발급하며 codec은 보관만 한다.

import type { AnyOp } from './types.js';

export interface WireEnvelope {
  siteId: string; // 발신 사이트 (P5 sender 신원)
  seq: number; // 발신 사이트별 시퀀스 번호
  opType: AnyOp['type'];
  payload: AnyOp;
}

/**
 * op를 wire 봉투로 감싼다.
 * siteId 우선순위: 명시 인자 > op.id.siteId(insert/block-insert) > op.siteId(set-type) > op.targetId.siteId(delete).
 */
export function toWire(op: AnyOp, seq: number, siteId?: string): WireEnvelope {
  return { siteId: siteId ?? originSiteId(op), seq, opType: op.type, payload: op };
}

/** 봉투에서 op를 꺼낸다. */
export function fromWire(env: WireEnvelope): AnyOp {
  return env.payload;
}

function originSiteId(op: AnyOp): string {
  switch (op.type) {
    case 'insert':
    case 'block-insert':
      return op.id.siteId;
    case 'block-set-type':
      return op.siteId;
    case 'delete':
    case 'block-delete':
      return op.targetId.siteId;
  }
}
