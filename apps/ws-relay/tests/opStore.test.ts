import { describe, it, expect } from 'vitest';
import { InMemoryOpStore } from '../src/opStore.js';
import type { WireEnvelope } from '@ieum/crdt';

// P5 후반 op 영속화 T1: OpStore 포트 + InMemoryOpStore(멱등 fake + fallback).
// 순수 — DB 없이 (pageId,siteId,seq) 멱등 추적 + UUID 형식 거부만 검증한다.
const PAGE = '550e8400-e29b-41d4-a716-446655440000';
const PAGE2 = '550e8400-e29b-41d4-a716-446655440001';

const op = (siteId: string, seq: number, opType = 'insert'): WireEnvelope => ({
  siteId,
  seq,
  opType: opType as WireEnvelope['opType'],
  payload: { type: opType, blockId: { counter: 1, siteId } } as unknown as WireEnvelope['payload'],
});

describe('InMemoryOpStore — loadByPage (재접속 복원)', () => {
  it('AC-A1: append 3건 후 loadByPage가 append 순서대로 WireEnvelope[] 반환', async () => {
    const store = new InMemoryOpStore();
    const e1 = op('s1', 1, 'insert');
    const e2 = op('s1', 2, 'delete');
    const e3 = op('s2', 1, 'block-insert');
    await store.append(PAGE, e1);
    await store.append(PAGE, e2);
    await store.append(PAGE, e3);
    const result = await store.loadByPage(PAGE);
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ siteId: 's1', seq: 1, opType: 'insert' });
    expect(result[1]).toMatchObject({ siteId: 's1', seq: 2, opType: 'delete' });
    expect(result[2]).toMatchObject({ siteId: 's2', seq: 1, opType: 'block-insert' });
  });

  it('AC-A4: op 0건 page → loadByPage가 빈 배열 반환', async () => {
    const store = new InMemoryOpStore();
    const result = await store.loadByPage(PAGE);
    expect(result).toEqual([]);
  });

  it('BR-1(duplicate): 멱등 거부된 op는 loadByPage 결과에 미축적', async () => {
    const store = new InMemoryOpStore();
    await store.append(PAGE, op('s1', 1));
    await store.append(PAGE, op('s1', 1)); // duplicate — 거부
    const result = await store.loadByPage(PAGE);
    expect(result).toHaveLength(1);
  });

  it('BR-1(격리): 다른 pageId op는 loadByPage 결과에 미포함', async () => {
    const store = new InMemoryOpStore();
    await store.append(PAGE, op('s1', 1));
    await store.append(PAGE2, op('s2', 1));
    const result = await store.loadByPage(PAGE);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ siteId: 's1', seq: 1 });
  });
});

describe('InMemoryOpStore — 멱등 + UUID 거부', () => {
  it('AC-2: 같은 (pageId,siteId,seq) 두 번째 append는 duplicate', async () => {
    const store = new InMemoryOpStore();
    expect(await store.append(PAGE, op('s1', 1))).toBe('persisted');
    expect(await store.append(PAGE, op('s1', 1))).toBe('duplicate');
  });

  it('AC-2: 다른 seq/site는 각각 persisted', async () => {
    const store = new InMemoryOpStore();
    expect(await store.append(PAGE, op('s1', 1))).toBe('persisted');
    expect(await store.append(PAGE, op('s1', 2))).toBe('persisted');
    expect(await store.append(PAGE, op('s2', 1))).toBe('persisted');
  });

  it('AC-8: 멱등 key는 pageId까지 포함 — 다른 page는 독립', async () => {
    const store = new InMemoryOpStore();
    expect(await store.append(PAGE, op('s1', 1))).toBe('persisted');
    expect(await store.append(PAGE2, op('s1', 1))).toBe('persisted');
  });

  it('AC-5(형식): 비-UUID pageId는 rejected', async () => {
    const store = new InMemoryOpStore();
    expect(await store.append('not-a-uuid', op('s1', 1))).toBe('rejected');
    expect(await store.append('', op('s1', 1))).toBe('rejected');
  });
});
