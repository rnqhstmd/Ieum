import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { idKey } from '@ieum/crdt';
import type { EditorBlockView, RgaId } from '@ieum/crdt';
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

// 지정 블록의 caret을 offset 위치에 둔 selection을 모킹한다(getCaretOffset 입력 결정화).
// 텍스트 노드가 있으면 그 노드를 startContainer로, 없으면(빈 블록) rangeCount 0 → getCaretOffset이 fallback(=text.length=0).
// getCaretOffset는 el.contains(startContainer) 후 selectNodeContents(el)+setEnd(startContainer, offset)로 offset을 계산한다.
function mockCaret(node: HTMLElement, offset: number) {
  const textNode = node.firstChild;
  vi.spyOn(window, 'getSelection').mockReturnValue({
    rangeCount: textNode ? 1 : 0,
    getRangeAt: () => {
      const r = document.createRange();
      if (textNode) {
        r.setStart(textNode, offset);
        r.setEnd(textNode, offset);
      }
      return r;
    },
  } as unknown as Selection);
}

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
// caret offset은 mockCaret(node, offset)으로 결정화한다(jsdom은 레이아웃이 없어 focus()만으로 caret 위치가
// 비결정적). 빈 블록은 텍스트 노드가 없어 fallback(=text.length=0)으로 offset 0이 된다.

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

  // AC-2: 블록 끝(offset===length) + ArrowDown → 다음 블록으로 포커스 이동
  it('AC-2: block-1(text="hello") 끝 + ArrowDown → activeElement = block-2, prevented=true', () => {
    const { container } = render(
      <Editor
        blocks={[block(1, 'paragraph', 'hello'), block(2, 'paragraph', '')]}
        onBlockInput={vi.fn()}
      />,
    );
    const node1 = el(container, id(1));
    node1.focus();
    mockCaret(node1, 5); // caret at end
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

  // AC-4: 블록 끝(offset===length) + ArrowRight → 다음 블록으로 포커스 이동
  it('AC-4: block-1(text="hi") 끝 + ArrowRight → activeElement = block-2, prevented=true', () => {
    const { container } = render(
      <Editor
        blocks={[block(1, 'paragraph', 'hi'), block(2, 'paragraph', '')]}
        onBlockInput={vi.fn()}
      />,
    );
    const node1 = el(container, id(1));
    node1.focus();
    mockCaret(node1, 2); // caret at end ("hi".length)
    const prevented = !fireEvent.keyDown(node1, { key: 'ArrowRight' });
    expect(prevented).toBe(true);
    expect(document.activeElement).toBe(el(container, id(2)));
  });

  // AC-5: 중간 caret(offset 2, "hello") + ArrowDown → 이동 없음, prevented=false
  it('AC-5: block-1(text="hello") 중간 offset 2 + ArrowDown → 이동 없음, prevented=false', () => {
    const { container } = render(
      <Editor
        blocks={[block(1, 'paragraph', 'hello'), block(2, 'paragraph', '')]}
        onBlockInput={vi.fn()}
      />,
    );
    const node1 = el(container, id(1));
    expect(node1.firstChild).not.toBeNull(); // "hello" 텍스트 노드 존재 전제(중간 caret 재현)
    node1.focus();
    mockCaret(node1, 2); // 중간(0 < 2 < 5)
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

  // AC-7: 마지막 블록 끝(offset===length) + ArrowDown → 이동 없음(다음 블록 없음), prevented=false
  it('AC-7: 마지막 블록(text="x") 끝 + ArrowDown → activeElement 그대로, prevented=false', () => {
    const { container } = render(
      <Editor
        blocks={[block(1, 'paragraph', 'hello'), block(2, 'paragraph', 'x')]}
        onBlockInput={vi.fn()}
      />,
    );
    const node2 = el(container, id(2));
    node2.focus();
    mockCaret(node2, 1); // caret at end ("x".length) — 경계지만 다음 블록 없음
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

  // 회귀(cross-review/PR #29 gemini): placeCaret(atEnd=false) 직후 상태 — startContainer가 "요소 노드"(P)이고
  // offset 0 — 에서 ArrowUp을 누르면 이전 블록으로 복귀해야 한다. selectNodeContents+collapse(true)는 스펙상
  // startContainer를 요소 노드로 남기므로, getCaretOffset이 이 경우 offset 0을 정확히 계산해야 연속/역방향 탐색이 동작한다.
  it('회귀: 다음 블록 처음(요소노드 caret offset 0) 도착 후 ArrowUp → 이전 블록 복귀', () => {
    const { container } = render(
      <Editor
        blocks={[block(1, 'paragraph', 'hello'), block(2, 'paragraph', 'world')]}
        onBlockInput={vi.fn()}
      />,
    );
    const node2 = el(container, id(2));
    node2.focus();
    // placeCaret(el, atEnd=false) 직후 DOM 상태 모사: startContainer = 요소 노드 node2, offset 0.
    vi.spyOn(window, 'getSelection').mockReturnValue({
      rangeCount: 1,
      getRangeAt: () => {
        const r = document.createRange();
        r.setStart(node2, 0);
        r.setEnd(node2, 0);
        return r;
      },
    } as unknown as Selection);
    const prevented = !fireEvent.keyDown(node2, { key: 'ArrowUp' });
    expect(prevented).toBe(true);
    expect(document.activeElement).toBe(el(container, id(1)));
  });
});
