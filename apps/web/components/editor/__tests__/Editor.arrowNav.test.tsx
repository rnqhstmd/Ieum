import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { idKey } from '@ieum/crdt';
import type { EditorBlockView, RgaId } from '@ieum/crdt';
// resolveArrowDirection 는 아직 named export 안 됨 → import 실패로 RED
import Editor, { resolveArrowDirection } from '@/components/editor/Editor';

// ─── 헬퍼 ───────────────────────────────────────────────────────────────────
const id = (n: number): RgaId => ({ counter: n, siteId: 'A' });
const block = (n: number, type: EditorBlockView['type'], text: string): EditorBlockView => ({
  id: id(n),
  type,
  text,
});
const el = (container: HTMLElement, blockId: RgaId) =>
  container.querySelector(`[data-block-id="${idKey(blockId)}"]`) as HTMLElement;

// ─── 순수 함수 단위 테스트 ───────────────────────────────────────────────────
describe('resolveArrowDirection — 순수 함수', () => {
  it('ArrowUp + offset 0 → "prev"', () => {
    expect(resolveArrowDirection('ArrowUp', 0, 5)).toBe('prev');
  });

  it('ArrowLeft + offset 0 → "prev"', () => {
    expect(resolveArrowDirection('ArrowLeft', 0, 5)).toBe('prev');
  });

  it('ArrowDown + offset === textLength → "next"', () => {
    expect(resolveArrowDirection('ArrowDown', 5, 5)).toBe('next');
  });

  it('ArrowRight + offset === textLength → "next"', () => {
    expect(resolveArrowDirection('ArrowRight', 5, 5)).toBe('next');
  });

  it('중간 offset(0 < offset < length) → null (AC-5 핵심)', () => {
    expect(resolveArrowDirection('ArrowDown', 2, 5)).toBeNull();
    expect(resolveArrowDirection('ArrowUp', 2, 5)).toBeNull();
    expect(resolveArrowDirection('ArrowLeft', 3, 10)).toBeNull();
    expect(resolveArrowDirection('ArrowRight', 1, 4)).toBeNull();
  });

  it('비화살표 키 ("a", "Enter") → null', () => {
    expect(resolveArrowDirection('a', 0, 5)).toBeNull();
    expect(resolveArrowDirection('Enter', 0, 0)).toBeNull();
  });

  it('빈 블록(textLength 0): ArrowUp → "prev" (BR-5)', () => {
    expect(resolveArrowDirection('ArrowUp', 0, 0)).toBe('prev');
  });

  it('빈 블록(textLength 0): ArrowLeft → "prev" (BR-5)', () => {
    expect(resolveArrowDirection('ArrowLeft', 0, 0)).toBe('prev');
  });

  it('빈 블록(textLength 0): ArrowDown → "next" (BR-5)', () => {
    expect(resolveArrowDirection('ArrowDown', 0, 0)).toBe('next');
  });

  it('빈 블록(textLength 0): ArrowRight → "next" (BR-5)', () => {
    expect(resolveArrowDirection('ArrowRight', 0, 0)).toBe('next');
  });
});

// ─── handleKeyDown 통합 테스트 ───────────────────────────────────────────────
// jsdom 한계 노트:
//   getCaretOffset fallback → block.text.length 반환.
//   따라서 텍스트 있는 블록에 focus() → offset === text.length → 끝 위치.
//   offset 0 재현: 빈 블록(text="") 사용 (length 0 === offset 0).
//   중간 offset 재현: vi.spyOn(window,'getSelection') 모킹 필요.

