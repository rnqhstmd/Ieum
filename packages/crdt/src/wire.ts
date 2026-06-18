// ─── Wire 봉투 (op 전송 직렬화) ──────────────────────────────────
// op는 이미 JSON 안전한 평범한 객체이므로 봉투는 메타(siteId/seq/opType)만 덧입힌다.
// seq는 P5(relay/영속화)가 (pageId, siteId, seq) 유니크를 위해 발급하며 codec은 보관만 한다.

import type { AnyOp } from './types.js';

export interface WireEnvelope {
  siteId: string; // 발신 사이트(송신자) — seq와 쌍을 이뤄 (pageId, siteId, seq) 유니크/순서 추적
  seq: number; // 발신 사이트별 시퀀스 번호
  // 주의: opType은 인라인 op와 블록 op의 insert/delete를 구분하지 않는다('insert'/'delete' 공유).
  // 인라인 여부는 payload.blockId 유무로 판별한다(applyDocOp가 이를 처리). P5 소비자도 동일하게 검사할 것.
  opType: AnyOp['type'];
  payload: AnyOp;
}

/**
 * op를 wire 봉투로 감싼다.
 * siteId는 **송신자(sender) 식별자로 필수**다 — delete op는 자체적으로 발신자를 담지 않으므로
 * op에서 도출하면 안 된다(target의 site로 오염되어 seq 추적이 깨짐). 호출자(P5 relay/클라이언트)가
 * 인증된 연결의 송신자 siteId를 반드시 명시 전달한다.
 */
export function toWire(op: AnyOp, seq: number, siteId: string): WireEnvelope {
  return { siteId, seq, opType: op.type, payload: op };
}

/** 봉투에서 op를 꺼낸다. */
export function fromWire(env: WireEnvelope): AnyOp {
  return env.payload;
}
