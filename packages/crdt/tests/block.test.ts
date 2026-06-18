import { describe, it, expect } from 'vitest';
import {
  createDocument,
  applyDocOp,
  docToBlocks,
  splitBlock,
  mergeBlockWithPrev,
  setBlockType,
  inheritType,
  createRga,
  makeBlockInsertOp,
  makeBlockDeleteOp,
  makeBlockSetTypeOp,
  makeInlineInsertOp,
  makeInlineDeleteOp,
} from '../src/index.js';
import { idKey } from '../src/id.js';
import type { DocState, AnyOp, BlockMeta, RgaId } from '../src/index.js';

// ─── 테스트 헬퍼 ──────────────────────────────────────────────────

/** createDocument의 자동 블록 없이 빈 문서를 만든다 (수렴 테스트용 공유 베이스). */
function emptyDoc(siteId: string): DocState {
  return {
    siteId,
    localClock: 0,
    blockRga: createRga<BlockMeta>(siteId),
    inlineRgas: new Map(),
    pendingInline: [],
    pendingSetType: [],
  };
}

function applyAll(doc: DocState, ops: AnyOp[]): DocState {
  for (const op of ops) applyDocOp(doc, op);
  return doc;
}

/** 문서에 블록 b를 추가하고 텍스트를 순서대로 삽입한다 (siteId 명시). */
function typeInto(doc: DocState, blockId: RgaId, text: string, site: string, startCounter: number): number {
  let prev: RgaId | null = null;
  let c = startCounter;
  for (const ch of text) {
    const id = { counter: c++, siteId: site };
    applyDocOp(doc, makeInlineInsertOp(id, prev, ch, blockId));
    prev = id;
  }
  return c;
}

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

// ─── 문서 구조 & 도출 ────────────────────────────────────────────
describe('createDocument / docToBlocks', () => {
  it('AC-1: createDocument는 빈 paragraph 블록 1개로 시작한다', () => {
    const doc = createDocument('siteA');
    const blocks = docToBlocks(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.type).toBe('paragraph');
    expect(blocks[0]!.text).toBe('');
    expect(blocks[0]!.id.siteId).toBe('siteA');
  });

  it('AC-2: docToBlocks는 외부 RGA 순서와 각 블록 텍스트를 도출한다', () => {
    const doc = createDocument('siteA');
    const b0 = docToBlocks(doc)[0]!.id;
    let c = typeInto(doc, b0, 'ab', 'siteA', 10);
    // b0 뒤에 heading1 블록 추가
    const h = { counter: c++, siteId: 'siteA' };
    applyDocOp(doc, makeBlockInsertOp(h, b0, 'heading1'));
    typeInto(doc, h, 'Hi', 'siteA', c);

    const blocks = docToBlocks(doc);
    expect(blocks.map((b) => ({ type: b.type, text: b.text }))).toEqual([
      { type: 'paragraph', text: 'ab' },
      { type: 'heading1', text: 'Hi' },
    ]);
  });
});