describe('Editor — 화살표 블록 간 탐색 (handleKeyDown)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // AC-1: 빈 블록(offset 0) + ArrowUp → 이전 블록으로 포커스 이동
  it('AC-1: block-2(빈블록) focus + ArrowUp → activeElement = block-1, prevented=true', () => {
    const { container } = render(
      <Editor
        blocks={[block(1, 'paragraph', 'hello'), block(2, 'paragraph', '')]}
        onBlockInput={vi.fn()}
      />,
    );
    const node2 = el(container, id(2));
    node2.focus();
    const prevented = !fireEvent.keyDown(node2, { key: 'ArrowUp' });
    expect(prevented).toBe(true);
    expect(document.activeElement).toBe(el(container, id(1)));
  });

  // AC-2: 텍스트 있는 블록(fallback offset=length) + ArrowDown → 다음 블록으로 포커스 이동
  it('AC-2: block-1(text="hello") focus + ArrowDown → activeElement = block-2, prevented=true', () => {
    const { container } = render(
      <Editor
        blocks={[block(1, 'paragraph', 'hello'), block(2, 'paragraph', '')]}
        onBlockInput={vi.fn()}
      />,
    );
    const node1 = el(container, id(1));
    node1.focus();
    const prevented = !fireEvent.keyDown(node1, { key: 'ArrowDown' });
    expect(prevented).toBe(true);
    expect(document.activeElement).toBe(el(container, id(2)));
  });

  // AC-3: 빈 블록(offset 0) + ArrowLeft → 이전 블록으로 포커스 이동
  it('AC-3: block-2(빈블록) focus + ArrowLeft → activeElement = block-1, prevented=true', () => {
    const { container } = render(
      <Editor
        blocks={[block(1, 'paragraph', 'hello'), block(2, 'paragraph', '')]}
        onBlockInput={vi.fn()}
      />,
    );
    const node2 = el(container, id(2));
    node2.focus();
    const prevented = !fireEvent.keyDown(node2, { key: 'ArrowLeft' });
    expect(prevented).toBe(true);
    expect(document.activeElement).toBe(el(container, id(1)));
  });

  // AC-4: 텍스트 있는 블록(fallback offset=length) + ArrowRight → 다음 블록으로 포커스 이동
  it('AC-4: block-1(text="hi") focus + ArrowRight → activeElement = block-2, prevented=true', () => {
    const { container } = render(
      <Editor
        blocks={[block(1, 'paragraph', 'hi'), block(2, 'paragraph', '')]}
        onBlockInput={vi.fn()}
      />,
    );
    const node1 = el(container, id(1));
    node1.focus();
    const prevented = !fireEvent.keyDown(node1, { key: 'ArrowRight' });
    expect(prevented).toBe(true);
    expect(document.activeElement).toBe(el(container, id(2)));
  });

  // AC-5: 중간 caret(offset 2, "hello") + ArrowDown → 이동 없음, prevented=false
  it('AC-5: block-1(text="hello") + 중간 offset 2 + ArrowDown → 이동 없음, prevented=false', () => {
    const { container } = render(
      <Editor
        blocks={[block(1, 'paragraph', 'hello'), block(2, 'paragraph', '')]}
        onBlockInput={vi.fn()}
      />,
    );
    const node1 = el(container, id(1));
    node1.focus();
    // getCaretOffset의 el.contains 가드를 충족하도록 node1 내부의 "실제" 텍스트 노드를 startContainer로 쓴다.
    // getCaretOffset는 cloneRange()→selectNodeContents(el)→setEnd(textNode, 2)→toString().length 로 offset 2를 계산한다.
    const textNode = node1.firstChild as Node; // "hello" 텍스트 노드
    vi.spyOn(window, 'getSelection').mockReturnValue({
      rangeCount: 1,
      getRangeAt: () => {
        const r = document.createRange();
        r.setStart(textNode, 2);
        r.setEnd(textNode, 2);
        return r;
      },
    } as unknown as Selection);
    const prevented = !fireEvent.keyDown(node1, { key: 'ArrowDown' });
    expect(prevented).toBe(false);
    expect(document.activeElement).toBe(node1); // 이동 없음
  });

  // AC-6: 첫 번째 블록(빈) + ArrowUp → 이동 없음(이전 블록 없음), prevented=false
  it('AC-6: 첫 블록(빈) focus + ArrowUp → activeElement 그대로, prevented=false', () => {
    const { container } = render(
      <Editor
        blocks={[block(1, 'paragraph', ''), block(2, 'paragraph', 'world')]}
        onBlockInput={vi.fn()}
      />,
    );
    const node1 = el(container, id(1));
    node1.focus();
    const prevented = !fireEvent.keyDown(node1, { key: 'ArrowUp' });
    expect(prevented).toBe(false);
    expect(document.activeElement).toBe(node1);
  });

  // AC-7: 마지막 블록(fallback offset=length) + ArrowDown → 이동 없음(다음 블록 없음), prevented=false
  it('AC-7: 마지막 블록(text="x") focus + ArrowDown → activeElement 그대로, prevented=false', () => {
    const { container } = render(
      <Editor
        blocks={[block(1, 'paragraph', 'hello'), block(2, 'paragraph', 'x')]}
        onBlockInput={vi.fn()}
      />,
    );
    const node2 = el(container, id(2));
    node2.focus();
    const prevented = !fireEvent.keyDown(node2, { key: 'ArrowDown' });
    expect(prevented).toBe(false);
    expect(document.activeElement).toBe(node2);
  });

  // AC-8: 단일 블록 focus + ArrowUp → 이동 없음, prevented=false
  it('AC-8a: 단일 블록 focus + ArrowUp → activeElement 동일, prevented=false', () => {
    const { container } = render(
      <Editor
        blocks={[block(1, 'paragraph', '')]}
        onBlockInput={vi.fn()}
      />,
    );
    const node1 = el(container, id(1));
    node1.focus();
    const prevented = !fireEvent.keyDown(node1, { key: 'ArrowUp' });
    expect(prevented).toBe(false);
    expect(document.activeElement).toBe(node1);
  });

  it('AC-8b: 단일 블록 focus + ArrowLeft → activeElement 동일, prevented=false', () => {
    const { container } = render(
      <Editor
        blocks={[block(1, 'paragraph', '')]}
        onBlockInput={vi.fn()}
      />,
    );
    const node1 = el(container, id(1));
    node1.focus();
    const prevented = !fireEvent.keyDown(node1, { key: 'ArrowLeft' });
    expect(prevented).toBe(false);
    expect(document.activeElement).toBe(node1);
  });

  // AC-9: 빈 블록(offset 0) + ArrowDown → 다음 블록으로 포커스 이동
  it('AC-9: block-1(빈블록) focus + ArrowDown → activeElement = block-2, prevented=true', () => {
    const { container } = render(
      <Editor
        blocks={[block(1, 'paragraph', ''), block(2, 'paragraph', 'world')]}
        onBlockInput={vi.fn()}
      />,
    );
    const node1 = el(container, id(1));
    node1.focus();
    const prevented = !fireEvent.keyDown(node1, { key: 'ArrowDown' });
    expect(prevented).toBe(true);
    expect(document.activeElement).toBe(el(container, id(2)));
  });

  // AC-10: IME 조합 중 ArrowUp → 이동 없음, prevented=false
  it('AC-10: block-2(빈블록) focus + compositionStart 후 ArrowUp → 이동 없음, prevented=false', () => {
    const { container } = render(
      <Editor
        blocks={[block(1, 'paragraph', 'hello'), block(2, 'paragraph', '')]}
        onBlockInput={vi.fn()}
      />,
    );
    const node2 = el(container, id(2));
    node2.focus();
    fireEvent.compositionStart(node2);
    const prevented = !fireEvent.keyDown(node2, { key: 'ArrowUp' });
    expect(prevented).toBe(false);
    expect(document.activeElement).toBe(node2); // 이동 없음
  });
});
