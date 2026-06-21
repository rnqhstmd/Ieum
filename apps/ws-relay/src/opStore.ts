// ─── P5 후반 op 영속화 포트 (OpStore) ────────────────────────────
// relay의 순수 라우팅(RoomRegistry)과 DB I/O를 분리하는 포트. handleOp는
// 영속화 결과(outcome)만 받아 Dispatch[]를 결정한다(순수성 보존, AC-7).
// InMemoryOpStore는 테스트 fake이자 DATABASE_URL 미설정 시 fallback(AC-8/S3).

import type { WireEnvelope } from '@ieum/crdt';

/** op append 결과. persisted=새 행, duplicate=이미 존재, rejected=거부(invalid pageId/FK). */
export type AppendOutcome = 'persisted' | 'duplicate' | 'rejected';

export interface OpStore {
  /** op를 영속화한다. (page_id,site_id,seq) 멱등. 반환 outcome으로 dispatch 분기. */
  append(pageId: string, op: WireEnvelope): Promise<AppendOutcome>;
  /** 연결 풀 등 리소스 정리(선택적). */
  close?(): Promise<void>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** crdt_ops.page_id는 uuid 컬럼 — UUID 형식만 허용(PgOpStore의 22P02 거부와 동형). */
export function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

/**
 * 인메모리 멱등 store. DB 없이 (pageId,siteId,seq)를 Set으로 추적한다.
 * - DATABASE_URL 미설정 시 fallback(기존 walking skeleton 2탭 broadcast 회귀 0).
 * - FK(페이지 존재)는 메모리에 없어 검증 불가 — UUID 형식만 거부한다.
 */
export class InMemoryOpStore implements OpStore {
  private readonly seen = new Set<string>();

  async append(pageId: string, op: WireEnvelope): Promise<AppendOutcome> {
    if (!isUuid(pageId)) return 'rejected';
    const key = `${pageId}|${op.siteId}|${op.seq}`;
    if (this.seen.has(key)) return 'duplicate';
    this.seen.add(key);
    return 'persisted';
  }
}