// ─── 블록 op 적용 ────────────────────────────────────────────────
describe('applyDocOp — 블록 op', () => {
  it('AC-3: block-insert는 외부 RGA에 삽입되고 빈 내부 인라인 RGA를 갖는다', () => {
    const doc = createDocument('siteA');
    const b0 = docToBlocks(doc)[0]!.id;
    const bullet = { counter: 5, siteId: 'siteB' };
    applyDocOp(doc, makeBlockInsertOp(bullet, b0, 'bullet'));

    const blocks = docToBlocks(doc);
    expect(blocks).toHaveLength(2);
    expect(blocks[1]!.type).toBe('bullet');
    expect(blocks[1]!.text).toBe('');

    // 내부 RGA 존재 → 인라인 삽입 가능
    applyDocOp(doc, makeInlineInsertOp({ counter: 6, siteId: 'siteB' }, null, 'x', bullet));
    expect(docToBlocks(doc)[1]!.text).toBe('x');
  });

  it('AC-4: block-delete는 tombstone 처리하며 멱등이다', () => {
    const doc = createDocument('siteA');
    const b0 = docToBlocks(doc)[0]!.id;
    const b1 = { counter: 5, siteId: 'siteA' };
    applyDocOp(doc, makeBlockInsertOp(b1, b0, 'paragraph'));
    expect(docToBlocks(doc)).toHaveLength(2);

    applyDocOp(doc, makeBlockDeleteOp(b1));
    const after1 = docToBlocks(doc);
    applyDocOp(doc, makeBlockDeleteOp(b1)); // 재적용
    const after2 = docToBlocks(doc);

    expect(after1).toHaveLength(1);
    expect(after2).toEqual(after1); // 멱등
    expect(after1.some((b) => idKey(b.id) === idKey(b1))).toBe(false);
  });

  it('AC-5: block-set-type은 (clock) LWW로 큰 clock 승자 타입을 채택한다', () => {
    const b1Site = 'siteA';
    const make = () => {
      const doc = createDocument(b1Site);
      const b1 = docToBlocks(doc)[0]!.id;
      return { doc, b1 };
    };
    const opLow = (b1: RgaId) => makeBlockSetTypeOp(b1, 'heading1', 1, 'siteA');
    const opHigh = (b1: RgaId) => makeBlockSetTypeOp(b1, 'heading2', 2, 'siteB');

    const a = make();
    applyDocOp(a.doc, opLow(a.b1));
    applyDocOp(a.doc, opHigh(a.b1));

    const b = make();
    applyDocOp(b.doc, opHigh(b.b1));
    applyDocOp(b.doc, opLow(b.b1));

    expect(docToBlocks(a.doc)[0]!.type).toBe('heading2');
    expect(docToBlocks(b.doc)[0]!.type).toBe('heading2'); // 순서 무관
  });

  it('AC-6: 동일 clock은 siteId 역순으로 tie-break한다', () => {
    const make = () => {
      const doc = createDocument('siteA');
      return { doc, b1: docToBlocks(doc)[0]!.id };
    };
    const opA = (b1: RgaId) => makeBlockSetTypeOp(b1, 'heading1', 3, 'siteA');
    const opB = (b1: RgaId) => makeBlockSetTypeOp(b1, 'heading3', 3, 'siteB');

    const a = make();
    applyDocOp(a.doc, opA(a.b1));
    applyDocOp(a.doc, opB(a.b1));

    const b = make();
    applyDocOp(b.doc, opB(b.b1));
    applyDocOp(b.doc, opA(b.b1));

    expect(docToBlocks(a.doc)[0]!.type).toBe('heading3'); // siteB > siteA
    expect(docToBlocks(b.doc)[0]!.type).toBe('heading3');
  });
});

// ─── 인라인 스코프 ───────────────────────────────────────────────
describe('applyDocOp — 인라인 blockId 스코프', () => {
  it('AC-7: 인라인 op는 지정 blockId 내부 RGA에만 적용된다', () => {
    const doc = createDocument('siteA');
    const b1 = docToBlocks(doc)[0]!.id;
    typeInto(doc, b1, 'a', 'siteA', 10);
    const b2 = { counter: 20, siteId: 'siteA' };
    applyDocOp(doc, makeBlockInsertOp(b2, b1, 'paragraph'));
    typeInto(doc, b2, 'z', 'siteA', 21);

    // b1에만 'X' 삽입 (b1의 'a' 다음)
    const b1Last = { counter: 10, siteId: 'siteA' };
    applyDocOp(doc, makeInlineInsertOp({ counter: 30, siteId: 'siteA' }, b1Last, 'X', b1));

    const blocks = docToBlocks(doc);
    expect(blocks[0]!.text).toBe('aX');
    expect(blocks[1]!.text).toBe('z'); // b2 불변
  });
});

