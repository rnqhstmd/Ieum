import { describe, it, expect } from 'vitest';
import {
  toWire,
  fromWire,
  makeBlockInsertOp,
  makeBlockDeleteOp,
  makeBlockSetTypeOp,
  makeInlineInsertOp,
  makeInlineDeleteOp,
} from '../src/index.js';
import type { AnyOp } from '../src/index.js';

describe('wire 봉투 codec (toWire / fromWire)', () => {
  const b0 = { counter: 1, siteId: 'A' };
  const b1 = { counter: 2, siteId: 'B' };

  const cases: { name: string; op: AnyOp; expectedSite: string }[] = [
    { name: 'block-insert', op: makeBlockInsertOp(b1, b0, 'heading1'), expectedSite: 'B' },
    { name: 'block-delete', op: makeBlockDeleteOp(b1), expectedSite: 'B' },
    { name: 'block-set-type', op: makeBlockSetTypeOp(b1, 'bullet', 4, 'C'), expectedSite: 'C' },
    { name: 'inline-insert', op: makeInlineInsertOp(b1, b0, 'x', b0), expectedSite: 'B' },
    { name: 'inline-delete', op: makeInlineDeleteOp(b1, b0), expectedSite: 'B' },
  ];

  it('AC-15: 각 op 종류가 wire 봉투로 왕복 직렬화된다 (구조 항등)', () => {
    for (const { op } of cases) {
      const env = toWire(op, 7);
      expect(env.seq).toBe(7);
      expect(env.opType).toBe(op.type);
      expect(fromWire(env)).toEqual(op);
    }
  });

  it('AC-15: 봉투는 {siteId, seq, opType, payload} 형태이고 siteId가 도출된다', () => {
    for (const { op, expectedSite } of cases) {
      const env = toWire(op, 3);
      expect(Object.keys(env).sort()).toEqual(['opType', 'payload', 'seq', 'siteId']);
      expect(env.siteId).toBe(expectedSite);
    }
  });

  it('AC-15: siteId 인자를 명시하면 우선한다 (P5 sender 신원)', () => {
    const env = toWire(makeBlockDeleteOp(b1), 9, 'sender-site');
    expect(env.siteId).toBe('sender-site');
  });

  it('AC-15: JSON.stringify→parse 왕복에도 op가 손실 없이 보존된다', () => {
    for (const { op } of cases) {
      const env = toWire(op, 1);
      const roundTripped = fromWire(JSON.parse(JSON.stringify(env)));
      expect(roundTripped).toEqual(op);
    }
  });
});
