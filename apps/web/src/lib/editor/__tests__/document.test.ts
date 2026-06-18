import { describe, it, expect } from 'vitest';
import {
  createEmptyDocument,
  updateText,
  splitBlock,
  mergeWithPrevious,
  setType,
  applyMarkdownShortcut,
  type EditorBlock,
} from '@/src/lib/editor/document';

const block = (over: Partial<EditorBlock>): EditorBlock => ({
  id: 'b',
  type: 'paragraph',
  text: '',
  ...over,
});

describe('editor/document — 순수 블록 도큐먼트 모델', () => {
  // ── T1 ──
  it('AC-1: createEmptyDocument는 빈 paragraph 블록 1개를 반환한다', () => {
    const doc = createEmptyDocument();
    expect(doc).toHaveLength(1);
    expect(doc[0]!.type).toBe('paragraph');
    expect(doc[0]!.text).toBe('');
    expect(typeof doc[0]!.id).toBe('string');
    expect(doc[0]!.id.length).toBeGreaterThan(0);
  });

  it('AC-2: updateText는 대상 text만 바꾸고 새 배열을 반환한다(불변성)', () => {
    const doc = [block({ id: 'b1', text: 'a' }), block({ id: 'b2', text: 'b' })];
    const next = updateText(doc, 'b1', 'abc');
    expect(next.find((b) => b.id === 'b1')!.text).toBe('abc');
    expect(next.find((b) => b.id === 'b2')!.text).toBe('b');
    expect(next).not.toBe(doc);
    expect(doc[0]!.text).toBe('a'); // 원본 불변
  });

  // ── T2 ──
  it('AC-3: splitBlock(중간 캐럿)은 앞/뒤로 나누고 newBlockId를 반환한다', () => {
    const doc = [block({ id: 'b1', text: 'hello' })];
    const { doc: next, newBlockId } = splitBlock(doc, 'b1', 2);
    expect(next).toHaveLength(2);
    expect(next[0]!.id).toBe('b1');
    expect(next[0]!.text).toBe('he');
    expect(next[1]!.id).toBe(newBlockId);
    expect(next[1]!.text).toBe('llo');
  });

  it('AC-4: heading 블록 분할 시 새 블록은 paragraph, 원본 타입은 유지', () => {
    const doc = [block({ id: 'h', type: 'heading1', text: 'Title' })];
    const { doc: next } = splitBlock(doc, 'h', 5);
    expect(next[0]!.type).toBe('heading1');
    expect(next[1]!.type).toBe('paragraph');
  });

  it('AC-5: bullet 블록 분할 시 새 블록도 bullet', () => {
    const doc = [block({ id: 'li', type: 'bullet', text: 'item' })];
    const { doc: next } = splitBlock(doc, 'li', 4);
    expect(next[1]!.type).toBe('bullet');
  });

  // ── T3 ──
  it('AC-6: mergeWithPrevious는 이전 블록에 병합하고 캐럿 위치를 반환한다', () => {
    const doc = [block({ id: 'a', text: 'foo' }), block({ id: 'b', text: 'bar' })];
    const res = mergeWithPrevious(doc, 'b');
    expect(res).not.toBeNull();
    expect(res!.doc).toHaveLength(1);
    expect(res!.doc[0]!.id).toBe('a');
    expect(res!.doc[0]!.text).toBe('foobar');
    expect(res!.caretBlockId).toBe('a');
    expect(res!.caretOffset).toBe(3);
  });

  it('AC-7: 첫 블록에서 mergeWithPrevious는 null', () => {
    const doc = [block({ id: 'a', text: 'x' }), block({ id: 'b', text: 'y' })];
    expect(mergeWithPrevious(doc, 'a')).toBeNull();
  });

  it('AC-8: 빈 블록 Backspace는 그 블록을 삭제하고 이전 블록은 불변', () => {
    const doc = [block({ id: 'a', text: 'x' }), block({ id: 'b', text: '' })];
    const res = mergeWithPrevious(doc, 'b');
    expect(res!.doc).toHaveLength(1);
    expect(res!.doc[0]!.text).toBe('x');
    expect(res!.caretBlockId).toBe('a');
    expect(res!.caretOffset).toBe(1);
  });

  // ── T4 ──
  it('AC-9: setType은 타입만 바꾸고 text는 유지', () => {
    const doc = [block({ id: 'b', type: 'paragraph', text: 'hi' })];
    const next = setType(doc, 'b', 'heading2');
    expect(next[0]!.type).toBe('heading2');
    expect(next[0]!.text).toBe('hi');
  });

  it('AC-10: 마크다운 단축 "# "는 heading1으로 변환하고 접두사 제거', () => {
    const doc = [block({ id: 'b', text: '# Title' })];
    const next = applyMarkdownShortcut(doc, 'b');
    expect(next).not.toBeNull();
    expect(next![0]!.type).toBe('heading1');
    expect(next![0]!.text).toBe('Title');
  });

  it('AC-11: 마크다운 단축 "- "는 bullet으로 변환', () => {
    const doc = [block({ id: 'b', text: '- milk' })];
    const next = applyMarkdownShortcut(doc, 'b');
    expect(next![0]!.type).toBe('bullet');
    expect(next![0]!.text).toBe('milk');
  });

  it('AC-12: 마크다운 접두사가 없으면 null', () => {
    const doc = [block({ id: 'b', text: 'plain text' })];
    expect(applyMarkdownShortcut(doc, 'b')).toBeNull();
  });
});
