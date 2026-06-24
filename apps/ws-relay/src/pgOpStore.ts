// ─── P5 후반 op 영속화 — PgOpStore (실 DB) ───────────────────────
// op를 Postgres crdt_ops에 append-only INSERT한다. (page_id,site_id,seq) 유니크 제약을
// ON CONFLICT DO NOTHING으로 멱등 처리한다(중복 → duplicate). server_seq(IDENTITY)는 DB가
// 삽입 순서대로 단조 부여한다. DDL(스키마)은 Spring/Flyway가 소유 — 여기선 write(INSERT)만.

import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { isUuid } from './opStore.js';
import type { OpStore, AppendOutcome } from './opStore.js';
import type { WireEnvelope } from '@ieum/crdt';

const INSERT_SQL = `
  INSERT INTO crdt_ops (id, page_id, site_id, seq, op_type, payload, created_by_id)
  VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
  ON CONFLICT (page_id, site_id, seq) DO NOTHING
  RETURNING server_seq`;

export class PgOpStore implements OpStore {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
    // idle client 연결 끊김 시 Pool이 'error'를 emit한다 — 미처리 시 Node가 프로세스를
    // 종료한다. server.ts의 socket.on('error')와 동형 방어(프로세스 보호, 리뷰 반영).
    this.pool.on('error', () => {
      /* 끊긴 idle 연결: 다음 query가 새 연결을 확보하므로 무시 */
    });
  }

  async append(pageId: string, op: WireEnvelope, userId?: string | null): Promise<AppendOutcome> {
    // UUID 형식 사전 차단 — DB round-trip 없이 거부(22P02와 동형 결과).
    if (!isUuid(pageId)) return 'rejected';
    try {
      const r = await this.pool.query(INSERT_SQL, [
        randomUUID(),
        pageId,
        op.siteId,
        op.seq,
        op.opType,
        JSON.stringify(op.payload),
        userId ?? null, // WS-AUTH-03: 연결 인증 userId(미인가 경로는 null)
      ]);
      // ON CONFLICT DO NOTHING → 충돌 시 0행(이미 영속), 신규 시 1행.
      return r.rowCount === 1 ? 'persisted' : 'duplicate';
    } catch (e) {
      const code = (e as { code?: string }).code;
      // 23503=FK 위반(존재하지 않는 page), 22P02=invalid uuid → 거부(AC-5).
      if (code === '23503' || code === '22P02') return 'rejected';
      throw e; // 그 외(연결 끊김 등)는 어댑터 try/catch가 흡수 → 무전파(AC-6).
    }
  }

  async loadByPage(pageId: string): Promise<WireEnvelope[]> {
    if (!isUuid(pageId)) return [];
    const r = await this.pool.query(
      'SELECT site_id, seq, op_type, payload FROM crdt_ops WHERE page_id=$1 ORDER BY server_seq ASC',
      [pageId],
    );
    return r.rows.map((row) => ({
      siteId: row.site_id as string,
      seq: Number(row.seq),
      opType: row.op_type as WireEnvelope['opType'],
      payload: row.payload as WireEnvelope['payload'],
    }));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