// ─── 분할 / 병합 ─────────────────────────────────────────────────
describe('splitBlock / mergeBlockWithPrev / inheritType', () => {
  it('inheritType: heading1~3→paragraph, paragraph/bullet 유지 (Q1=A)', () => {
    expect(inheritType('heading1')).toBe('paragraph');
    expect(inheritType('heading2')).toBe('paragraph');
    expect(inheritType('heading3')).toBe('paragraph');
    expect(inheritType('paragraph')).toBe('paragraph');
    expect(inheritType('bullet')).toBe('bullet');
  });

  it('AC-8: splitBlock은 커서 이후 텍스트를 새 블록으로 옮긴다', () => {
    const doc = createDocument('siteA');
    const b0 = docToBlocks(doc)[0]!.id;
    typeInto(doc, b0, 'Hello', 'siteA', 10);

    const ops = splitBlock(doc, b0, 3);

    const blocks = docToBlocks(doc);
    expect(blocks.map((b) => b.text)).toEqual(['Hel', 'lo']);
    expect(ops.some((o) => o.type === 'block-insert')).toBe(true);
    expect(ops.filter((o) => o.type === 'delete')).toHaveLength(2); // 'l','o' 원본 삭제
    expect(ops.filter((o) => o.type === 'insert')).toHaveLength(2); // 새 블록 재삽입
  });

  it('AC-9: splitBlock 결과는 원격 replica에서 동일하게 수렴한다', () => {
    const author = createDocument('siteA');
    const b0 = docToBlocks(author)[0]!.id;
    typeInto(author, b0, 'Hello', 'siteA', 10);
    // 원격이 재현하려면 b0 생성·타이핑 op도 필요 → 전체 op 시퀀스를 수집
    const baseOps: AnyOp[] = [makeBlockInsertOp(b0, null, 'paragraph')];
    let prev: RgaId | null = null;
    let c = 10;
    for (const ch of 'Hello') {
      const id = { counter: c++, siteId: 'siteA' };
      baseOps.push(makeInlineInsertOp(id, prev, ch, b0));
      prev = id;
    }
    // author를 baseOps로 재구성한 뒤 split (localClock을 baseOps 이후로 맞춤)
    const a2 = emptyDoc('siteA');
    a2.localClock = c - 1;
    applyAll(a2, baseOps);
    const splitOps = splitBlock(a2, b0, 3);

    const allOps = [...baseOps, ...splitOps];
    const remote = emptyDoc('siteB');
    applyAll(remote, shuffle(allOps, mulberry32(7)));

    expect(docToBlocks(remote).map((b) => b.text)).toEqual(['Hel', 'lo']);
    expect(docToBlocks(remote).map((b) => b.text)).toEqual(docToBlocks(a2).map((b) => b.text));
  });

  it('AC-10: mergeBlockWithPrev는 이전 블록 끝에 텍스트를 붙이고 현재 블록을 삭제한다', () => {
    const doc = createDocument('siteA');
    const b0 = docToBlocks(doc)[0]!.id;
    let c = typeInto(doc, b0, 'foo', 'siteA', 10);
    const b1 = { counter: c++, siteId: 'siteA' };
    applyDocOp(doc, makeBlockInsertOp(b1, b0, 'paragraph'));
    typeInto(doc, b1, 'bar', 'siteA', c);

    const ops = mergeBlockWithPrev(doc, b1);

    const blocks = docToBlocks(doc);
    expect(blocks.map((b) => b.text)).toEqual(['foobar']);
    expect(ops).not.toBeNull();
    expect(ops!.some((o) => o.type === 'block-delete')).toBe(true);
    expect(ops!.filter((o) => o.type === 'insert')).toHaveLength(3); // 'b','a','r'
  });

  it('AC-11: 첫 블록 병합은 null을 반환하고 문서가 불변이다', () => {
    const doc = createDocument('siteA');
    const b0 = docToBlocks(doc)[0]!.id;
    const before = docToBlocks(doc);
    const res = mergeBlockWithPrev(doc, b0);
    expect(res).toBeNull();
    expect(docToBlocks(doc)).toEqual(before);
  });
});

