import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PgOpStore } from '../src/pgOpStore.js';
import type { WireEnvelope } from '@ieum/crdt';

// T4 / AC-1,3,4,5: PgOpStore 실 DB 영속화. throwaway PG(testcontainers)에 실제 Flyway
// 마이그레이션(V1+V2+V3)을 적용하고 user→workspace→page 픽스처를 시드한 뒤 검증한다.
const MIGRATIONS = resolve(process.cwd(), '../../backend/src/main/resources/db/migration');
const USER = '11111111-1111-4111-8111-111111111111';
const WS = '22222222-2222-4222-8222-222222222222';
const PAGE = '33333333-3333-4333-8333-333333333333';
const GHOST = '44444444-4444-4444-8444-444444444444';

function wire(siteId: string, seq: number, opType = 'insert'): WireEnvelope {
  return {
    siteId,
    seq,
    opType: opType as WireEnvelope['opType'],
    payload: { type: opType, v: `${siteId}-${seq}` } as unknown as WireEnvelope['payload'],
  };
}

let container: StartedPostgreSqlContainer;
let admin: Client;
let store: PgOpStore;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const url = container.getConnectionUri();
  admin = new Client({ connectionString: url });
  await admin.connect();
  // Flyway와 동일하게 버전 순서로 모든 마이그레이션을 적용(V3 포함).
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of files) await admin.query(readFileSync(resolve(MIGRATIONS, f), 'utf8'));
  // FK 픽스처: user → workspace(PERSONAL) → page.
  await admin.query('INSERT INTO users (id,email,name) VALUES ($1,$2,$3)', [USER, 'a@b.c', 'tester']);
  await admin.query("INSERT INTO workspaces (id,name,type,owner_id) VALUES ($1,'w','PERSONAL',$2)", [WS, USER]);
  await admin.query('INSERT INTO pages (id,workspace_id,title,created_by_id) VALUES ($1,$2,$3,$4)', [PAGE, WS, 'p', USER]);
  store = new PgOpStore(url);
}, 120000);

afterAll(async () => {
  await store?.close();
  await admin?.end();
  await container?.stop();
});

async function pageRowCount(pageId: string): Promise<number> {
  const r = await admin.query('SELECT count(*)::int AS n FROM crdt_ops WHERE page_id=$1', [pageId]);
  return r.rows[0].n as number;
}

describe('PgOpStore — 실 DB 영속화 (testcontainers)', () => {
  it('AC-1: 유효 op append → persisted + crdt_ops 1행(server_seq 부여)', async () => {
    expect(await store.append(PAGE, wire('s1', 1))).toBe('persisted');
    const r = await admin.query(
      'SELECT site_id,seq,op_type,server_seq FROM crdt_ops WHERE page_id=$1 AND site_id=$2 AND seq=$3',
      [PAGE, 's1', 1],
    );
    expect(r.rowCount).toBe(1);
    expect(r.rows[0].op_type).toBe('insert');
    expect(Number(r.rows[0].server_seq)).toBeGreaterThan(0);
  });

  it('AC-2: 중복 (page,site,seq) → duplicate, 행수 불변', async () => {
    const before = await pageRowCount(PAGE);
    expect(await store.append(PAGE, wire('s1', 1))).toBe('duplicate');
    expect(await pageRowCount(PAGE)).toBe(before);
  });

  it('AC-3: server_seq는 삽입 순서대로 단조 증가', async () => {
    expect(await store.append(PAGE, wire('sa', 1))).toBe('persisted');
    expect(await store.append(PAGE, wire('sb', 1))).toBe('persisted');
    expect(await store.append(PAGE, wire('sa', 2))).toBe('persisted');
    const r = await admin.query(
      "SELECT site_id,seq,server_seq FROM crdt_ops WHERE page_id=$1 AND site_id IN ('sa','sb') ORDER BY server_seq",
      [PAGE],
    );
    const seqs = r.rows.map((x) => Number(x.server_seq));
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    const at = (s: string, q: number) => Number(r.rows.find((x) => x.site_id === s && x.seq === q)!.server_seq);
    expect(at('sa', 1)).toBeLessThan(at('sb', 1));
    expect(at('sb', 1)).toBeLessThan(at('sa', 2));
  });

  it('AC-4: wire opType 5종 모두 INSERT 성공(op_type CHECK 위반 0)', async () => {
    const types = ['insert', 'delete', 'block-insert', 'block-delete', 'block-set-type'] as const;
    for (let i = 0; i < types.length; i++) {
      expect(await store.append(PAGE, wire('s_types', 100 + i, types[i]))).toBe('persisted');
    }
    const r = await admin.query(
      "SELECT op_type FROM crdt_ops WHERE page_id=$1 AND site_id='s_types' ORDER BY seq",
      [PAGE],
    );
    expect(r.rows.map((x) => x.op_type)).toEqual([...types]);
  });

  it('AC-5(FK): 존재하지 않는 pageId → rejected, INSERT 0', async () => {
    expect(await store.append(GHOST, wire('s1', 1))).toBe('rejected');
    expect(await pageRowCount(GHOST)).toBe(0);
  });

  it('AC-5(형식): UUID 형식이 아닌 pageId → rejected', async () => {
    expect(await store.append('not-a-uuid', wire('s1', 1))).toBe('rejected');
  });

  // WS-AUTH T4 / AC-6: append에 userId 전달 시 crdt_ops.created_by_id에 저장(V4).
  it('AC-6: userId 전달 시 created_by_id에 저장된다', async () => {
    expect(await store.append(PAGE, wire('s_user', 300), USER)).toBe('persisted');
    const r = await admin.query(
      "SELECT created_by_id FROM crdt_ops WHERE page_id=$1 AND site_id='s_user'",
      [PAGE],
    );
    expect(r.rows[0].created_by_id).toBe(USER);
  });

  it('AC-6: userId 없이 append하면 created_by_id는 NULL', async () => {
    expect(await store.append(PAGE, wire('s_anon', 301))).toBe('persisted');
    const r = await admin.query(
      "SELECT created_by_id FROM crdt_ops WHERE page_id=$1 AND site_id='s_anon'",
      [PAGE],
    );
    expect(r.rows[0].created_by_id).toBeNull();
  });
});
