import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PgMembershipStore } from '../src/pgMembershipStore.js';

// WS-AUTH T2 / AC-5: PgMembershipStore.isMember — pages⋈memberships 실 DB 조회.
const MIGRATIONS = resolve(process.cwd(), '../../backend/src/main/resources/db/migration');
const MEMBER = '11111111-1111-4111-8111-111111111111';
const NONMEMBER = '22222222-2222-4222-8222-222222222222';
const WS = '33333333-3333-4333-8333-333333333333';
const PAGE = '44444444-4444-4444-8444-444444444444';

let container: StartedPostgreSqlContainer;
let admin: Client;
let store: PgMembershipStore;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const url = container.getConnectionUri();
  admin = new Client({ connectionString: url });
  await admin.connect();
  for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    await admin.query(readFileSync(resolve(MIGRATIONS, f), 'utf8'));
  }
  // 멤버/비멤버 + workspace + membership(멤버만) + page.
  await admin.query('INSERT INTO users (id,email,name) VALUES ($1,$2,$3),($4,$5,$6)', [
    MEMBER, 'm@b.c', 'member', NONMEMBER, 'n@b.c', 'nonmember',
  ]);
  await admin.query("INSERT INTO workspaces (id,name,type,owner_id) VALUES ($1,'w','SHARED',$2)", [WS, MEMBER]);
  await admin.query("INSERT INTO memberships (id,user_id,workspace_id,role) VALUES (gen_random_uuid(),$1,$2,'OWNER')", [MEMBER, WS]);
  await admin.query('INSERT INTO pages (id,workspace_id,title,created_by_id) VALUES ($1,$2,$3,$4)', [PAGE, WS, 'p', MEMBER]);
  store = new PgMembershipStore(url);
}, 120000);

afterAll(async () => {
  await store?.close();
  await admin?.end();
  await container?.stop();
});

describe('PgMembershipStore — pages⋈memberships (testcontainers)', () => {
  it('AC-5: 멤버는 isMember(member,page)=true', async () => {
    expect(await store.isMember(MEMBER, PAGE)).toBe(true);
  });
  it('AC-5: 비멤버는 isMember(nonmember,page)=false', async () => {
    expect(await store.isMember(NONMEMBER, PAGE)).toBe(false);
  });
  it('AC-5: 존재하지 않는 page/uuid 형식 위반은 false', async () => {
    expect(await store.isMember(MEMBER, '55555555-5555-4555-8555-555555555555')).toBe(false);
    expect(await store.isMember(MEMBER, 'not-a-uuid')).toBe(false);
  });
});
