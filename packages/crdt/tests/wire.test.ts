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

  const cases: { name: string; op: AnyOp }[] = [
    { name: 'block-insert', op: makeBlockInsertOp(b1, b0, 'heading1') },
    { name: 'block-delete', op: makeBlockDeleteOp(b1) },
    { name: 'block-set-type', op: makeBlockSetTypeOp(b1, 'bullet', 4, 'C') },
    { name: 'inline-insert', op: makeInlineInsertOp(b1, b0, 'x', b0) },
    { name: 'inline-delete', op: makeInlineDeleteOp(b1, b0) },
  ];

  it('AC-15: 각 op 종류가 wire 봉투로 왕복 직렬화된다 (구조 항등)', () => {
    for (const { op } of cases) {
      const env = toWire(op, 7, 'sender');
      expect(env.seq).toBe(7);
      expect(env.opType).toBe(op.type);
      expect(fromWire(env)).toEqual(op);
    }
  });

  it('AC-15: 봉투는 {siteId, seq, opType, payload} 형태이고 siteId는 명시된 송신자다', () => {
    for (const { op } of cases) {
      const env = toWire(op, 3, 'sender-X');
      expect(Object.keys(env).sort()).toEqual(['opType', 'payload', 'seq', 'siteId']);
      expect(env.siteId).toBe('sender-X'); // 송신자 siteId (op 내부에서 도출하지 않음)
    }
  });

  it('PR#9-1: delete op도 송신자 siteId가 그대로 보존된다 (target site로 오염되지 않음)', () => {
    // User A가 User B(b1.siteId='B')가 만든 블록을 삭제 → 봉투 siteId는 발신자 A여야 함
    const env = toWire(makeBlockDeleteOp(b1), 9, 'A');
    expect(env.siteId).toBe('A'); // target의 'B'가 아님
  });

  it('AC-15: JSON.stringify→parse 왕복에도 op가 손실 없이 보존된다', () => {
    for (const { op } of cases) {
      const env = toWire(op, 1, 'S');
      const roundTripped = fromWire(JSON.parse(JSON.stringify(env)));
      expect(roundTripped).toEqual(op);
    }
  });
});
