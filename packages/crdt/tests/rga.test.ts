import { describe, it, expect } from 'vitest';
import {
  createRga,
  applyOp,
  localInsert,
  localDelete,
  toText,
  serializeRga,
  deserializeRga,
} from '../src/rga.js';
import { idEquals } from '../src/id.js';
import type { RgaId, InsertOp, DeleteOp, RgaOp, RgaState } from '../src/types.js';

// ─── 테스트 헬퍼 ──────────────────────────────────────────────────
const ins = (
  counter: number,
  siteId: string,
  originId: RgaId | null,
  value: string,
): InsertOp => ({ type: 'insert', id: { counter, siteId }, originId, value });

const del = (counter: number, siteId: string): DeleteOp => ({
  type: 'delete',
  targetId: { counter, siteId },
});

/** ops를 순서대로 적용한 새 replica를 만든다. */
function replicaFrom(siteId: string, ops: RgaOp[]): RgaState {
  const r = createRga(siteId);
  for (const op of ops) applyOp(r, op);
  return r;
}

/** 배열의 모든 순열을 생성한다. */
function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const res: T[][] = [];
  arr.forEach((x, i) => {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) res.push([x, ...p]);
  });
  return res;
}

/** 시드 기반 결정론적 PRNG (mulberry32) — 외부 의존성 없이 property 테스트용. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

// ─── createRga (최소 초기 상태) ──────────────────────────────────
describe('createRga', () => {
  it('AC-1: siteId가 설정되고 sentinel 노드가 초기화된다', () => {
    const rga = createRga('site-A');
    expect(rga.siteId).toBe('site-A');
    expect(rga.sentinel.deleted).toBe(true);
    expect(rga.sentinel.next).toBeNull();
  });

  it('AC-1: nodeMap이 비어 있고 localClock이 0이다', () => {
    const rga = createRga('site-A');
    expect(rga.nodeMap.size).toBe(0);
    expect(rga.localClock).toBe(0);
    expect(rga.pendingBuffer).toHaveLength(0);
  });
});

// ─── localInsert / localDelete ───────────────────────────────────
describe('localInsert / localDelete', () => {
  it('AC-2: 로컬 삽입이 텍스트에 반영되고 op를 반환한다 (head originId=null)', () => {
    const rga = createRga('A');
    const op = localInsert(rga, 0, 'a');
    expect(toText(rga)).toBe('a');
    expect(op.type).toBe('insert');
    expect(op.value).toBe('a');
    expect(op.originId).toBeNull();
    expect(op.id.counter).toBe(1);
    expect(op.id.siteId).toBe('A');
  });

  it('AC-3: 연속 삽입은 originId 체인과 counter 증가를 유지한다', () => {
    const rga = createRga('A');
    const op1 = localInsert(rga, 0, 'a');
    const op2 = localInsert(rga, 1, 'b');
    expect(toText(rga)).toBe('ab');
    expect(op2.id.counter).toBe(2);
    expect(op2.originId).not.toBeNull();
    expect(idEquals(op2.originId as RgaId, op1.id)).toBe(true);
  });

  it('AC-3: 중간 위치 삽입도 가시 인덱스 기준으로 동작한다', () => {
    const rga = createRga('A');
    localInsert(rga, 0, 'a');
    localInsert(rga, 1, 'c');
    localInsert(rga, 1, 'b'); // a[b]c
    expect(toText(rga)).toBe('abc');
  });

  it('AC-4: 로컬 삭제는 문자를 tombstone 처리하고 DeleteOp를 반환한다', () => {
    const rga = createRga('A');
    const opA = localInsert(rga, 0, 'a');
    localInsert(rga, 1, 'b');
    const op = localDelete(rga, 0);
    expect(op.type).toBe('delete');
    expect(idEquals(op.targetId, opA.id)).toBe(true);
    expect(toText(rga)).toBe('b');
  });

  it('AC-5: 범위를 벗어난 로컬 삭제는 에러를 던진다', () => {
    const rga = createRga('A');
    localInsert(rga, 0, 'a');
    expect(() => localDelete(rga, 5)).toThrow();
  });
});

// ─── 수렴성 (Convergence) ─────────────────────────────────────────
describe('수렴성 (Convergence)', () => {
  it('AC-6: 두 사이트가 다른 위치에 삽입 후 op를 교차 적용하면 수렴한다', () => {
    const opA = ins(1, 'A', null, 'a');
    const opB = ins(1, 'B', { counter: 1, siteId: 'A' }, 'b');
    const r1 = replicaFrom('A', [opA, opB]);
    const r2 = replicaFrom('B', [opB, opA]); // opB 먼저 → 버퍼링 후 opA 도착 시 드레인
    expect(toText(r1)).toBe('ab');
    expect(toText(r2)).toBe('ab');
    expect(toText(r1)).toBe(toText(r2));
  });

  it('AC-7: 같은 originId·counter 다른 두 insert는 높은 counter가 앞으로 수렴한다', () => {
    const opX = ins(1, 'X', null, 'x');
    const opHi = ins(3, 'A', { counter: 1, siteId: 'X' }, 'H');
    const opLo = ins(2, 'B', { counter: 1, siteId: 'X' }, 'L');
    const texts = permutations([opX, opHi, opLo]).map((order) =>
      toText(replicaFrom('Z', order)),
    );
    expect(new Set(texts).size).toBe(1); // 모든 순열 동일
    expect(texts[0]).toBe('xHL'); // counter 3(H)이 counter 2(L)보다 앞
  });

  it('AC-8: 같은 originId·counter 동일·siteId 다름은 siteId 역순으로 수렴한다 ("adcb")', () => {
    const opA = ins(1, 'A', null, 'a');
    const opB = ins(1, 'B', { counter: 1, siteId: 'A' }, 'b');
    const opC = ins(2, 'A', { counter: 1, siteId: 'A' }, 'c');
    const opD = ins(2, 'B', { counter: 1, siteId: 'A' }, 'd');
    const r1 = replicaFrom('A', [opA, opB, opC, opD]);
    const r2 = replicaFrom('B', [opA, opB, opD, opC]);
    expect(toText(r1)).toBe('adcb'); // (2,B) 'd'가 (2,A) 'c'보다 앞
    expect(toText(r2)).toBe('adcb');
  });

  it('AC-9: 세 의존 op의 6가지 순열 모두에서 toText가 동일하다', () => {
    const op1 = ins(1, 'A', null, 'a');
    const op2 = ins(2, 'A', { counter: 1, siteId: 'A' }, 'b');
    const op3 = ins(3, 'A', { counter: 2, siteId: 'A' }, 'c');
    const texts = permutations([op1, op2, op3]).map((order) =>
      toText(replicaFrom('Z', order)),
    );
    expect(new Set(texts).size).toBe(1);
    expect(texts[0]).toBe('abc');
  });
});

// ─── 멱등성 (Idempotency) ─────────────────────────────────────────
describe('멱등성 (Idempotency)', () => {
  it('AC-10: 같은 insert op를 2·3회 적용해도 상태가 불변이다', () => {
    const op = ins(1, 'A', null, 'a');
    const rga = createRga('A');
    applyOp(rga, op);
    applyOp(rga, op);
    applyOp(rga, op);
    expect(rga.nodeMap.size).toBe(1);
    expect(toText(rga)).toBe('a');
  });

  it('AC-11: 이미 tombstone인 노드에 delete를 재적용해도 에러 없이 불변이다', () => {
    const rga = replicaFrom('A', [ins(1, 'A', null, 'a')]);
    const d = del(1, 'A');
    applyOp(rga, d);
    applyOp(rga, d);
    const node = rga.nodeMap.get('1@A')!;
    expect(node.deleted).toBe(true);
    expect(toText(rga)).toBe('');
  });

  it('AC-14: 같은 노드를 삭제하는 delete를 여러 replica가 받아도 수렴한다', () => {
    const seed = [ins(1, 'A', null, 'a'), ins(2, 'A', { counter: 1, siteId: 'A' }, 'b')];
    const d = del(1, 'A');
    const r1 = replicaFrom('A', [...seed, d]);
    const r2 = replicaFrom('B', [...seed, d, d]); // 중복 수신
    expect(toText(r1)).toBe('b');
    expect(toText(r2)).toBe('b');
  });
});

// ─── 교환법칙 (Commutativity) ────────────────────────────────────
describe('교환법칙 (Commutativity)', () => {
  it('AC-12: 독립적인 두 op는 적용 순서를 바꿔도 동일하게 수렴한다', () => {
    const opA = ins(1, 'A', null, 'a');
    const opB = ins(1, 'B', null, 'b');
    const r1 = replicaFrom('Z', [opA, opB]);
    const r2 = replicaFrom('Z', [opB, opA]);
    expect(toText(r1)).toBe(toText(r2));
    expect(toText(r1)).toBe('ba'); // counter 동일 → siteId B>A → b 먼저
  });

  it('AC-13: 독립적인 insert와 delete는 순서 무관하게 수렴한다', () => {
    const base = [ins(1, 'A', null, 'a')];
    const opIns = ins(2, 'B', { counter: 1, siteId: 'A' }, 'x');
    const opDel = del(1, 'A');
    const r1 = replicaFrom('Z', [...base, opIns, opDel]);
    const r2 = replicaFrom('Z', [...base, opDel, opIns]);
    expect(toText(r1)).toBe(toText(r2));
    expect(toText(r1)).toBe('x');
  });
});

// ─── 인과 버퍼링 (Causal Buffering) ─────────────────────────────
describe('인과 버퍼링 (Causal Buffering)', () => {
  it('AC-15: originId가 아직 없는 insert op는 pendingBuffer에 보관된다', () => {
    const rga = createRga('A');
    applyOp(rga, ins(1, 'A', { counter: 99, siteId: 'X' }, 'z'));
    expect(rga.pendingBuffer).toHaveLength(1);
    expect(toText(rga)).toBe('');
  });

  it('AC-16: originId op가 도착하면 버퍼의 op가 자동 적용된다 (drainBuffer)', () => {
    const rga = createRga('A');
    applyOp(rga, ins(2, 'B', { counter: 1, siteId: 'A' }, 'b')); // 버퍼링
    expect(rga.pendingBuffer).toHaveLength(1);
    applyOp(rga, ins(1, 'A', null, 'a')); // 드레인 유발
    expect(rga.pendingBuffer).toHaveLength(0);
    expect(toText(rga)).toBe('ab');
  });

  it('AC-17: 3단계 의존성 체인을 역순으로 도착시켜도 수렴한다', () => {
    const opA = ins(1, 'A', null, 'a');
    const opB = ins(2, 'A', { counter: 1, siteId: 'A' }, 'b');
    const opC = ins(3, 'A', { counter: 2, siteId: 'A' }, 'c');
    const rga = createRga('A');
    applyOp(rga, opC); // 버퍼
    applyOp(rga, opB); // 버퍼
    expect(rga.pendingBuffer).toHaveLength(2);
    applyOp(rga, opA); // 드레인 체인
    expect(rga.pendingBuffer).toHaveLength(0);
    expect(toText(rga)).toBe('abc');
  });
});

// ─── Snapshot 직렬화/역직렬화 ────────────────────────────────────
describe('Snapshot 직렬화/역직렬화', () => {
  const buildOps = (): RgaOp[] => {
    const ops: RgaOp[] = [];
    let prev: RgaId | null = null;
    const word = 'hello world snapshot';
    for (let i = 0; i < word.length; i++) {
      const id = { counter: i + 1, siteId: 'A' };
      ops.push(ins(id.counter, 'A', prev, word[i]!));
      prev = id;
    }
    ops.push(del(1, 'A')); // 'h' 삭제 → tombstone
    return ops;
  };

  it('AC-18: serialize→deserialize 왕복 후 toText가 원본과 동일하다', () => {
    const original = replicaFrom('A', buildOps());
    const restored = deserializeRga(serializeRga(original));
    expect(toText(restored)).toBe(toText(original));
  });

  it('AC-19: 직렬화 결과에 tombstone 노드가 포함된다 (MVP: GC 없음)', () => {
    const rga = replicaFrom('A', [ins(1, 'A', null, 'a'), del(1, 'A')]);
    const snap = serializeRga(rga);
    expect(snap.nodes.some((n) => n.deleted)).toBe(true);
  });

  it('AC-20: 역직렬화 후 재접속 replay로 수렴한다', () => {
    const allOps = buildOps();
    const original = replicaFrom('A', allOps);
    // snapshot at version 10, then replay the rest
    const snapPoint = 10;
    const head = replicaFrom('A', allOps.slice(0, snapPoint));
    const restored = deserializeRga(serializeRga(head));
    for (const op of allOps.slice(snapPoint)) applyOp(restored, op);
    expect(toText(restored)).toBe(toText(original));
  });
});

// ─── Property-based 수렴 (시드 PRNG, 외부 의존성 0) ───────────────
describe('Property: 임의 도착 순서 수렴 (R01 방어)', () => {
  it('AC-9(일반화): 임의 op 시퀀스를 두 replica에 임의 순서로 배분해도 toText가 동일하다', () => {
    const rand = mulberry32(20260618);
    for (let trial = 0; trial < 300; trial++) {
      // 단일 사이트의 인과적으로 유효한 op 시퀀스를 생성한다.
      const ops: RgaOp[] = [];
      const liveIds: RgaId[] = [];
      const n = 4 + Math.floor(rand() * 8);
      let counter = 0;
      for (let i = 0; i < n; i++) {
        if (liveIds.length > 0 && rand() < 0.25) {
          // delete a random live node
          const idx = Math.floor(rand() * liveIds.length);
          const target = liveIds.splice(idx, 1)[0]!;
          ops.push({ type: 'delete', targetId: target });
        } else {
          counter += 1;
          const origin =
            liveIds.length === 0
              ? null
              : liveIds[Math.floor(rand() * liveIds.length)]!;
          const id = { counter, siteId: 'A' };
          ops.push(ins(counter, 'A', origin, String.fromCharCode(97 + (i % 26))));
          liveIds.push(id);
        }
      }
      const r1 = replicaFrom('A', shuffle(ops, rand));
      const r2 = replicaFrom('B', shuffle(ops, rand));
      expect(r1.pendingBuffer).toHaveLength(0);
      expect(toText(r1)).toBe(toText(r2));
    }
  });
});
