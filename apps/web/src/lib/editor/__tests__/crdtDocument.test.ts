import { describe, it, expect } from 'vitest';
import { createDocument, docToBlocks } from '@ieum/crdt';
import type { DocState, RgaId } from '@ieum/crdt';
import { diffBlockText, detectBlockTypeShortcut } from '../crdtDocument';

// T4 / AC-5: 블록 텍스트 old→new diff로 인라인 INSERT/DELETE op를 생성하고 로컬 적용한다.
function setup(): { doc: DocState; blockId: RgaId } {
  const doc = createDocument('site_a');
  const blockId = docToBlocks(doc)[0]!.id;
  return { doc, blockId };
}
function text(doc: DocState, blockId: RgaId): string {
  return docToBlocks(doc).find((b) => b.id === blockId)!.text;
}

describe('diffBlockText', () => {
  it('AC-5: 빈 블록에 한글 1글자 입력 → INSERT op 1개, 텍스트 반영', () => {
    const { doc, blockId } = setup();
    const ops = diffBlockText(doc, blockId, '', '안');
    expect(ops).toHaveLength(1);
    expect(ops[0]!.type).toBe('insert');
    expect(text(doc, blockId)).toBe('안');
  });

  it('끝에 한 글자 추가 → INSERT 1개', () => {
    const { doc, blockId } = setup();
    diffBlockText(doc, blockId, '', 'ab');
    const ops = diffBlockText(doc, blockId, 'ab', 'abc');
    expect(ops).toHaveLength(1);
    expect(ops[0]!.type).toBe('insert');
    expect(text(doc, blockId)).toBe('abc');
  });

  it('중간 삽입 → INSERT 1개', () => {
    const { doc, blockId } = setup();
    diffBlockText(doc, blockId, '', 'ac');
    const ops = diffBlockText(doc, blockId, 'ac', 'abc');
    expect(ops).toHaveLength(1);
    expect(text(doc, blockId)).toBe('abc');
  });

  it('한 글자 삭제 → DELETE 1개', () => {
    const { doc, blockId } = setup();
    diffBlockText(doc, blockId, '', 'abc');
    const ops = diffBlockText(doc, blockId, 'abc', 'ac');
    expect(ops).toHaveLength(1);
    expect(ops[0]!.type).toBe('delete');
    expect(text(doc, blockId)).toBe('ac');
  });

  it('치환(cat→cut) → DELETE 1 + INSERT 1', () => {
    const { doc, blockId } = setup();
    diffBlockText(doc, blockId, '', 'cat');
    const ops = diffBlockText(doc, blockId, 'cat', 'cut');
    const types = ops.map((o) => o.type).sort();
    expect(types).toEqual(['delete', 'insert']);
    expect(text(doc, blockId)).toBe('cut');
  });

  it('clamp 경계: "aa"→"aaa"는 INSERT 1개만 생성한다', () => {
    const { doc, blockId } = setup();
    diffBlockText(doc, blockId, '', 'aa');
    const ops = diffBlockText(doc, blockId, 'aa', 'aaa');
    expect(ops).toHaveLength(1);
    expect(ops[0]!.type).toBe('insert');
    expect(text(doc, blockId)).toBe('aaa');
  });

  it('멀티문자 붙여넣기: ""→"abc"는 INSERT 3개', () => {
    const { doc, blockId } = setup();
    const ops = diffBlockText(doc, blockId, '', 'abc');
    expect(ops).toHaveLength(3);
    expect(ops.every((o) => o.type === 'insert')).toBe(true);
    expect(text(doc, blockId)).toBe('abc');
  });

  it('변경 없음 → op 0개', () => {
    const { doc, blockId } = setup();
    diffBlockText(doc, blockId, '', 'x');
    const ops = diffBlockText(doc, blockId, 'x', 'x');
    expect(ops).toHaveLength(0);
    expect(text(doc, blockId)).toBe('x');
  });

  it('전체 삭제 → DELETE 2개, 빈 텍스트', () => {
    const { doc, blockId } = setup();
    diffBlockText(doc, blockId, '', 'hi');
    const ops = diffBlockText(doc, blockId, 'hi', '');
    expect(ops).toHaveLength(2);
    expect(ops.every((o) => o.type === 'delete')).toBe(true);
    expect(text(doc, blockId)).toBe('');
  });
});

// P9 / AC-B1~B4 단축키 파싱: detectBlockTypeShortcut
describe('detectBlockTypeShortcut', () => {
  it("'# ' → { type: 'heading1', consumed: 2 }", () => {
    expect(detectBlockTypeShortcut('# ')).toEqual({ type: 'heading1', consumed: 2 });
  });

  it("'## ' → { type: 'heading2', consumed: 3 }", () => {
    expect(detectBlockTypeShortcut('## ')).toEqual({ type: 'heading2', consumed: 3 });
  });

  it("'### ' → { type: 'heading3', consumed: 4 }", () => {
    expect(detectBlockTypeShortcut('### ')).toEqual({ type: 'heading3', consumed: 4 });
  });

  it("'- ' → { type: 'bullet', consumed: 2 }", () => {
    expect(detectBlockTypeShortcut('- ')).toEqual({ type: 'bullet', consumed: 2 });
  });

  it("'normal text' → null (미해당)", () => {
    expect(detectBlockTypeShortcut('normal text')).toBeNull();
  });

  it("'#텍스트' (공백 없음) → null", () => {
    expect(detectBlockTypeShortcut('#텍스트')).toBeNull();
  });

  it("빈 문자열 → null", () => {
    expect(detectBlockTypeShortcut('')).toBeNull();
  });

  it("'# ' prefix 뒤에 텍스트 있어도 heading1 감지", () => {
    expect(detectBlockTypeShortcut('# Hello')).toEqual({ type: 'heading1', consumed: 2 });
  });
});
