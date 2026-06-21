// ─── WS-AUTH 멤버십 인가 — PgMembershipStore (실 DB) ─────────────
// pageId가 속한 워크스페이스에 userId가 멤버십을 가지는지 Postgres로 조회한다
// (백엔드 AccessGuard.requirePageAccess와 동형: pageId→workspace_id→membership).

import { Pool } from 'pg';
import { isUuid } from './opStore.js';
import type { MembershipStore } from './membershipStore.js';

const IS_MEMBER_SQL = `
  SELECT 1 FROM pages p
  JOIN memberships m ON m.workspace_id = p.workspace_id
  WHERE p.id = $1 AND m.user_id = $2
  LIMIT 1`;

export class PgMembershipStore implements MembershipStore {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
    this.pool.on('error', () => {
      /* idle 연결 끊김 무시(프로세스 보호) */
    });
  }

  async isMember(userId: string, pageId: string): Promise<boolean> {
    // UUID 형식 위반은 멤버 아님(22P02 round-trip 회피).
    if (!isUuid(userId) || !isUuid(pageId)) return false;
    try {
      const r = await this.pool.query(IS_MEMBER_SQL, [pageId, userId]);
      return (r.rowCount ?? 0) > 0;
    } catch {
      // 조회 실패 시 보수적으로 비멤버 처리(접근 거부측 안전).
      return false;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