// ─── CRDT 4속성 (2-level) ────────────────────────────────────────
describe('CRDT 4속성 (2-level 블록 RGA)', () => {
  it('AC-12: 동시 분할이 결정론적으로 수렴한다 (tie-break siteId 역순)', () => {
    const b0 = { counter: 1, siteId: 'seed' };
    const splitA = makeBlockInsertOp({ counter: 2, siteId: 'A' }, b0, 'paragraph');
    const splitB = makeBlockInsertOp({ counter: 2, siteId: 'B' }, b0, 'paragraph');
    const base = makeBlockInsertOp(b0, null, 'paragraph');

    const r1 = applyAll(emptyDoc('r1'), [base, splitA, splitB]);
    const r2 = applyAll(emptyDoc('r2'), [base, splitB, splitA]);

    expect(docToBlocks(r1)).toEqual(docToBlocks(r2));
    const ids = docToBlocks(r1).map((b) => idKey(b.id));
    expect(ids).toEqual(['1@seed', '2@B', '2@A']); // siteId B > A → B 먼저
  });

  it('AC-13: 인라인 op가 블록보다 먼저 도착하면 버퍼링 후 적용된다', () => {
    const doc = createDocument('siteA');
    const b0 = docToBlocks(doc)[0]!.id;
    const bX = { counter: 10, siteId: 'siteB' };

    // 인라인 먼저 (블록 bX 미도착)
    applyDocOp(doc, makeInlineInsertOp({ counter: 11, siteId: 'siteB' }, null, 'Z', bX));
    expect(docToBlocks(doc).some((b) => idKey(b.id) === idKey(bX))).toBe(false);
    expect(doc.pendingInline.length).toBe(1);

    // 블록 도착 → 드레인
    applyDocOp(doc, makeBlockInsertOp(bX, b0, 'paragraph'));
    const blk = docToBlocks(doc).find((b) => idKey(b.id) === idKey(bX));
    expect(blk?.text).toBe('Z');
    expect(doc.pendingInline.length).toBe(0);
  });

  it('AC-14: 임의 op 시퀀스를 임의 순서·중복 적용해도 두 replica가 수렴한다', () => {
    const rand = mulberry32(20260618);
    for (let trial = 0; trial < 120; trial++) {
      const ops: AnyOp[] = [];
      const blocks: RgaId[] = [];
      const inlinePerBlock = new Map<string, RgaId[]>();
      let counter = 0;
      const site = 'S';
      const n = 6 + Math.floor(rand() * 10);

      for (let i = 0; i < n; i++) {
        const r = rand();
        if (blocks.length === 0 || r < 0.3) {
          // block-insert
          counter += 1;
          const id = { counter, siteId: site };
          const origin = blocks.length === 0 ? null : blocks[Math.floor(rand() * blocks.length)]!;
          const types = ['paragraph', 'heading1', 'bullet'] as const;
          ops.push(makeBlockInsertOp(id, origin, types[Math.floor(rand() * types.length)]!));
          blocks.push(id);
          inlinePerBlock.set(idKey(id), []);
        } else if (r < 0.75) {
          // inline-insert into a random block
          const b = blocks[Math.floor(rand() * blocks.length)]!;
          const chars = inlinePerBlock.get(idKey(b))!;
          counter += 1;
          const id = { counter, siteId: site };
          const origin = chars.length === 0 ? null : chars[Math.floor(rand() * chars.length)]!;
          ops.push(makeInlineInsertOp(id, origin, String.fromCharCode(97 + (counter % 26)), b));
          chars.push(id);
        } else if (r < 0.88) {
          // set-type
          const b = blocks[Math.floor(rand() * blocks.length)]!;
          counter += 1;
          const types = ['paragraph', 'heading1', 'heading2', 'bullet'] as const;
          ops.push(makeBlockSetTypeOp(b, types[Math.floor(rand() * types.length)]!, counter, site));
        } else {
          // inline-delete a random live char
          const b = blocks[Math.floor(rand() * blocks.length)]!;
          const chars = inlinePerBlock.get(idKey(b))!;
          if (chars.length > 0) {
            const idx = Math.floor(rand() * chars.length);
            const target = chars.splice(idx, 1)[0]!;
            ops.push(makeInlineDeleteOp(target, b));
          }
        }
      }

      const dup = [...ops, ...shuffle(ops, rand).slice(0, 3)]; // 일부 중복
      const r1 = applyAll(emptyDoc('r1'), shuffle(dup, rand));
      const r2 = applyAll(emptyDoc('r2'), shuffle(dup, rand));

      expect(r1.pendingInline.length).toBe(0);
      expect(r1.pendingSetType.length).toBe(0);
      expect(docToBlocks(r1)).toEqual(docToBlocks(r2));
    }
  });
});
